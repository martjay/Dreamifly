import { Suspense } from 'react'
import HomeClient from './HomeClient'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dreamifly - 免费 AI 绘画/视频在线生成工具 | 一键生成动漫、插画、艺术图，多样化视频创作',
  description:
    'Dreamifly 是免费在线 AI 绘画与视频创作平台，支持文生图、图生图、图生视频等多种创作方式，覆盖动漫、插画、写实等风格，无需注册即可快速生成图片和短视频，适合灵感探索、内容制作与日常娱乐创作。',
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeClient />
    </Suspense>
  )
}
