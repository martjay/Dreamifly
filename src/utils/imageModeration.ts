import OpenAI from 'openai'
import { parseVisualRiskLevel, type VisualRiskLevel } from './visualModeration'

/**
 * 审核生成的图片，返回视觉风险等级。
 */
export async function moderateGeneratedImage(
  imageBuffer: Buffer,
  fileName: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string
): Promise<VisualRiskLevel> {
  const client = new OpenAI({
    baseURL: baseUrl,
    apiKey: apiKey || 'dummy-key',
  })

  const mimeType = fileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
  const base64Media = imageBuffer.toString('base64')
  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Media}`,
            },
          },
        ],
      },
    ],
    stream: false,
    chat_template_kwargs: { enable_thinking: false },
  } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming)

  const rawResult = response.choices[0]?.message?.content?.trim()
  const level = parseVisualRiskLevel(rawResult)
  if (!level) {
    console.warn('图片视觉审核结果不明确:', rawResult)
    throw new Error('图片视觉审核结果不明确')
  }

  return level
}

function normalizeModerationAnswer(rawResult: string | null | undefined): string {
  return (rawResult || '')
    .trim()
    .toLowerCase()
    .replace(/["'`“”‘’。.!！?？,，、\s]/g, '')
}

function promptUsesViolationSemantics(moderationPrompt: string): boolean {
  return (
    moderationPrompt.includes('是否包含') ||
    moderationPrompt.includes('是否含有') ||
    moderationPrompt.includes('是否存在')
  )
}

/**
 * 审核提示词。
 * @returns true 表示通过，false 表示不通过。
 */
export async function moderatePrompt(
  promptText: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  moderationPrompt: string
): Promise<boolean> {
  try {
    const client = new OpenAI({
      baseURL: baseUrl,
      apiKey: apiKey || 'dummy-key',
    })

    const fullPrompt = moderationPrompt.replace('{prompt}', promptText)
    const response = await client.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: fullPrompt,
        },
      ],
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming)

    const rawResult = response.choices[0]?.message?.content?.trim()
    const result = normalizeModerationAnswer(rawResult)

    if (!result) {
      console.warn('提示词审核结果为空')
      throw new Error('提示词审核结果为空')
    }

    const yes = result === '是' || result === 'yes'
    const no = result === '否' || result === 'no'
    const violationSemantics = promptUsesViolationSemantics(moderationPrompt)

    if (yes || no) {
      return violationSemantics ? no : yes
    }

    if (result.includes('不通过') || result.includes('fail') || result.includes('reject')) {
      return false
    }

    if (result.includes('通过') || result.includes('pass') || result.includes('approve')) {
      return true
    }

    console.warn('提示词审核结果不明确:', rawResult)
    throw new Error('提示词审核结果不明确')
  } catch (error) {
    console.error('提示词审核失败:', error)
    throw new Error(`提示词审核失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}
