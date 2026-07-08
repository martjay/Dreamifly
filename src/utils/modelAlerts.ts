import { db } from '@/db'
import { modelAlertRules, modelUsageStats } from '@/db/schema'
import { sendEmail } from '@/lib/email'
import { and, desc, eq } from 'drizzle-orm'
import type { ModelUsageType } from '@/utils/modelUsageStats'
import {
  MODERATION_ALERT_MODEL_NAME,
  shouldEvaluateModelAlertTarget,
} from '@/utils/modelAlertTargets'

type EvaluateModelAlertParams = {
  modelName: string
  modelType: ModelUsageType
  isSuccess: boolean
}

type AlertRule = typeof modelAlertRules.$inferSelect

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function matchesRule(rule: AlertRule, params: EvaluateModelAlertParams): boolean {
  const modelNames = toStringArray(rule.modelNames)
  const modelTypes = toStringArray(rule.modelTypes)
  const matchesModel = params.modelType === 'moderation'
    ? modelNames.length === 1 && modelNames[0] === MODERATION_ALERT_MODEL_NAME
    : modelNames.length === 1 && modelNames.includes(params.modelName)
  const matchesType = modelTypes.length === 1 && modelTypes.includes(params.modelType)

  return matchesModel && matchesType
}

function buildAlertEmailHtml(params: {
  rule: AlertRule
  modelName: string
  modelType: ModelUsageType
  consecutiveFailureCount: number
  latestFailureAt: Date | string | null
}): string {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>模型预警通知</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 12px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#f59e0b 0%,#f97316 100%);padding:28px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Dreamifly 模型预警</h1>
              <p style="margin:8px 0 0;color:#fff7ed;font-size:14px;">模型连续失败达到预警阈值</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-size:14px;width:150px;">规则名称</td>
                  <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(params.rule.name)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-size:14px;">模型</td>
                  <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(params.modelName)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-size:14px;">模型类型</td>
                  <td style="padding:10px 0;color:#111827;font-size:14px;">${escapeHtml(params.modelType)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-size:14px;">连续失败次数</td>
                  <td style="padding:10px 0;color:#dc2626;font-size:18px;font-weight:700;">${params.consecutiveFailureCount} 次</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-size:14px;">最近失败时间</td>
                  <td style="padding:10px 0;color:#111827;font-size:14px;">${formatDate(params.latestFailureAt)}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

function buildUsageWhere(params: EvaluateModelAlertParams, isSuccess?: boolean) {
  const conditions = params.modelType === 'moderation'
    ? [eq(modelUsageStats.modelType, params.modelType)]
    : [
        eq(modelUsageStats.modelName, params.modelName),
        eq(modelUsageStats.modelType, params.modelType),
      ]

  if (typeof isSuccess === 'boolean') {
    conditions.push(eq(modelUsageStats.isSuccess, isSuccess))
  }

  return and(...conditions)
}

async function wasTriggeredSinceLastSuccess(rule: AlertRule, params: EvaluateModelAlertParams): Promise<boolean> {
  if (!rule.lastTriggeredAt) return false

  const [latestSuccess] = await db
    .select({ createdAt: modelUsageStats.createdAt })
    .from(modelUsageStats)
    .where(buildUsageWhere(params, true))
    .orderBy(desc(modelUsageStats.createdAt))
    .limit(1)

  if (!latestSuccess) return true
  return rule.lastTriggeredAt.getTime() >= latestSuccess.createdAt.getTime()
}

function getEmailFailureReason(reason: unknown): string {
  if (reason instanceof Error) return reason.message
  if (typeof reason === 'string') return reason

  try {
    return JSON.stringify(reason)
  } catch {
    return 'unknown error'
  }
}

function collectEmailFailures(
  results: PromiseSettledResult<unknown>[],
  emails: string[],
  attempt: number
) {
  return results.flatMap((result, index) => {
    if (result.status === 'fulfilled') return []

    return [{
      email: emails[index],
      attempt,
      reason: getEmailFailureReason(result.reason),
    }]
  })
}

async function sendAlertEmails(params: {
  emails: string[]
  subject: string
  html: string
  ruleId: string
  modelName: string
}): Promise<boolean> {
  const sendAll = () => Promise.allSettled(
    params.emails.map((email) =>
      sendEmail({
        to: email,
        subject: params.subject,
        html: params.html,
      })
    )
  )

  const firstResults = await sendAll()
  const firstSuccessCount = firstResults.filter((result) => result.status === 'fulfilled').length
  const firstFailures = collectEmailFailures(firstResults, params.emails, 1)

  if (firstFailures.length > 0) {
    console.error('Model alert email send failures:', {
      ruleId: params.ruleId,
      modelName: params.modelName,
      failures: firstFailures,
    })
  }

  if (firstSuccessCount > 0) return true

  console.warn('Model alert emails all failed, retrying once:', {
    ruleId: params.ruleId,
    modelName: params.modelName,
    emailCount: params.emails.length,
  })

  const retryResults = await sendAll()
  const retrySuccessCount = retryResults.filter((result) => result.status === 'fulfilled').length
  const retryFailures = collectEmailFailures(retryResults, params.emails, 2)

  if (retryFailures.length > 0) {
    console.error('Model alert email retry failures:', {
      ruleId: params.ruleId,
      modelName: params.modelName,
      failures: retryFailures,
    })
  }

  return retrySuccessCount > 0
}

export async function evaluateModelAlertRules(params: EvaluateModelAlertParams): Promise<void> {
  if (!params.modelName || params.isSuccess) return
  if (!shouldEvaluateModelAlertTarget(params.modelName, params.modelType)) return

  try {
    const rules = await db
      .select()
      .from(modelAlertRules)
      .where(eq(modelAlertRules.isEnabled, true))

    if (rules.length === 0) return

    const now = new Date()

    for (const rule of rules) {
      if (!matchesRule(rule, params)) continue

      const emails = toStringArray(rule.emails)
      if (emails.length === 0) continue

      const consecutiveFailureCount = Math.max(Math.min(rule.minCalls, 10000), 1)

      const latestCalls = await db
        .select({
          isSuccess: modelUsageStats.isSuccess,
          createdAt: modelUsageStats.createdAt,
        })
        .from(modelUsageStats)
        .where(buildUsageWhere(params))
        .orderBy(desc(modelUsageStats.createdAt))
        .limit(consecutiveFailureCount)

      if (latestCalls.length < consecutiveFailureCount) continue
      if (latestCalls.some((call) => call.isSuccess)) continue
      if (await wasTriggeredSinceLastSuccess(rule, params)) continue

      const displayModelName = params.modelType === 'moderation'
        ? MODERATION_ALERT_MODEL_NAME
        : params.modelName

      const html = buildAlertEmailHtml({
        rule,
        modelName: displayModelName,
        modelType: params.modelType,
        consecutiveFailureCount,
        latestFailureAt: latestCalls[0]?.createdAt ?? null,
      })

      const emailSent = await sendAlertEmails({
        emails,
        subject: `Dreamifly 模型预警：${displayModelName} 连续失败 ${consecutiveFailureCount} 次`,
        html,
        ruleId: rule.id,
        modelName: displayModelName,
      })

      if (!emailSent) {
        console.error('Model alert emails all failed after retry, skip trigger mark:', {
          ruleId: rule.id,
          modelName: displayModelName,
        })
        continue
      }

      await db
        .update(modelAlertRules)
        .set({
          lastTriggeredAt: now,
          updatedAt: now,
        })
        .where(eq(modelAlertRules.id, rule.id))
    }
  } catch (error) {
    console.error('Failed to evaluate model alert rules:', error)
  }
}
