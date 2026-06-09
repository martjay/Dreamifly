import { moderatePrompt } from './imageModeration'
import { DEFAULT_PROMPT_MODERATION_PROMPT } from './moderationFlow'
import { moderateAvatar } from './avatarModeration'
import OpenAI from 'openai'
import type { VisualRiskLevel } from './visualModeration'

export type VideoModerationFailureReason = 'prompt' | 'image' | 'video' | 'service_error'

const FAIL_CLOSED_VISUAL_RISK: Exclude<VisualRiskLevel, 'low'> = 'high'

export type VideoModerationDecision =
  | { approved: true; visualRiskLevel: VisualRiskLevel }
  | { approved: false; reason: VideoModerationFailureReason; visualRiskLevel?: Exclude<VisualRiskLevel, 'low'> }

type ModerationEnv = {
  baseUrl?: string
  apiKey: string
  model: string
  promptModerationPrompt: string
  mediaModerationPrompt: string
}

function getModerationEnv(): ModerationEnv {
  return {
    baseUrl: process.env.AVATAR_MODERATION_BASE_URL,
    apiKey: process.env.AVATAR_MODERATION_API_KEY || '',
    model: process.env.AVATAR_MODERATION_MODEL || 'Qwen/Qwen3-VL-8B-Instruct-FP8',
    promptModerationPrompt: process.env.PROMPT_MODERATION_PROMPT || DEFAULT_PROMPT_MODERATION_PROMPT,
    mediaModerationPrompt: process.env.HAPPYHORSE_INPUT_MODERATION_PROMPT ||
      process.env.GENERATED_IMAGE_MODERATION_PROMPT ||
      process.env.AVATAR_MODERATION_PROMPT ||
      'Please determine whether this media is safe for a public creative platform. Reject sexual content involving minors, explicit sexual content, graphic violence, gore, illegal content, and other unsafe content. Reply only yes or no.',
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

function normalizeBase64Media(value: string): { buffer: Buffer; mimeType: string } {
  if (value.startsWith('data:')) {
    const commaIndex = value.indexOf(',')
    if (commaIndex > 0) {
      const header = value.slice(5, commaIndex)
      const mimeType = header.split(';')[0] || 'image/jpeg'
      return { buffer: Buffer.from(value.slice(commaIndex + 1), 'base64'), mimeType }
    }
  }

  const commaIndex = value.indexOf(',')
  const base64Value = commaIndex >= 0 ? value.slice(commaIndex + 1) : value
  return { buffer: Buffer.from(base64Value, 'base64'), mimeType: 'image/jpeg' }
}

function extensionFromMimeType(mimeType: string, kind: 'image' | 'video'): string {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/bmp') return 'bmp'
  if (mimeType === 'video/webm') return 'webm'
  if (mimeType === 'video/quicktime') return 'mov'
  if (mimeType === 'video/mp4') return 'mp4'
  return kind === 'video' ? 'mp4' : 'jpg'
}

function normalizeModerationAnswer(rawResult: string | null | undefined): string {
  return (rawResult || '')
    .trim()
    .toLowerCase()
    .replace(/["'`'']/g, '')
    .replace(/[。.!?,，、\s]/g, '')
}

function isApprovedModerationAnswer(rawResult: string | null | undefined): boolean | null {
  const result = normalizeModerationAnswer(rawResult)
  if (!result) return null
  if (result === '是' || result === 'yes' || result.includes('通过') || result.includes('pass') || result.includes('approve')) return true
  if (result === '否' || result === 'no' || result.includes('不通过') || result.includes('fail') || result.includes('reject')) return false
  return null
}

async function moderateVideoDataUrl(
  videoBuffer: Buffer,
  mimeType: string,
  env: ModerationEnv
): Promise<boolean> {
  const client = new OpenAI({
    baseURL: env.baseUrl,
    apiKey: env.apiKey || 'dummy-key',
  })

  const response = await client.chat.completions.create({
    model: env.model,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: env.mediaModerationPrompt },
          {
            type: 'video_url',
            video_url: {
              url: `data:${mimeType};base64,${videoBuffer.toString('base64')}`,
            },
          },
        ],
      },
    ],
    stream: false,
    chat_template_kwargs: { enable_thinking: false },
  } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming)

  const approved = isApprovedModerationAnswer(response.choices[0]?.message?.content)
  if (approved === null) {
    throw new Error('Video moderation result is unclear')
  }

  return approved
}

async function moderateMediaInput(
  mediaBase64OrDataUrl: string,
  kind: 'image' | 'video',
  env: ModerationEnv
): Promise<VideoModerationDecision> {
  const { buffer, mimeType } = normalizeBase64Media(mediaBase64OrDataUrl)
  const fileName = `happyhorse-input.${extensionFromMimeType(mimeType, kind)}`

  const result = await onceRetryOnThrow(async () => {
    if (kind === 'video') {
      return moderateVideoDataUrl(buffer, mimeType.startsWith('video/') ? mimeType : 'video/mp4', env)
    }

    return moderateAvatar(buffer, fileName, env.baseUrl as string, env.apiKey, env.model, env.mediaModerationPrompt)
  })

  if (!result.ok) {
    return { approved: false, reason: 'service_error', visualRiskLevel: FAIL_CLOSED_VISUAL_RISK }
  }

  if (!result.value) {
    return { approved: false, reason: kind }
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

export async function moderateHappyHorseInputMedia(params: {
  firstFrameBase64OrDataUrl?: string | null
  referenceImagesBase64OrDataUrl?: string[]
  sourceVideoBase64OrDataUrl?: string | null
}): Promise<VideoModerationDecision> {
  const env = getModerationEnv()
  if (!env.baseUrl) return { approved: true, visualRiskLevel: 'low' }

  if (params.firstFrameBase64OrDataUrl) {
    const decision = await moderateMediaInput(params.firstFrameBase64OrDataUrl, 'image', env)
    if (!decision.approved) return decision
  }

  for (const referenceImage of params.referenceImagesBase64OrDataUrl || []) {
    const decision = await moderateMediaInput(referenceImage, 'image', env)
    if (!decision.approved) return decision
  }

  if (params.sourceVideoBase64OrDataUrl) {
    const decision = await moderateMediaInput(params.sourceVideoBase64OrDataUrl, 'video', env)
    if (!decision.approved) return decision
  }

  return { approved: true, visualRiskLevel: 'low' }
}
