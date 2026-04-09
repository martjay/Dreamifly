import { moderatePrompt, moderateGeneratedImage } from './imageModeration'

export type VideoModerationFailureReason = 'prompt' | 'video' | 'service_error'

export type VideoModerationDecision =
  | { approved: true }
  | { approved: false; reason: VideoModerationFailureReason }

type ModerationEnv = {
  baseUrl?: string
  apiKey: string
  model: string
  promptModerationPrompt: string
  videoModerationPrompt: string
}

function getModerationEnv(): ModerationEnv {
  return {
    baseUrl: process.env.AVATAR_MODERATION_BASE_URL,
    apiKey: process.env.AVATAR_MODERATION_API_KEY || '',
    model: process.env.AVATAR_MODERATION_MODEL || 'Qwen/Qwen3-VL-8B-Instruct-FP8',
    promptModerationPrompt:
      process.env.PROMPT_MODERATION_PROMPT ||
      '请判断以下视频生成提示词是否可以在公共场所使用，评判标准包括但不限于不应该包含"黄色"、"血腥"、"暴力"、"政治敏感"等内容，你只需输出是或者否即可。提示词：{prompt}',
    // 说明：当前仓库未稳定接入“直接审核视频 buffer”的能力，因此用参考图作为视频内容代表做审核。
    videoModerationPrompt:
      process.env.GENERATED_VIDEO_MODERATION_PROMPT ||
      '请判断该视频内容是否可以在公共场所展示（可视内容标准：不得包含黄色、血腥、暴力、政治敏感等）。你只需输出是或者否即可。',
  }
}

function stripDataUrlPrefix(base64OrDataUrl: string): string {
  const idx = base64OrDataUrl.indexOf(',')
  if (base64OrDataUrl.startsWith('data:') && idx >= 0) return base64OrDataUrl.slice(idx + 1)
  return base64OrDataUrl
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

export async function moderateGeneratedVideoOutput(params: {
  prompt?: string
  referenceImageBase64OrDataUrl: string
}): Promise<VideoModerationDecision> {
  const env = getModerationEnv()
  if (!env.baseUrl) return { approved: true }

  const promptText = params.prompt?.trim() || ''

  // 1) 先审提示词
  if (promptText) {
    const r = await onceRetryOnThrow(() =>
      moderatePrompt(promptText, env.baseUrl as string, env.apiKey, env.model, env.promptModerationPrompt)
    )
    if (!r.ok) return { approved: false, reason: 'service_error' }
    if (!r.value) return { approved: false, reason: 'prompt' }
  }

  // 2) 再审视频内容（当前以参考图作为代表进行审核）
  const refBase64 = stripDataUrlPrefix(params.referenceImageBase64OrDataUrl)
  const refBuffer = Buffer.from(refBase64, 'base64')
  const r2 = await onceRetryOnThrow(() =>
    moderateGeneratedImage(refBuffer, 'video-reference.png', env.baseUrl as string, env.apiKey, env.model, env.videoModerationPrompt)
  )
  if (!r2.ok) return { approved: false, reason: 'service_error' }
  if (!r2.value) return { approved: false, reason: 'video' }

  return { approved: true }
}

