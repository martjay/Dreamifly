import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { modelAlertRules, modelUsageStats, user } from '@/db/schema'
import { desc, eq, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { ALL_MODELS } from '@/utils/modelConfig'
import {
  getModelAlertTargetKey,
  getModelAlertTargetOrder,
  isConfigurableModelAlertTarget,
  MODEL_ALERT_TARGETS,
  MODERATION_ALERT_MODEL_NAME,
} from '@/utils/modelAlertTargets'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type ModelOption = {
  modelName: string
  displayName: string
  modelType: string
  totalCalls: number
  lastUsedAt: Date | null
}

async function checkAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    return { error: '未授权，请先登录', status: 401 }
  }

  const currentUser = await db
    .select()
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)

  if (currentUser.length === 0 || !currentUser[0].isAdmin) {
    return { error: '无权限访问，需要管理员权限', status: 403 }
  }

  return { error: null, status: null }
}

function normalizeStringArray(value: unknown): string[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,，;；]+/)
      : []

  return Array.from(
    new Set(
      rawItems
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function normalizeInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function validateRulePayload(body: any) {
  const name = typeof body.name === 'string' && body.name.trim()
    ? body.name.trim().slice(0, 80)
    : '模型预警规则'
  const modelNames = normalizeStringArray(body.modelNames)
  const modelTypes = normalizeStringArray(body.modelTypes)
  const emails = normalizeStringArray(body.emails).map((email) => email.toLowerCase())
  const consecutiveFailureCount = normalizeInteger(body.consecutiveFailureCount ?? body.minCalls, 50)
  const isEnabled = body.isEnabled === undefined ? true : Boolean(body.isEnabled)

  if (consecutiveFailureCount < 1 || consecutiveFailureCount > 10000) {
    return { error: '连续失败次数必须在 1 到 10000 之间' }
  }

  if (modelNames.length !== 1 || modelTypes.length !== 1) {
    return { error: '预警规则必须绑定一个支持的模型' }
  }

  if (!isConfigurableModelAlertTarget(modelNames[0], modelTypes[0])) {
    return { error: '该模型不支持配置预警' }
  }

  if (emails.length === 0 || emails.length > 20) {
    return { error: '通知邮箱数量必须在 1 到 20 个之间' }
  }

  if (emails.some((email) => !EMAIL_REGEX.test(email))) {
    return { error: '通知邮箱格式不正确' }
  }

  return {
    data: {
      name,
      modelNames,
      modelTypes,
      failureRateThreshold: 100,
      sampleSize: consecutiveFailureCount,
      minCalls: consecutiveFailureCount,
      cooldownMinutes: 1,
      emails,
      isEnabled,
    },
  }
}

function validateBatchRow(body: any) {
  const id = typeof body.id === 'string' ? body.id : null
  const modelName = typeof body.modelName === 'string' ? body.modelName.trim() : ''
  const modelType = typeof body.modelType === 'string' ? body.modelType.trim() : ''
  const displayName = typeof body.displayName === 'string' && body.displayName.trim()
    ? body.displayName.trim()
    : modelName
  const emails = normalizeStringArray(body.emails).map((email) => email.toLowerCase())
  const consecutiveFailureCount = normalizeInteger(body.consecutiveFailureCount ?? body.minCalls, 50)
  const isEnabled = Boolean(body.isEnabled)

  if (!modelName || !modelType) {
    return { error: '模型参数不能为空' }
  }

  if (!isConfigurableModelAlertTarget(modelName, modelType)) {
    return { error: `${displayName} 不支持配置预警` }
  }

  if (consecutiveFailureCount < 1 || consecutiveFailureCount > 10000) {
    return { error: `${displayName} 的连续失败次数必须在 1 到 10000 之间` }
  }

  if (isEnabled && (emails.length === 0 || emails.length > 20)) {
    return { error: `${displayName} 的通知邮箱数量必须在 1 到 20 个之间` }
  }

  if (emails.some((email) => !EMAIL_REGEX.test(email))) {
    return { error: `${displayName} 的通知邮箱格式不正确` }
  }

  return {
    data: {
      id,
      name: `${displayName} 预警`,
      modelNames: [modelName],
      modelTypes: [modelType],
      failureRateThreshold: 100,
      sampleSize: consecutiveFailureCount,
      minCalls: consecutiveFailureCount,
      cooldownMinutes: 1,
      emails,
      isEnabled,
    },
  }
}

function isMissingTableError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: string }).code === '42P01'
}

function getLatestDate(current: Date | null, next: Date | null): Date | null {
  if (!current) return next
  if (!next) return current
  return current.getTime() >= next.getTime() ? current : next
}

