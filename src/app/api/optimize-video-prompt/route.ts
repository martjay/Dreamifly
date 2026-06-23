import { NextRequest, NextResponse } from 'next/server'
import type { VideoModelMode } from '@/utils/videoModelConfig'
import { getElapsedSeconds, recordModelUsage } from '@/utils/modelUsageStats'

type MediaContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'video_url'; video_url: { url: string } }

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | MediaContent[]
}

interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
  chat_template_kwargs?: { enable_thinking?: boolean }
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

function detectLanguage(text: string): 'chinese' | 'english' {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length
  if (chineseChars > 0 && chineseChars >= englishChars) return 'chinese'
  return 'english'
}

function normalizeDataUrl(value: string, fallbackMime: string): string {
  return value.startsWith('data:') ? value : `data:${fallbackMime};base64,${value}`
}

function getModeLabel(mode: VideoModelMode): string {
  switch (mode) {
    case 'text-to-video':
      return '文生视频'
    case 'image-to-video':
      return '图生视频'
    case 'reference-to-video':
      return '参考图生视频'
    case 'video-edit':
      return '视频生视频/视频编辑'
    default:
      return '视频生成'
  }
}

function getSystemPrompt(mode: VideoModelMode, hasPrompt: boolean, isChineseInput: boolean): string {
  const languageRule = hasPrompt
    ? isChineseInput
      ? '保持输出为中文，不要翻译成英文。'
      : 'Keep the output in English. Do not translate it into Chinese.'
    : '使用中文输出。'

  const modeLabel = getModeLabel(mode)
  const mediaRule = (() => {
    switch (mode) {
      case 'text-to-video':
        return '不依赖参考素材，只根据用户文字意图生成或优化提示词。重点补充主体、场景、镜头语言、动作、节奏、光线、风格和视频质量描述。'
      case 'image-to-video':
        return '基于单张首帧图片和用户提示词优化提示词。必须结合图片中的主体、构图、风格、光线、色彩和可延展的动态，不要改动图片中的核心对象。'
      case 'reference-to-video':
        return '基于多张参考图和用户提示词优化提示词。综合参考图中的角色、主体、风格和关键视觉特征，必要时可用 reference image 1、reference image 2 等方式区分参考图。'
      case 'video-edit':
        return '基于源视频和用户提示词优化视频编辑/视频生视频提示词。需要理解源视频中的主体、场景、运动、镜头和可编辑目标，输出清晰的编辑动作、保留内容和目标效果。'
      default:
        return '根据用户输入优化视频生成提示词。'
    }
  })()

  const taskRule = hasPrompt
    ? '优化用户已有提示词，修正表达不清、动作不足、镜头描述不足和质量描述不足的问题。'
    : '根据当前模式和参考素材生成一段完整提示词。'

  return `你是一位专业的 AI 视频生成提示词优化工程师，当前任务类型是：${modeLabel}。

${languageRule}
${mediaRule}
${taskRule}

优化要求：
1. 保持用户核心意图，不要改变主体、风格或编辑目标。
2. 补充适合视频生成的动作、镜头、时间变化、环境变化和动态细节。
3. 让提示词简洁、可执行、逻辑清晰，适合直接提交给视频生成模型。
4. 可加入必要的质量描述，例如高质量、流畅运动、稳定画面、电影级光影、细节丰富。
5. 只返回最终提示词，不要解释，不要添加标题，不要输出多套方案。`
}

