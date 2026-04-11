import { moderateGeneratedImage, moderatePrompt } from './imageModeration'
import { isRestrictedVisualRisk, type VisualRiskLevel } from './visualModeration'

export type ModerationFailureReason = 'prompt' | 'image' | 'service_error'

const FAIL_CLOSED_VISUAL_RISK: Exclude<VisualRiskLevel, 'low'> = 'high'

export type ModerationDecision =
  | { approved: true; visualRiskLevel: 'low' }
  | { approved: false; reason: ModerationFailureReason; visualRiskLevel?: Exclude<VisualRiskLevel, 'low'> }

type ModerationEnv = {
  baseUrl?: string
  apiKey: string
  model: string
  imageModerationPrompt: string
  promptModerationPrompt: string
}

function getModerationEnv(): ModerationEnv {
  return {
    baseUrl: process.env.AVATAR_MODERATION_BASE_URL,
    apiKey: process.env.AVATAR_MODERATION_API_KEY || '',
    model: process.env.AVATAR_MODERATION_MODEL || 'Qwen/Qwen3-VL-8B-Instruct-FP8',
    imageModerationPrompt:
      process.env.GENERATED_IMAGE_MODERATION_PROMPT ||
      '请判断图片内容是否包含直接的色情元素、过于夸张的血腥场景及强烈政治暗示，仅输出一个包含上述任意元素的概率值，高、中、低三选一。',
    promptModerationPrompt:
      process.env.PROMPT_MODERATION_PROMPT ||
      '请判断以下图片生成提示词是否可以在公共场所使用，评判标准包括但不限于不应该包含"黄色"、"血腥"、"暴力"、"政治敏感"等内容，你只需输出是或者否即可。提示词：{prompt}',
  }
}

async function onceRetryOnThrow<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
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

export async function moderateGeneratedOutput(params: {
  imageBuffer: Buffer
  prompt?: string
  hasReferenceImages: boolean
}): Promise<ModerationDecision> {
  const env = getModerationEnv()
  if (!env.baseUrl) return { approved: true, visualRiskLevel: 'low' }

  const promptText = params.prompt?.trim() || ''

  // 规则：有参考图时，先审文字再审图片
  const checkPromptFirst = params.hasReferenceImages

  const runPrompt = async (): Promise<ModerationDecision | null> => {
    if (!promptText) return null
    const r = await onceRetryOnThrow(() =>
      moderatePrompt(promptText, env.baseUrl as string, env.apiKey, env.model, env.promptModerationPrompt)
    )
    if (!r.ok) return { approved: false, reason: 'service_error', visualRiskLevel: FAIL_CLOSED_VISUAL_RISK }
    return r.value ? null : { approved: false, reason: 'prompt' }
  }

  const runImage = async (): Promise<ModerationDecision | null> => {
    const r = await onceRetryOnThrow(() =>
      moderateGeneratedImage(
        params.imageBuffer,
        'generated-image.png',
        env.baseUrl as string,
        env.apiKey,
        env.model,
        env.imageModerationPrompt
      )
    )
    if (!r.ok) return { approved: false, reason: 'service_error', visualRiskLevel: FAIL_CLOSED_VISUAL_RISK }
    if (isRestrictedVisualRisk(r.value)) {
      return { approved: false, reason: 'image', visualRiskLevel: r.value as Exclude<VisualRiskLevel, 'low'> }
    }

    return null
  }

  if (checkPromptFirst) {
    const promptDecision = await runPrompt()
    if (promptDecision) return promptDecision
    const imageDecision = await runImage()
    if (imageDecision) return imageDecision
    return { approved: true, visualRiskLevel: 'low' }
  }

  // 无参考图：保持现有顺序（先图后词），尽量减少行为变化
  const imageDecision = await runImage()
  if (imageDecision) return imageDecision
  const promptDecision = await runPrompt()
  if (promptDecision) return promptDecision
  return { approved: true, visualRiskLevel: 'low' }
}

