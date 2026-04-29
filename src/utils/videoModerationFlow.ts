import { moderatePrompt, moderateGeneratedImage } from './imageModeration'
import { moderateGeneratedVideo } from './videoModeration'
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
    videoModerationPrompt:
      process.env.GENERATED_VIDEO_MODERATION_PROMPT ||
      '请判断图片内容是否包含直接的色情元素、过于夸张的血腥场景及强烈政治暗示，仅输出一个包含上述任意元素的概率值，高、中、低三选一。',
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

function highestRisk(a: VisualRiskLevel, b: VisualRiskLevel): VisualRiskLevel {
  const rank: Record<VisualRiskLevel, number> = { low: 0, medium: 1, high: 2 }
  return rank[b] > rank[a] ? b : a
}

export async function moderateGeneratedVideoOutput(params: {
  prompt?: string
  referenceImageBase64OrDataUrl?: string | null
  sourceVideoBase64OrDataUrl?: string | null
}): Promise<VideoModerationDecision> {
  const env = getModerationEnv()
  if (!env.baseUrl) return { approved: true, visualRiskLevel: 'low' }

  const promptText = params.prompt?.trim() || ''

  if (promptText) {
    const r = await onceRetryOnThrow(() =>
      moderatePrompt(promptText, env.baseUrl as string, env.apiKey, env.model, env.promptModerationPrompt)
    )
    if (!r.ok) return { approved: false, reason: 'service_error', visualRiskLevel: FAIL_CLOSED_VISUAL_RISK }
    if (!r.value) return { approved: false, reason: 'prompt' }
  }

  let visualRiskLevel: VisualRiskLevel = 'low'

  if (params.referenceImageBase64OrDataUrl) {
    const refBase64 = stripDataUrlPrefix(params.referenceImageBase64OrDataUrl)
    const refBuffer = Buffer.from(refBase64, 'base64')
    const r2 = await onceRetryOnThrow(() =>
      moderateGeneratedImage(refBuffer, 'video-reference.png', env.baseUrl as string, env.apiKey, env.model, env.videoModerationPrompt)
    )
    if (!r2.ok) return { approved: false, reason: 'service_error', visualRiskLevel: FAIL_CLOSED_VISUAL_RISK }
    if (r2.value === 'high') {
      return { approved: false, reason: 'video', visualRiskLevel: r2.value as Exclude<VisualRiskLevel, 'low'> }
    }
    visualRiskLevel = highestRisk(visualRiskLevel, r2.value)
  }

  if (params.sourceVideoBase64OrDataUrl) {
    const videoBase64 = stripDataUrlPrefix(params.sourceVideoBase64OrDataUrl)
    const videoBuffer = Buffer.from(videoBase64, 'base64')
    const r3 = await onceRetryOnThrow(() =>
      moderateGeneratedVideo(videoBuffer, 'source-video.mp4', env.baseUrl as string, env.apiKey, env.model, env.videoModerationPrompt)
    )
    if (!r3.ok) return { approved: false, reason: 'service_error', visualRiskLevel: FAIL_CLOSED_VISUAL_RISK }
    if (!r3.value) {
      return { approved: false, reason: 'video', visualRiskLevel: 'high' }
    }
  }

  return { approved: true, visualRiskLevel }
}

export async function moderateVideoGenerationInput(params: {
  prompt?: string
  referenceImagesBase64OrDataUrl?: string[]
  sourceVideoBase64OrDataUrl?: string | null
}): Promise<VideoModerationDecision> {
  const env = getModerationEnv()
  if (!env.baseUrl) return { approved: true, visualRiskLevel: 'low' }

  const promptText = params.prompt?.trim() || ''

  if (promptText) {
    const promptResult = await onceRetryOnThrow(() =>
      moderatePrompt(promptText, env.baseUrl as string, env.apiKey, env.model, env.promptModerationPrompt)
    )
    if (!promptResult.ok) return { approved: false, reason: 'service_error', visualRiskLevel: FAIL_CLOSED_VISUAL_RISK }
    if (!promptResult.value) return { approved: false, reason: 'prompt' }
  }

  let visualRiskLevel: VisualRiskLevel = 'low'
  const referenceImages = params.referenceImagesBase64OrDataUrl?.filter(Boolean) || []

  for (let index = 0; index < referenceImages.length; index += 1) {
    const refBase64 = stripDataUrlPrefix(referenceImages[index])
    const refBuffer = Buffer.from(refBase64, 'base64')
    const imageResult = await onceRetryOnThrow(() =>
      moderateGeneratedImage(
        refBuffer,
        `video-reference-${index + 1}.png`,
        env.baseUrl as string,
        env.apiKey,
        env.model,
        env.videoModerationPrompt
      )
    )

    if (!imageResult.ok) return { approved: false, reason: 'service_error', visualRiskLevel: FAIL_CLOSED_VISUAL_RISK }
    if (imageResult.value === 'high') {
      return { approved: false, reason: 'video', visualRiskLevel: 'high' }
    }
    visualRiskLevel = highestRisk(visualRiskLevel, imageResult.value)
  }

  if (params.sourceVideoBase64OrDataUrl) {
    const videoBase64 = stripDataUrlPrefix(params.sourceVideoBase64OrDataUrl)
    const videoBuffer = Buffer.from(videoBase64, 'base64')
    const videoResult = await onceRetryOnThrow(() =>
      moderateGeneratedVideo(videoBuffer, 'source-video.mp4', env.baseUrl as string, env.apiKey, env.model, env.videoModerationPrompt)
    )
    if (!videoResult.ok) return { approved: false, reason: 'service_error', visualRiskLevel: FAIL_CLOSED_VISUAL_RISK }
    if (!videoResult.value) {
      return { approved: false, reason: 'video', visualRiskLevel: 'high' }
    }
  }

  return { approved: true, visualRiskLevel }
}
