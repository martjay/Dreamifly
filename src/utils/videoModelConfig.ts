import { getHomepageAsset } from './homepageAssets'

const VIDEO_MODEL_ENV_MAP = {
  'Wan2.2-I2V-Lightning': 'WAN_I2V_URL',
  'grok-imagine-1.0-video': 'GROK_VIDEO_API_URL',
  'happyhorse-1.0': 'HAPPYHORSE_API_URL',
  'happyhorse-1.0-t2v': 'HAPPYHORSE_API_URL',
  'happyhorse-1.0-i2v': 'HAPPYHORSE_API_URL',
  'happyhorse-1.0-r2v': 'HAPPYHORSE_API_URL',
  'happyhorse-1.0-video-edit': 'HAPPYHORSE_API_URL',
} as const

export type VideoAspectRatioLabel = '16:9' | '9:16' | '3:2' | '2:3' | '1:1' | '4:3' | '3:4'
export type VideoModelMode = 'text-to-video' | 'image-to-video' | 'reference-to-video' | 'video-edit'

export const HAPPYHORSE_AGGREGATE_MODEL_ID = 'happyhorse-1.0'

export const HAPPYHORSE_MODEL_BY_MODE: Record<VideoModelMode, string> = {
  'text-to-video': 'happyhorse-1.0-t2v',
  'image-to-video': 'happyhorse-1.0-i2v',
  'reference-to-video': 'happyhorse-1.0-r2v',
  'video-edit': 'happyhorse-1.0-video-edit',
}

export function isHappyHorseAggregateModel(modelId: string): boolean {
  return modelId === HAPPYHORSE_AGGREGATE_MODEL_ID
}

export function isHappyHorseChildModel(modelId: string): boolean {
  return Object.values(HAPPYHORSE_MODEL_BY_MODE).includes(modelId)
}

export function getHappyHorseModeFromModelId(modelId: string): VideoModelMode | null {
  const entry = Object.entries(HAPPYHORSE_MODEL_BY_MODE).find(([, childModelId]) => childModelId === modelId)
  return entry ? (entry[0] as VideoModelMode) : null
}

export function resolveHappyHorseModelId(modelId: string, mode?: VideoModelMode | string | null): string {
  if (!isHappyHorseAggregateModel(modelId)) return modelId
  return HAPPYHORSE_MODEL_BY_MODE[(mode as VideoModelMode) || 'text-to-video'] || HAPPYHORSE_MODEL_BY_MODE['text-to-video']
}

export function aspectRatioLabelToNumber(label: VideoAspectRatioLabel): number {
  const [w, h] = label.split(':').map(Number)
  return w / h
}

export function pickClosestAspectRatioLabel(
  ratio: number,
  allowed: VideoAspectRatioLabel[],
  fallback: VideoAspectRatioLabel = '1:1'
): VideoAspectRatioLabel {
  if (!Number.isFinite(ratio) || ratio <= 0) return fallback
  if (!allowed.length) return fallback

  let best = allowed[0]
  let bestDiff = Math.abs(aspectRatioLabelToNumber(best) - ratio)

  for (const label of allowed) {
    const diff = Math.abs(aspectRatioLabelToNumber(label) - ratio)
    if (diff < bestDiff) {
      best = label
      bestDiff = diff
    }
  }

  return best ?? fallback
}

export interface VideoModelFiles {
  unetHighNoise: string
  unetLowNoise: string
  clip: string
  vae: string
  loraHighNoise: string
  loraLowNoise: string
}

export interface VideoModelConfig {
  id: string
  name: string
  description?: string
  image?: string
  imageFallback?: string
  homepageCover?: string
  homepageCoverFallback?: string
  files?: VideoModelFiles
  tags?: string[]
  isRecommended?: boolean
  isAvailable?: boolean
  provider?: 'comfy' | 'grok' | 'happyhorse'
  defaultFps?: number
  defaultLength?: number
  maxLength?: number
  totalPixels?: number
  allowedAspectRatios?: VideoAspectRatioLabel[]
  fixedResolutionName?: '480p'
  defaultVideoSeconds?: number
  mode?: VideoModelMode
  minVideoSeconds?: number
  maxVideoSeconds?: number
  maxReferenceImages?: number
}

const HAPPYHORSE_COMMON = {
  imageFallback: '/images/video-community/video-demo-11.png',
  homepageCoverFallback: '/images/video-community/video-demo-11.png',
  isRecommended: false,
  provider: 'happyhorse' as const,
  defaultVideoSeconds: 5,
  minVideoSeconds: 3,
  maxVideoSeconds: 15,
  totalPixels: 1280 * 720,
}

