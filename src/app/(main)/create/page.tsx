import { Suspense } from 'react'
import CreateClient from './CreateClient'
import type { Metadata } from 'next'
import { getAllModels } from '@/utils/modelConfig'

type CreatePageProps = {
  searchParams?: Promise<{
    model?: string
    tab?: string
  }>
}

const defaultCreateDescription =
  '使用 Dreamifly AI 创作页在线生成图片与视频，支持文生图、图生图、图像编辑、参考图控制和多种专业模型选择，可快速完成动漫、插画、写实等风格内容创作与灵感验证。'

export async function generateMetadata({ searchParams }: CreatePageProps): Promise<Metadata> {
  const params = searchParams ? await searchParams : undefined
  const modelId = params?.model
  const model = modelId ? getAllModels().find((item) => item.id === modelId) : undefined

  const description =
    model && params?.tab !== 'video'
      ? `${model.name} 在线生成页，${model.description || '支持高质量 AI 图像生成。'} 在 Dreamifly 可直接输入中文提示词，快速完成文生图创作、风格表达与灵感出图，适合海报、插画、头像和内容配图生成。`
      : defaultCreateDescription

  return {
    title: 'AI 创作 - 文生图 & 图生图 & 视频生成 | Dreamifly',
    description,
  }
}

export default function CreatePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CreateClient />
    </Suspense>
  )
}

