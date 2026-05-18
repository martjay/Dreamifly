import type { VideoModelMode } from '@/utils/videoModelConfig'

export interface VideoPromptOptimizationParams {
  prompt: string
  mode?: VideoModelMode
  image?: string
  images?: string[]
  video?: string
}

/**
 * 调用 LLM 接口优化视频生成提示词。
 * 支持文生视频、图生视频、参考图生视频和视频编辑。
 */
export async function optimizeVideoPrompt(params: VideoPromptOptimizationParams): Promise<string> {
  try {
    const response = await fetch('/api/optimize-video-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`API error: ${response.status} - ${errorData.error || 'Unknown error'}`)
    }

    const data = await response.json()

    if (!data.success || !data.optimizedPrompt) {
      throw new Error('Invalid response from optimization API')
    }

    return data.optimizedPrompt
  } catch (error) {
    console.error('Error optimizing video prompt:', error)
    return fallbackOptimization(params.prompt)
  }
}

function fallbackOptimization(prompt: string): string {
  if (!prompt || prompt.trim().length === 0) {
    return '高质量视频，流畅运动，稳定画面，电影级画质，超详细，专业摄影'
  }

  let optimized = prompt
  const qualityKeywords = ['high quality', 'detailed', 'smooth motion', 'stable', '高质量', '流畅', '稳定']
  const hasQualityKeywords = qualityKeywords.some(keyword =>
    optimized.toLowerCase().includes(keyword)
  )

  if (!hasQualityKeywords) {
    optimized = `${prompt}, high quality, detailed, smooth motion, stable footage`
  }

  return optimized
}