export const ALL_VIDEO_MODELS: VideoModelConfig[] = [
  {
    id: 'Wan2.2-I2V-Lightning',
    name: 'Wan 2.2 I2V Lightning',
    description: 'Wan 2.2 图生视频模型，支持基于参考图片生成流畅短视频，适合人物、场景和创意动态效果。',
    image: '/images/video-community/video-demo-8.png',
    imageFallback: '/models/video/Wan2.2-I2V-Lightning.jpg',
    homepageCover: '/images/video-community/video-demo-8.png',
    homepageCoverFallback: '/models/homepageModelCover/wan-video.png',
    files: {
      unetHighNoise: 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors',
      unetLowNoise: 'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors',
      clip: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
      vae: 'wan_2.1_vae.safetensors',
      loraHighNoise: 'wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors',
      loraLowNoise: 'wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors',
    },
    tags: ['fastGeneration', 'i2v'],
    isRecommended: true,
    provider: 'comfy',
    mode: 'image-to-video',
    defaultFps: 20,
    defaultLength: 100,
    maxLength: 200,
    totalPixels: 1280 * 720,
  },
  {
    id: 'grok-imagine-1.0-video',
    name: 'Grok Imagine Video',
    description: 'Grok Imagine 视频模型，支持基于图片生成富有想象力的动态画面，输出固定 480p 视频。',
    image: '/images/video-community/video-demo-10.png',
    imageFallback: '/models/video/grok-imagine-1.0-video.jpg',
    homepageCover: '/images/video-community/video-demo-10.png',
    homepageCoverFallback: '/models/homepageModelCover/grok-video.png',
    tags: ['i2v'],
    isRecommended: false,
    provider: 'grok',
    mode: 'image-to-video',
    fixedResolutionName: '480p',
    allowedAspectRatios: ['16:9', '9:16', '3:2', '2:3', '1:1'],
    defaultVideoSeconds: 6,
  },
  {
    ...HAPPYHORSE_COMMON,
    id: HAPPYHORSE_AGGREGATE_MODEL_ID,
    name: 'HappyHorse 视频模型',
    description: 'HappyHorse 视频模型，支持文生视频、图生视频、1-9 张参考图生视频和视频编辑，会根据输入素材匹配生成模式。',
    image: '/models/video/happyhorse-1.0.webp',
    homepageCover: '/models/video/happyhorse-1.0.webp',
    tags: ['t2v', 'i2v', 'r2v', 'videoEdit'],
    mode: 'text-to-video',
    maxReferenceImages: 9,
  },
  {
    ...HAPPYHORSE_COMMON,
    id: 'happyhorse-1.0-t2v',
    name: 'HappyHorse T2V',
    description: 'HappyHorse 文生视频模型，根据文字提示生成 3-15 秒短视频，适合快速制作动态创意内容。',
    image: '/images/video-community/video-demo-11.png',
    homepageCover: '/images/video-community/video-demo-11.png',
    tags: ['t2v', 'fastGeneration'],
    mode: 'text-to-video',
  },
  {
    ...HAPPYHORSE_COMMON,
    id: 'happyhorse-1.0-i2v',
    name: 'HappyHorse I2V',
    description: 'HappyHorse 图生视频模型，以上传图片作为首帧生成 3-15 秒短视频，适合让静态画面自然动起来。',
    image: '/images/video-community/video-demo-5.png',
    homepageCover: '/images/video-community/video-demo-5.png',
    tags: ['i2v', 'fastGeneration'],
    mode: 'image-to-video',
  },
  {
    ...HAPPYHORSE_COMMON,
    id: 'happyhorse-1.0-r2v',
    name: 'HappyHorse R2V',
    description: 'HappyHorse 参考生视频模型，支持 1-9 张参考图和文字提示，生成更贴合参考内容的短视频。',
    image: '/images/video-community/video-demo-12.png',
    homepageCover: '/images/video-community/video-demo-12.png',
    tags: ['r2v', 'fastGeneration'],
    mode: 'reference-to-video',
    maxReferenceImages: 9,
  },
  {
    ...HAPPYHORSE_COMMON,
    id: 'happyhorse-1.0-video-edit',
    name: 'HappyHorse Video Edit',
    description: 'HappyHorse 视频编辑模型，根据文字指令和可选参考图编辑源视频，适合调整画面内容和动态效果。',
    image: '/images/video-community/video-demo-9.png',
    homepageCover: '/images/video-community/video-demo-9.png',
    tags: ['videoEdit', 'fastGeneration'],
    mode: 'video-edit',
    maxReferenceImages: 9,
  },
]

export function isVideoModelConfigured(modelId: string): boolean {
  const envVarName = VIDEO_MODEL_ENV_MAP[modelId as keyof typeof VIDEO_MODEL_ENV_MAP]
  if (!envVarName) return false

  return true
}

