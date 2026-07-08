import { db } from '@/db'
import { modelAlertRules, modelUsageStats } from '@/db/schema'
import { sendEmail } from '@/lib/email'
import { and, desc, eq, sql } from 'drizzle-orm'
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

type LatestFailureCall = {
  createdAt: Date
  responseTime: number
  errorCode: string | null
  errorStage: string | null
  errorStatusCode: number | null
  errorMessage: string | null
  errorDetail: string | null
}

const ERROR_STAGE_LABELS: Record<string, string> = {
  generation: '模型生成',
  request: '请求上游服务',
  response_parse: '解析上游响应',
  upload: '上传文件',
  save_work: '保存作品',
}

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

function formatErrorSummary(latestFailure: LatestFailureCall | null | undefined): string {
  if (!latestFailure) return '-'
  const message = latestFailure.errorMessage || '模型调用失败'
  return latestFailure.errorStatusCode
    ? `${latestFailure.errorStatusCode} ${message}`
    : message
}

function formatErrorStage(stage: string | null | undefined): string {
  if (!stage) return '-'
  return ERROR_STAGE_LABELS[stage] || stage
}

function formatErrorDetail(detail: string | null | undefined): string {
  if (!detail) return '-'
  return detail.length > 300 ? `${detail.slice(0, 300)}...` : detail
}

function formatResponseTime(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '-'
  return `${seconds.toFixed(2)} 秒`
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
  latestFailure: LatestFailureCall | null
}): string {
  const errorSummary = formatErrorSummary(params.latestFailure)
  const errorStage = formatErrorStage(params.latestFailure?.errorStage)
  const errorCode = params.latestFailure?.errorCode || '-'
  const errorDetail = formatErrorDetail(params.latestFailure?.errorDetail)
  const responseTime = formatResponseTime(params.latestFailure?.responseTime)

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
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-size:14px;">最近失败耗时</td>
                  <td style="padding:10px 0;color:#111827;font-size:14px;">${escapeHtml(responseTime)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-size:14px;">最近失败原因</td>
                  <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(errorSummary)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-size:14px;">失败阶段</td>
                  <td style="padding:10px 0;color:#111827;font-size:14px;">${escapeHtml(errorStage)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-size:14px;">错误类型</td>
                  <td style="padding:10px 0;color:#111827;font-size:14px;">${escapeHtml(errorCode)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#6b7280;font-size:14px;vertical-align:top;">原始信息</td>
                  <td style="padding:10px 0;color:#374151;font-size:13px;line-height:1.6;">${escapeHtml(errorDetail)}</td>
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

function buildSuccessAfterLastTriggerCondition(params: EvaluateModelAlertParams) {
  const targetCondition = params.modelType === 'moderation'
    ? sql`${modelUsageStats.modelType} = ${params.modelType}`
    : sql`${modelUsageStats.modelName} = ${params.modelName}
        and ${modelUsageStats.modelType} = ${params.modelType}`

  return sql`exists (
    select 1
    from ${modelUsageStats}
    where ${targetCondition}
      and ${modelUsageStats.isSuccess} = true
      and timezone('UTC', ${modelUsageStats.createdAt}) > ${modelAlertRules.lastTriggeredAt}
    limit 1
  )`
}

async function reserveAlertTrigger(rule: AlertRule, params: EvaluateModelAlertParams, reservedAt: Date): Promise<boolean> {
  const [reservedRule] = await db
    .update(modelAlertRules)
    .set({
      lastTriggeredAt: reservedAt,
      updatedAt: reservedAt,
    })
    .where(and(
      eq(modelAlertRules.id, rule.id),
      sql`(
        ${modelAlertRules.lastTriggeredAt} is null
        or ${buildSuccessAfterLastTriggerCondition(params)}
      )`
    ))
    .returning({ id: modelAlertRules.id })

  return Boolean(reservedRule)
}

async function restoreAlertTrigger(rule: AlertRule, reservedAt: Date): Promise<void> {
  await db
    .update(modelAlertRules)
    .set({
      lastTriggeredAt: rule.lastTriggeredAt,
      updatedAt: new Date(),
    })
    .where(and(
      eq(modelAlertRules.id, rule.id),
      eq(modelAlertRules.lastTriggeredAt, reservedAt)
    ))
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

    for (const rule of rules) {
      if (!matchesRule(rule, params)) continue

      const emails = toStringArray(rule.emails)
      if (emails.length === 0) continue

      const consecutiveFailureCount = Math.max(Math.min(rule.minCalls, 10000), 1)

      const latestCalls = await db
        .select({
          isSuccess: modelUsageStats.isSuccess,
          createdAt: modelUsageStats.createdAt,
          responseTime: modelUsageStats.responseTime,
          errorCode: modelUsageStats.errorCode,
          errorStage: modelUsageStats.errorStage,
          errorStatusCode: modelUsageStats.errorStatusCode,
          errorMessage: modelUsageStats.errorMessage,
          errorDetail: modelUsageStats.errorDetail,
        })
        .from(modelUsageStats)
        .where(buildUsageWhere(params))
        .orderBy(desc(modelUsageStats.createdAt))
        .limit(consecutiveFailureCount)

      if (latestCalls.length < consecutiveFailureCount) continue
      if (latestCalls.some((call) => call.isSuccess)) continue

      const displayModelName = params.modelType === 'moderation'
        ? MODERATION_ALERT_MODEL_NAME
        : params.modelName
      const reservedAt = new Date()
      const reserved = await reserveAlertTrigger(rule, params, reservedAt)
      if (!reserved) continue

      const html = buildAlertEmailHtml({
        rule,
        modelName: displayModelName,
        modelType: params.modelType,
        consecutiveFailureCount,
        latestFailureAt: latestCalls[0]?.createdAt ?? null,
        latestFailure: latestCalls[0] ?? null,
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
        await restoreAlertTrigger(rule, reservedAt)
        continue
      }
    }
  } catch (error) {
    console.error('Failed to evaluate model alert rules:', error)
  }
}
