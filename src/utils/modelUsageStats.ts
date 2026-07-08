import { randomUUID } from 'crypto'
import { db } from '@/db'
import { modelUsageStats } from '@/db/schema'
import { evaluateModelAlertRules } from '@/utils/modelAlerts'

export type ModelUsageType = 'image_generation' | 'video_generation' | 'moderation' | 'prompt_optimization'

type RecordModelUsageParams = {
  modelName: string
  modelType: ModelUsageType
  responseTime: number
  isSuccess: boolean
  userId?: string | null
  ipAddress?: string | null
  isAuthenticated?: boolean
}

export async function recordModelUsage(params: RecordModelUsageParams): Promise<void> {
  if (!params.modelName) return

  try {
    await db.insert(modelUsageStats).values({
      id: randomUUID(),
      modelName: params.modelName,
      userId: params.userId || null,
      responseTime: Math.max(params.responseTime, 0),
      isAuthenticated: params.isAuthenticated ?? Boolean(params.userId),
      isSuccess: params.isSuccess,
      modelType: params.modelType,
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
