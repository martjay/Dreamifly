import { moderatePrompt } from './imageModeration'
import { DEFAULT_PROMPT_MODERATION_PROMPT } from './moderationFlow'
import type { VisualRiskLevel } from './visualModeration'

export type VideoModerationFailureReason = 'prompt' | 'video' | 'service_error'

const FAIL_CLOSED_VISUAL_RISK: Exclude<VisualRiskLevel, 'low'> = 'high'

export type VideoModerationDecision =
  | { approved: true; visualRiskLevel: VisualRiskLevel }
  | { approved: false; reason: VideoModerationFailureReason; visualRiskLevel?: Exclude<VisualRiskLevel, 'low'> }

type ModerationEnv = {
  baseUrl?: string
  apiKey: string
  model: string
  promptModerationPrompt: string
}

function getModerationEnv(): ModerationEnv {
  return {
    baseUrl: process.env.AVATAR_MODERATION_BASE_URL,
    apiKey: process.env.AVATAR_MODERATION_API_KEY || '',
    model: process.env.AVATAR_MODERATION_MODEL || 'Qwen/Qwen3-VL-8B-Instruct-FP8',
    promptModerationPrompt: process.env.PROMPT_MODERATION_PROMPT || DEFAULT_PROMPT_MODERATION_PROMPT,
  }
}

async function onceRetryOnThrow<T>(
  fn: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await fn() }
  } catch {
    try {
      await new Promise((r) => setTimeout(r, 300))
      return { ok: true, value: await fn() }
    } catch (error2) {
      return { ok: false, error: error2 }
    }
  }
}

async function moderatePromptOnly(promptText: string, env: ModerationEnv): Promise<VideoModerationDecision> {
  if (!promptText) return { approved: true, visualRiskLevel: 'low' }

  const result = await onceRetryOnThrow(() =>
    moderatePrompt(promptText, env.baseUrl as string, env.apiKey, env.model, env.promptModerationPrompt)
  )

  if (!result.ok) {
    return { approved: false, reason: 'service_error', visualRiskLevel: FAIL_CLOSED_VISUAL_RISK }
  }

  if (!result.value) {
    return { approved: false, reason: 'prompt' }
  }

  return { approved: true, visualRiskLevel: 'low' }
}

export async function moderateGeneratedVideoOutput(params: {
  prompt?: string
  referenceImageBase64OrDataUrl?: string | null
  sourceVideoBase64OrDataUrl?: string | null
}): Promise<VideoModerationDecision> {
  const env = getModerationEnv()
  if (!env.baseUrl) return { approved: true, visualRiskLevel: 'low' }

  return moderatePromptOnly(params.prompt?.trim() || '', env)
}

export async function moderateVideoGenerationInput(params: {
  prompt?: string
  referenceImagesBase64OrDataUrl?: string[]
  sourceVideoBase64OrDataUrl?: string | null
}): Promise<VideoModerationDecision> {
  const env = getModerationEnv()
  if (!env.baseUrl) return { approved: true, visualRiskLevel: 'low' }

  return moderatePromptOnly(params.prompt?.trim() || '', env)
}