async function getModelOptions(): Promise<ModelOption[]> {
  const options = new Map<string, ModelOption>()
  const imageModelMap = new Map(ALL_MODELS.map((model) => [model.id, model]))

  for (const target of MODEL_ALERT_TARGETS) {
    const model = target.modelType === 'image_generation'
      ? imageModelMap.get(target.modelName)
      : null

    options.set(getModelAlertTargetKey(target.modelName, target.modelType), {
      modelName: target.modelName,
      displayName: model?.name || target.modelName,
      modelType: target.modelType,
      totalCalls: 0,
      lastUsedAt: null,
    })
  }

  const observedModels = await db
    .select({
      modelName: modelUsageStats.modelName,
      modelType: modelUsageStats.modelType,
      totalCalls: sql<number>`count(*)::int`,
      lastUsedAt: sql<Date>`max(${modelUsageStats.createdAt})`,
    })
    .from(modelUsageStats)
    .groupBy(modelUsageStats.modelName, modelUsageStats.modelType)

  for (const model of observedModels) {
    if (model.modelType === 'moderation') {
      const key = getModelAlertTargetKey(MODERATION_ALERT_MODEL_NAME, 'moderation')
      const existing = options.get(key)
      if (!existing) continue

      options.set(key, {
        ...existing,
        totalCalls: existing.totalCalls + Number(model.totalCalls || 0),
        lastUsedAt: getLatestDate(existing.lastUsedAt, model.lastUsedAt),
      })
      continue
    }

    const key = getModelAlertTargetKey(model.modelName, model.modelType)
    const existing = options.get(key)
    if (!existing) continue

    options.set(key, {
      ...existing,
      totalCalls: Number(model.totalCalls || 0),
      lastUsedAt: model.lastUsedAt,
    })
  }

  return Array.from(options.values()).sort((a, b) => {
    const orderA = getModelAlertTargetOrder(a.modelName, a.modelType)
    const orderB = getModelAlertTargetOrder(b.modelName, b.modelType)
    if (orderA !== orderB) return orderA - orderB
    return a.displayName.localeCompare(b.displayName)
  })
}

export async function PUT(request: NextRequest) {
  try {
    const adminCheck = await checkAdmin()
    if (adminCheck.error) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status! })
    }

    const body = await request.json()
    const rows = Array.isArray(body.rows) ? body.rows : []
    const savedRules: Array<typeof modelAlertRules.$inferSelect> = []

    for (const row of rows) {
      const result = validateBatchRow(row)
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      const data = result.data!

      if (!data.id && !data.isEnabled) continue

      if (data.id) {
        const [rule] = await db
          .update(modelAlertRules)
          .set({
            name: data.name,
            modelNames: data.modelNames,
            modelTypes: data.modelTypes,
            failureRateThreshold: data.failureRateThreshold,
            sampleSize: data.sampleSize,
            minCalls: data.minCalls,
            cooldownMinutes: data.cooldownMinutes,
            emails: data.emails,
            isEnabled: data.isEnabled,
            updatedAt: new Date(),
          })
          .where(eq(modelAlertRules.id, data.id))
          .returning()

        if (rule) savedRules.push(rule)
        continue
      }

      const [rule] = await db
        .insert(modelAlertRules)
        .values({
          id: randomUUID(),
          name: data.name,
          modelNames: data.modelNames,
          modelTypes: data.modelTypes,
          failureRateThreshold: data.failureRateThreshold,
          sampleSize: data.sampleSize,
          minCalls: data.minCalls,
          cooldownMinutes: data.cooldownMinutes,
          emails: data.emails,
          isEnabled: data.isEnabled,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()

      savedRules.push(rule)
    }

    return NextResponse.json({ rules: savedRules })
  } catch (error) {
    console.error('Error saving model alert rules:', error)
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: '预警规则表未创建' }, { status: 500 })
    }
    return NextResponse.json({ error: '保存预警规则失败' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const adminCheck = await checkAdmin()
    if (adminCheck.error) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status! })
    }

    const modelOptions = await getModelOptions()
    let isRuleTableReady = true
    let rules: Array<typeof modelAlertRules.$inferSelect> = []

    try {
      rules = await db
        .select()
        .from(modelAlertRules)
        .orderBy(desc(modelAlertRules.createdAt))
    } catch (error) {
      if (!isMissingTableError(error)) throw error
      isRuleTableReady = false
    }

    return NextResponse.json({ rules, modelOptions, isRuleTableReady })
  } catch (error) {
    console.error('Error fetching model alert rules:', error)
    return NextResponse.json({ error: '获取预警规则失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await checkAdmin()
    if (adminCheck.error) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status! })
    }

    const body = await request.json()
    const result = validateRulePayload(body)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const [rule] = await db
      .insert(modelAlertRules)
      .values({
        id: randomUUID(),
        ...result.data!,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()

    return NextResponse.json({ rule }, { status: 201 })
  } catch (error) {
    console.error('Error creating model alert rule:', error)
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: '预警规则表未创建' }, { status: 500 })
    }
    return NextResponse.json({ error: '创建预警规则失败' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const adminCheck = await checkAdmin()
    if (adminCheck.error) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status! })
    }

    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) {
      return NextResponse.json({ error: '规则ID不能为空' }, { status: 400 })
    }

    const result = validateRulePayload(body)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const [rule] = await db
      .update(modelAlertRules)
      .set({
        ...result.data!,
        updatedAt: new Date(),
      })
      .where(eq(modelAlertRules.id, id))
      .returning()

    if (!rule) {
      return NextResponse.json({ error: '预警规则不存在' }, { status: 404 })
    }

    return NextResponse.json({ rule })
  } catch (error) {
    console.error('Error updating model alert rule:', error)
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: '预警规则表未创建' }, { status: 500 })
    }
    return NextResponse.json({ error: '更新预警规则失败' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const adminCheck = await checkAdmin()
    if (adminCheck.error) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status! })
    }

    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: '规则ID不能为空' }, { status: 400 })
    }

    await db
      .delete(modelAlertRules)
      .where(eq(modelAlertRules.id, id))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting model alert rule:', error)
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: '预警规则表未创建' }, { status: 500 })
    }
    return NextResponse.json({ error: '删除预警规则失败' }, { status: 500 })
  }
}
