import { v4 as uuidv4 } from 'uuid'
import { uploadToOSS } from './oss'
import type { VideoModelMode } from './videoModelConfig'

type HappyHorseTaskStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN'
export type HappyHorseResolution = '720P' | '1080P'

interface HappyHorseCreateTaskResponse {
  output?: {
    task_id?: string
    task_status?: HappyHorseTaskStatus
  }
  request_id?: string
  code?: string
  message?: string
}

interface HappyHorseQueryTaskResponse {
  output?: {
    task_id?: string
    task_status?: HappyHorseTaskStatus
    video_url?: string
    code?: string
    message?: string
  }
  request_id?: string
  usage?: {
    duration?: number
    output_video_duration?: number
    SR?: number
  }
}

export type HappyHorseMediaType = 'first_frame' | 'reference_image' | 'video'

export interface HappyHorseMediaInput {
  type: HappyHorseMediaType
  url: string
}

const HAPPYHORSE_MODEL_BY_MODE: Record<VideoModelMode, string> = {
  'text-to-video': 'happyhorse-1.0-t2v',
  'image-to-video': 'happyhorse-1.0-i2v',
  'reference-to-video': 'happyhorse-1.0-r2v',
  'video-edit': 'happyhorse-1.0-video-edit',
}

const DEFAULT_CREATE_TASK_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis'
const DEFAULT_POLL_INTERVAL_MS = 15_000
const DEFAULT_TIMEOUT_MS = 900_000
const REQUEST_TIMEOUT_MS = 60_000

function readEnv(name: string): string {
  return process.env[name]?.trim() || ''
}

export function getHappyHorseApiKey(explicitApiKey?: string): string {
  return explicitApiKey?.trim() || readEnv('HAPPYHORSE_API_KEY') || readEnv('DASHSCOPE_API_KEY')
}

export function getHappyHorseApiUrl(explicitApiUrl?: string): string {
  return explicitApiUrl?.trim() || readEnv('HAPPYHORSE_API_URL') || DEFAULT_CREATE_TASK_URL
}