export function withVideoModelOssAssets(model: VideoModelConfig): VideoModelConfig {
  return {
    ...model,
    image: model.image ? getHomepageAsset(model.image) : model.image,
    imageFallback: model.imageFallback || model.image,
    homepageCover: model.homepageCover ? getHomepageAsset(model.homepageCover) : model.homepageCover,
    homepageCoverFallback: model.homepageCoverFallback || model.homepageCover,
  }
}

let availableVideoModelsCache: VideoModelConfig[] | null = null
let availableVideoModelsRequest: Promise<VideoModelConfig[]> | null = null

export async function getAvailableVideoModels(): Promise<VideoModelConfig[]> {
  if (availableVideoModelsCache) return availableVideoModelsCache
  if (availableVideoModelsRequest) return availableVideoModelsRequest

  availableVideoModelsRequest = (async () => {
    try {
      const response = await fetch('/api/video-models')
      if (!response.ok) {
        throw new Error('Failed to fetch available video models')
      }

      const data = await response.json()
      const models = (data.models || []).map(withVideoModelOssAssets)
      availableVideoModelsCache = models
      return models
    } catch (error) {
      console.error('Error fetching available video models:', error)
      return ALL_VIDEO_MODELS.filter(model => !isHappyHorseChildModel(model.id)).map(withVideoModelOssAssets)
    } finally {
      availableVideoModelsRequest = null
    }
  })()

  return availableVideoModelsRequest
}

export function getAllVideoModels(): VideoModelConfig[] {
  return ALL_VIDEO_MODELS.map(withVideoModelOssAssets)
}

export function getVideoModelById(modelId: string): VideoModelConfig | null {
  const model = ALL_VIDEO_MODELS.find(model => model.id === modelId)
  return model ? withVideoModelOssAssets(model) : null
}

export function getVideoAspectRatioOptions(modelConfig: VideoModelConfig): Array<{ label: VideoAspectRatioLabel; value: number }> {
  const defaultLabels: VideoAspectRatioLabel[] = ['16:9', '4:3', '1:1', '3:4', '9:16']
  const labels = modelConfig.allowedAspectRatios?.length ? modelConfig.allowedAspectRatios : defaultLabels
  return labels.map(label => ({ label, value: aspectRatioLabelToNumber(label) }))
}

export function calculateVideoResolutionForModel(
  modelConfig: VideoModelConfig,
  aspectRatioLabel: VideoAspectRatioLabel
): { width: number; height: number } {
  if (modelConfig.provider === 'grok' && modelConfig.fixedResolutionName === '480p') {
    const map: Record<Exclude<VideoAspectRatioLabel, '4:3' | '3:4'>, { width: number; height: number }> = {
      '16:9': { width: 854, height: 480 },
      '9:16': { width: 480, height: 854 },
      '3:2': { width: 720, height: 480 },
      '2:3': { width: 480, height: 720 },
      '1:1': { width: 480, height: 480 },
    }
    const preset = map[aspectRatioLabel as Exclude<VideoAspectRatioLabel, '4:3' | '3:4'>] ?? map['1:1']
    return { width: preset.width, height: preset.height }
  }

  return calculateVideoResolution(modelConfig, aspectRatioLabelToNumber(aspectRatioLabel))
}

export function calculateVideoLayoutForAspectRatio(
  modelConfig: VideoModelConfig,
  aspectRatio: number
): { aspectRatio: number; width: number; height: number; label?: VideoAspectRatioLabel } {
  const fallbackLabel: VideoAspectRatioLabel = '1:1'
  const safeAspectRatio =
    Number.isFinite(aspectRatio) && aspectRatio > 0
      ? aspectRatio
      : aspectRatioLabelToNumber(fallbackLabel)

  if (modelConfig.provider === 'grok') {
    const allowed = getVideoAspectRatioOptions(modelConfig).map(option => option.label)
    const label = pickClosestAspectRatioLabel(safeAspectRatio, allowed, fallbackLabel)
    const resolution = calculateVideoResolutionForModel(modelConfig, label)

    return {
      aspectRatio: aspectRatioLabelToNumber(label),
      width: resolution.width,
      height: resolution.height,
      label,
    }
  }

  const resolution = calculateVideoResolution(modelConfig, safeAspectRatio)
  return {
    aspectRatio: safeAspectRatio,
    width: resolution.width,
    height: resolution.height,
  }
}

export function calculateVideoResolution(
  modelConfig: VideoModelConfig,
  aspectRatio: number
): { width: number; height: number } {
  const totalPixels = modelConfig.totalPixels || 1280 * 720
  const height = Math.round(Math.sqrt(totalPixels / aspectRatio))
  const width = Math.round(height * aspectRatio)

  return {
    width: Math.round(width / 8) * 8,
    height: Math.round(height / 8) * 8,
  }
}
