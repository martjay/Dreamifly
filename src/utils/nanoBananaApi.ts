import {
  OfficialModelModerationError,
  detectOfficialModelModerationFailure,
} from '@/utils/officialModelModeration'

interface NanoBananaParams {
  prompt: string
  width: number
  height: number
  negative_prompt?: string
  seed?: number
  images?: string[]
}

type BananaRouterImageSize = '1K' | '4K'

interface BananaRouterPart {
  text?: string
  inlineData?: {
    mimeType: string
    data: string
  }
}

interface BananaRouterResponsePart {
  inlineData?: {
    mimeType?: string
    data?: string
  }
  inline_data?: {
    mime_type?: string
    data?: string
  }
  fileData?: {
    fileUri?: string
  }
  file_data?: {
    file_uri?: string
  }
}

interface BananaRouterResponse {
  candidates?: Array<{
    content?: {
      parts?: BananaRouterResponsePart[]
    }
  }>
}

// BananaRouter gemini-3.1-flash-image-preview supports these aspect ratios.
const SUPPORTED_RATIOS: Array<[string, number]> = [
  ['1:1', 1 / 1],
  ['4:3', 4 / 3],
  ['3:4', 3 / 4],
  ['16:9', 16 / 9],
  ['9:16', 9 / 16],
]

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 3000

/** 根据宽高推导最接近的 aspectRatio 字符串 */
function deriveAspectRatio(width: number, height: number): string {
  const ratio = width / height
  let closest = '1:1'
  let minDiff = Infinity
  for (const [label, value] of SUPPORTED_RATIOS) {
    const diff = Math.abs(ratio - value)
    if (diff < minDiff) {
      minDiff = diff
      closest = label
    }
  }
  return closest
}

/**
 * Dreamifly 的 Nano Banana 2 规则：
 * - 默认画质使用 1K
 * - 开启高质量后使用 4K
 */
function deriveImageSize(width: number, height: number): BananaRouterImageSize {
  return width * height > 1024 * 1024 * 1.5 ? '4K' : '1K'
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 判断错误是否可重试 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (
      msg.includes('timeout') ||
      msg.includes('fetch failed') ||
      msg.includes('econnreset') ||
      msg.includes('connection') ||
      msg.includes('unavailable') ||
      msg.includes('rate limit') ||
      msg.includes('429') ||
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('504')
    ) {
      return true
    }
  }
  return false
}

function normalizeBase64Image(image: string): { mimeType: string; data: string } {
  const dataUrlMatch = image.match(/^data:([^;]+);base64,(.+)$/)
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1] || 'image/jpeg',
      data: dataUrlMatch[2],
    }
  }

  return {
    mimeType: 'image/jpeg',
    data: image,
  }
}

function extractImageDataUrl(response: BananaRouterResponse): string | null {
  const parts = response.candidates?.flatMap(candidate => candidate.content?.parts ?? []) ?? []

  for (const part of parts) {
    const inlineData = part.inlineData || (part.inline_data
      ? {
          mimeType: part.inline_data.mime_type,
          data: part.inline_data.data,
        }
      : undefined)

    if (inlineData?.data) {
      const mimeType = inlineData.mimeType || 'image/png'
      return `data:${mimeType};base64,${inlineData.data}`
    }

    const fileUri = part.fileData?.fileUri || part.file_data?.file_uri
    if (fileUri) {
      return fileUri
    }
  }

  return null
}

/**
 * 调用 BananaRouter gemini-3.1-flash-image-preview 生成图片（带重试）
 * @returns base64 格式的图片 data URL（data:image/png;base64,...）或第三方返回的文件 URL
 */
export async function generateNanoBananaImage(params: NanoBananaParams): Promise<string> {
  const apiKey = process.env.BANANA_ROUTER_API_KEY
  if (!apiKey?.trim()) {
    throw new Error('nano-banana-2 的 API Key 未配置，请检查 BANANA_ROUTER_API_KEY 环境变量')
  }

  const configuredBaseUrl = process.env.BANANA_ROUTER_BASE_URL
  if (!configuredBaseUrl?.trim()) {
    throw new Error('nano-banana-2 的 API URL 未配置，请检查 BANANA_ROUTER_BASE_URL 环境变量')
  }

  const configuredModel = process.env.BANANA_ROUTER_IMAGE_MODEL
  if (!configuredModel?.trim()) {
    throw new Error('nano-banana-2 的模型名称未配置，请检查 BANANA_ROUTER_IMAGE_MODEL 环境变量')
  }

  const baseUrl = configuredBaseUrl.trim().replace(/\/+$/, '')
  const model = configuredModel.trim()
  const endpoint = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const aspectRatio = deriveAspectRatio(params.width, params.height)
  const imageSize = deriveImageSize(params.width, params.height)

  const promptText = params.negative_prompt
    ? `${params.prompt}\n\nNegative prompt: ${params.negative_prompt}`
    : params.prompt

  const parts: BananaRouterPart[] = [{ text: promptText }]
  for (const image of params.images ?? []) {
    const { mimeType, data } = normalizeBase64Image(image)
    parts.push({
      inlineData: {
        mimeType,
        data,
      },
    })
  }

  const body: Record<string, unknown> = {
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio,
        imageSize,
      },
    },
  }

  if (params.seed !== undefined) {
    body.generationConfig = {
      ...(body.generationConfig as Record<string, unknown>),
      seed: params.seed,
    }
  }

  console.log(`[nano-banana-2] BananaRouter start model=${model}, aspectRatio=${aspectRatio}, imageSize=${imageSize}`)

  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const responseText = await response.text()
      if (!response.ok) {
        if (detectOfficialModelModerationFailure(responseText)) {
          throw new OfficialModelModerationError()
        }
        throw new Error(`BananaRouter API failed ${response.status}: ${responseText}`)
      }

      const data = JSON.parse(responseText) as BananaRouterResponse
      const imageUrl = extractImageDataUrl(data)
      if (!imageUrl) {
        if (detectOfficialModelModerationFailure(data)) {
          throw new OfficialModelModerationError()
        }
        throw new Error('BananaRouter API 未返回图片')
      }

      console.log(`[nano-banana-2] BananaRouter success`)
      return imageUrl
    } catch (error) {
      lastError = error
      const isLastAttempt = attempt === MAX_RETRIES
      if (!isLastAttempt && isRetryableError(error)) {
        console.log(
          `[nano-banana-2] 第 ${attempt} 次请求失败 (${error instanceof Error ? error.message : String(error)})，${RETRY_DELAY_MS}ms 后重试...`
        )
        await sleep(RETRY_DELAY_MS)
        continue
      }
      break
    }
  }

  throw lastError ?? new Error('nano-banana-2 请求失败')
}
