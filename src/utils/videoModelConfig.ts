const VIDEO_MODEL_ENV_MAP = {
  'Wan2.2-I2V-Lightning': 'WAN_I2V_URL',
  'grok-imagine-1.0-video': 'GROK_VIDEO_API_URL',
  'happyhorse-1.0-t2v': 'HAPPYHORSE_API_URL',
  'happyhorse-1.0-i2v': 'HAPPYHORSE_API_URL',
  'happyhorse-1.0-r2v': 'HAPPYHORSE_API_URL',
  'happyhorse-1.0-video-edit': 'HAPPYHORSE_API_URL',
} as const

export type VideoAspectRatioLabel = '16:9' | '9:16' | '3:2' | '2:3' | '1:1' | '4:3' | '3:4'
export type VideoModelMode = 'text-to-video' | 'image-to-video' | 'reference-to-video' | 'video-edit'

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
  image: '/images/video-community/video-demo-11.png',
  homepageCover: '/images/video-community/video-demo-11.png',
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
    description: 'Wan 2.2 image-to-video Lightning workflow.',
    image: '/models/video/Wan2.2-I2V-Lightning.jpg',
    homepageCover: '/models/homepageModelCover/wan-video.png',
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
    description: 'Grok image-to-video model with fixed 480p output.',
    image: '/models/video/grok-imagine-1.0-video.jpg',
    homepageCover: '/models/homepageModelCover/grok-video.png',
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
    id: 'happyhorse-1.0-t2v',
    name: 'HappyHorse T2V',
    description: 'HappyHorse 文生视频模型，根据文字提示生成 3-15 秒视频。',
    tags: ['t2v', 'fastGeneration'],
    mode: 'text-to-video',
  },
  {
    ...HAPPYHORSE_COMMON,
    id: 'happyhorse-1.0-i2v',
    name: 'HappyHorse I2V',
    description: 'HappyHorse 图生视频模型，将上传图片作为首帧生成 3-15 秒视频。',
    tags: ['i2v', 'fastGeneration'],
    mode: 'image-to-video',
  },
  {
    ...HAPPYHORSE_COMMON,
    id: 'happyhorse-1.0-r2v',
    name: 'HappyHorse R2V',
    description: 'HappyHorse 参考生视频模型，使用 1-9 张参考图和文字提示生成 3-15 秒视频。',
    tags: ['r2v', 'fastGeneration'],
    mode: 'reference-to-video',
    maxReferenceImages: 9,
  },
  {
    ...HAPPYHORSE_COMMON,
    id: 'happyhorse-1.0-video-edit',
    name: 'HappyHorse Video Edit',
    description: 'HappyHorse 视频编辑模型，根据文字指令和可选参考图编辑源视频。',
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

export async function getAvailableVideoModels(): Promise<VideoModelConfig[]> {
  try {
    const response = await fetch('/api/video-models')
    if (!response.ok) {
      throw new Error('Failed to fetch available video models')
    }

    const data = await response.json()
    return data.models || []
  } catch (error) {
    console.error('Error fetching available video models:', error)
    return ALL_VIDEO_MODELS
  }
}

export function getAllVideoModels(): VideoModelConfig[] {
  return ALL_VIDEO_MODELS
}

export function getVideoModelById(modelId: string): VideoModelConfig | null {
  return ALL_VIDEO_MODELS.find(model => model.id === modelId) || null
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