export function isHappyHorseConfigured(): boolean {
  return getHappyHorseApiKey() !== ''
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getTaskQueryUrl(createTaskUrl: string, taskId: string): string {
  const url = new URL(createTaskUrl || DEFAULT_CREATE_TASK_URL)
  return `${url.origin}/api/v1/tasks/${encodeURIComponent(taskId)}`
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

function dataUrlParts(value: string): { mimeType: string | null; base64: string } {
  if (value.startsWith('data:')) {
    const commaIndex = value.indexOf(',')
    if (commaIndex > 0) {
      const header = value.slice(5, commaIndex)
      return { mimeType: header.split(';')[0] || null, base64: value.slice(commaIndex + 1) }
    }
  }
  const commaIndex = value.indexOf(',')
  return { mimeType: null, base64: commaIndex >= 0 ? value.slice(commaIndex + 1) : value }
}

function normalizeBase64Image(image: string): { buffer: Buffer; extension: 'jpg' | 'png' | 'webp' } {
  const { mimeType, base64 } = dataUrlParts(image)
  const buffer = Buffer.from(base64, 'base64')

  if (buffer.length < 12) {
    throw new Error('HappyHorse image media is invalid')
  }

  if (mimeType === 'image/png' || (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)) {
    return { buffer, extension: 'png' }
  }

  if (mimeType === 'image/webp' || (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')) {
    return { buffer, extension: 'webp' }
  }

  return { buffer, extension: 'jpg' }
}

function normalizeBase64Video(video: string): { buffer: Buffer; extension: 'mp4' | 'webm' | 'mov' } {
  const { mimeType, base64 } = dataUrlParts(video)
  const buffer = Buffer.from(base64, 'base64')

  if (buffer.length < 32) {
    throw new Error('HappyHorse source video is invalid')
  }

  if (mimeType === 'video/webm') return { buffer, extension: 'webm' }
  if (mimeType === 'video/quicktime') return { buffer, extension: 'mov' }
  return { buffer, extension: 'mp4' }
}

function datedFolder(prefix: string): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${prefix}/${year}/${month}/${day}`
}

export async function uploadHappyHorseImage(image: string, folderPrefix = 'happyhorse-images'): Promise<string> {
  if (/^https?:\/\//i.test(image)) return image

  const { buffer, extension } = normalizeBase64Image(image)
  return uploadToOSS(buffer, `${uuidv4()}.${extension}`, datedFolder(folderPrefix))
}

export async function uploadHappyHorseVideo(video: string, folderPrefix = 'happyhorse-source-videos'): Promise<string> {
  if (/^https?:\/\//i.test(video)) return video

  const { buffer, extension } = normalizeBase64Video(video)
  return uploadToOSS(buffer, `${uuidv4()}.${extension}`, datedFolder(folderPrefix))
}

export async function uploadHappyHorseFirstFrame(image: string): Promise<string> {
  return uploadHappyHorseImage(image, 'happyhorse-first-frames')
}

export async function callHappyHorseVideo(params: {
  apiUrl?: string
  apiKey?: string
  mode: VideoModelMode
  promptText: string
  media?: HappyHorseMediaInput[]
  durationSeconds?: number
  resolution?: HappyHorseResolution
  watermark?: boolean
  seed?: number
  pollIntervalMs?: number
  timeoutMs?: number
}): Promise<{ videoUrl: string; taskId: string; durationSeconds?: number; requestId?: string }> {
  const {
    apiUrl,
    apiKey,
    mode,
    promptText,
    media = [],
    durationSeconds = 5,
    resolution = '720P',
    watermark = false,
    seed,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = params

  const createTaskUrl = getHappyHorseApiUrl(apiUrl)
  const key = getHappyHorseApiKey(apiKey)
  if (!key) {
    throw new Error('HappyHorse API key is not configured. Set HAPPYHORSE_API_KEY or DASHSCOPE_API_KEY.')
  }

  const duration = Math.min(15, Math.max(3, Math.round(durationSeconds)))
  const parameters: Record<string, unknown> = {
    resolution,
    duration,
    watermark,
  }
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    parameters.seed = Math.max(0, Math.min(2147483647, Math.round(seed)))
  }

  const input: Record<string, unknown> = {
    prompt: promptText,
  }
  if (media.length > 0) {
    input.media = media
  }

  const createResponse = await fetchWithTimeout(
    createTaskUrl,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: HAPPYHORSE_MODEL_BY_MODE[mode],
        input,
        parameters,
      }),
    },
    REQUEST_TIMEOUT_MS
  )

  const createData = (await createResponse.json().catch(async () => {
    const text = await createResponse.text().catch(() => '')
    return { message: text }
  })) as HappyHorseCreateTaskResponse

  if (!createResponse.ok || createData.code) {
    throw new Error(`HappyHorse task creation failed (${createResponse.status}): ${createData.message || createData.code || createResponse.statusText}`)
  }

  const taskId = createData.output?.task_id
  if (!taskId) {
    throw new Error('HappyHorse task creation did not return task_id')
  }

  const startedAt = Date.now()
  const taskUrl = getTaskQueryUrl(createTaskUrl, taskId)

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(pollIntervalMs)

    const queryResponse = await fetchWithTimeout(
      taskUrl,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
        },
      },
      REQUEST_TIMEOUT_MS
    )

    const queryData = (await queryResponse.json().catch(async () => {
      const text = await queryResponse.text().catch(() => '')
      return { output: { message: text } }
    })) as HappyHorseQueryTaskResponse

    if (!queryResponse.ok) {
      throw new Error(`HappyHorse task query failed (${queryResponse.status}): ${queryData.output?.message || queryResponse.statusText}`)
    }

    const status = queryData.output?.task_status
    if (status === 'SUCCEEDED') {
      const videoUrl = queryData.output?.video_url
      if (!videoUrl) {
        throw new Error('HappyHorse task succeeded but did not return video_url')
      }
      return {
        videoUrl,
        taskId,
        durationSeconds: queryData.usage?.output_video_duration ?? queryData.usage?.duration ?? duration,
        requestId: queryData.request_id,
      }
    }

    if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
      throw new Error(`HappyHorse task ${status}: ${queryData.output?.message || queryData.output?.code || 'no detail returned'}`)
    }
  }

  throw new Error(`HappyHorse task timed out after ${Math.round(timeoutMs / 1000)} seconds`)
}

export async function callHappyHorseI2V(params: {
  apiUrl?: string
  apiKey?: string
  promptText: string
  firstFrameUrl: string
  durationSeconds?: number
  resolution?: HappyHorseResolution
  watermark?: boolean
  seed?: number
  pollIntervalMs?: number
  timeoutMs?: number
}): Promise<{ videoUrl: string; taskId: string; durationSeconds?: number; requestId?: string }> {
  return callHappyHorseVideo({
    ...params,
    mode: 'image-to-video',
    media: [{ type: 'first_frame', url: params.firstFrameUrl }],
  })
}
