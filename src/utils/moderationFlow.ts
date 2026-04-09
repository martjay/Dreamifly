import { moderateGeneratedImage, moderatePrompt } from './imageModeration'

export type ModerationFailureReason = 'prompt' | 'image' | 'service_error'

export type ModerationDecision =
  | { approved: true }
  | { approved: false; reason: ModerationFailureReason }

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
      '请判断图片的内容与文字是否可以在公共场所展示，评判标准包括但不限于不应该包含"黄色"、"血腥"、"过于夸张的暴力场景"，你只需输出是或者否即可',
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
  if (!env.baseUrl) return { approved: true }

  const promptText = params.prompt?.trim() || ''

  // 规则：有参考图时，先审文字再审图片
  const checkPromptFirst = params.hasReferenceImages

  const runPrompt = async (): Promise<ModerationDecision | null> => {
    if (!promptText) return null
    const r = await onceRetryOnThrow(() =>
      moderatePrompt(promptText, env.baseUrl as string, env.apiKey, env.model, env.promptModerationPrompt)
    )
    if (!r.ok) return { approved: false, reason: 'service_error' }
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
    if (!r.ok) return { approved: false, reason: 'service_error' }
    return r.value ? null : { approved: false, reason: 'image' }
  }

  if (checkPromptFirst) {
    const promptDecision = await runPrompt()
    if (promptDecision) return promptDecision
    const imageDecision = await runImage()
    if (imageDecision) return imageDecision
    return { approved: true }
  }

  // 无参考图：保持现有顺序（先图后词），尽量减少行为变化
  const imageDecision = await runImage()
  if (imageDecision) return imageDecision
  const promptDecision = await runPrompt()
  if (promptDecision) return promptDecision
  return { approved: true }
}