function getUserText(mode: VideoModelMode, prompt: string, hasPrompt: boolean): string {
  const modeLabel = getModeLabel(mode)
  if (hasPrompt) {
    return `请根据当前${modeLabel}模式和已提供的素材，优化以下提示词，使其更适合视频生成：\n\n${prompt}`
  }
  return `请根据当前${modeLabel}模式和已提供的素材，生成一段详细、专业、可直接用于视频生成的提示词。`
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const optimizationModel = process.env.PROMPT_OPTIMIZATION_MODEL || 'Qwen/Qwen3-VL-8B-Instruct-FP8'
  let modelCallStarted = false
  let statsRecorded = false

  try {
    const body = await request.json()
    const prompt = typeof body.prompt === 'string' ? body.prompt : ''
    const mode = (body.mode || 'image-to-video') as VideoModelMode
    const image = typeof body.image === 'string' ? body.image : ''
    const images: string[] = Array.isArray(body.images) ? body.images.filter((item: unknown): item is string => typeof item === 'string' && item.length > 0) : []
    const video = typeof body.video === 'string' ? body.video : ''

    if (!['text-to-video', 'image-to-video', 'reference-to-video', 'video-edit'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid video prompt optimization mode' }, { status: 400 })
    }

    if (mode === 'image-to-video' && !image) {
      return NextResponse.json({ error: 'Image is required for image-to-video prompt optimization' }, { status: 400 })
    }
    if (mode === 'reference-to-video' && images.length === 0) {
      return NextResponse.json({ error: 'At least one reference image is required for reference-to-video prompt optimization' }, { status: 400 })
    }
    if (mode === 'video-edit' && !video) {
      return NextResponse.json({ error: 'Source video is required for video prompt optimization' }, { status: 400 })
    }

    const apiUrl = process.env.PROMPT_OPTIMIZATION_BASE_URL || process.env.OPEN_AI_API
    if (!apiUrl) {
      console.error('PROMPT_OPTIMIZATION_BASE_URL or OPEN_AI_API environment variable is not set')
      return NextResponse.json({ error: 'LLM service is not configured' }, { status: 500 })
    }

    const hasPrompt = prompt.trim().length > 0
    const inputLanguage = hasPrompt ? detectLanguage(prompt) : 'chinese'
    const systemPrompt = getSystemPrompt(mode, hasPrompt, inputLanguage === 'chinese')

    const content: MediaContent[] = []
    if (mode === 'image-to-video') {
      content.push({ type: 'image_url', image_url: { url: normalizeDataUrl(image, 'image/jpeg') } })
    }
    if (mode === 'reference-to-video') {
      images.slice(0, 9).forEach(ref => {
        content.push({ type: 'image_url', image_url: { url: normalizeDataUrl(ref, 'image/jpeg') } })
      })
    }
    if (mode === 'video-edit') {
      content.push({ type: 'video_url', video_url: { url: normalizeDataUrl(video, 'video/mp4') } })
      images.slice(0, 9).forEach(ref => {
        content.push({ type: 'image_url', image_url: { url: normalizeDataUrl(ref, 'image/jpeg') } })
      })
    }
    content.push({ type: 'text', text: getUserText(mode, prompt, hasPrompt) })

    const requestBody: ChatCompletionRequest = {
      model: optimizationModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
      temperature: 0.7,
      max_tokens: process.env.PROMPT_OPTIMIZATION_MAX_TOKENS
        ? parseInt(process.env.PROMPT_OPTIMIZATION_MAX_TOKENS, 10)
        : (process.env.MAX_TOKENS ? parseInt(process.env.MAX_TOKENS, 10) : 1000),
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
    }

    const fullApiUrl = apiUrl.endsWith('/chat/completions') ? apiUrl : `${apiUrl}/chat/completions`
    const apiKey = process.env.PROMPT_OPTIMIZATION_API_KEY || 'ollama'

    modelCallStarted = true
    const response = await fetch(fullApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('LLM service error:', response.status, errorText)
      throw new Error(`LLM service error: ${response.status} - ${errorText}`)
    }

    const data: ChatCompletionResponse = await response.json()
    const optimizedPrompt = data.choices[0]?.message?.content

    if (!optimizedPrompt) {
      throw new Error('No response content received from LLM service')
    }

    await recordModelUsage({
      modelName: optimizationModel,
      modelType: 'prompt_optimization',
      responseTime: getElapsedSeconds(startTime),
      isSuccess: true,
    })
    statsRecorded = true

    return NextResponse.json({
      success: true,
      originalPrompt: prompt,
      optimizedPrompt: optimizedPrompt.trim(),
    })
  } catch (error) {
    if (modelCallStarted && !statsRecorded) {
      await recordModelUsage({
        modelName: optimizationModel,
        modelType: 'prompt_optimization',
        responseTime: getElapsedSeconds(startTime),
        isSuccess: false,
      })
      statsRecorded = true
    }

    console.error('Error in optimize-video-prompt API:', error)
    return NextResponse.json(
      {
        error: 'Failed to optimize prompt',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
