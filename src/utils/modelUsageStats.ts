import { randomUUID } from 'crypto'
import { db } from '@/db'
import { modelUsageStats } from '@/db/schema'
import { evaluateModelAlertRules } from '@/utils/modelAlerts'
import { normalizeModelUsageError } from '@/utils/modelUsageError'

export type ModelUsageType = 'image_generation' | 'video_generation' | 'moderation' | 'prompt_optimization'

type RecordModelUsageParams = {
  modelName: string
  modelType: ModelUsageType
  responseTime: number
  isSuccess: boolean
  userId?: string | null
  ipAddress?: string | null
  isAuthenticated?: boolean
  error?: unknown
  errorCode?: string | null
  errorStage?: string | null
  errorStatusCode?: number | null
  errorMessage?: string | null
  errorDetail?: string | null
}

export async function recordModelUsage(params: RecordModelUsageParams): Promise<void> {
  if (!params.modelName) return

  try {
    const normalizedError = params.isSuccess
      ? null
      : params.error
        ? normalizeModelUsageError(params.error, params.errorStage || undefined)
        : null

    await db.insert(modelUsageStats).values({
      id: randomUUID(),
      modelName: params.modelName,
      userId: params.userId || null,
      responseTime: Math.max(params.responseTime, 0),
      isAuthenticated: params.isAuthenticated ?? Boolean(params.userId),
      isSuccess: params.isSuccess,
      modelType: params.modelType,
      errorCode: params.isSuccess ? null : params.errorCode ?? normalizedError?.errorCode ?? null,
      errorStage: params.isSuccess ? null : params.errorStage ?? normalizedError?.errorStage ?? null,
      errorStatusCode: params.isSuccess ? null : params.errorStatusCode ?? normalizedError?.errorStatusCode ?? null,
      errorMessage: params.isSuccess ? null : params.errorMessage ?? normalizedError?.errorMessage ?? null,
      errorDetail: params.isSuccess ? null : params.errorDetail ?? normalizedError?.errorDetail ?? null,
      ipAddress: params.ipAddress || null,
      createdAt: new Date(),
    })

    await evaluateModelAlertRules({
      modelName: params.modelName,
      modelType: params.modelType,
      isSuccess: params.isSuccess,
    })
  } catch (error) {
    console.error('Failed to record model usage stats:', error)
  }
}

export function getElapsedSeconds(startTime: number): number {
  return (Date.now() - startTime) / 1000
}
