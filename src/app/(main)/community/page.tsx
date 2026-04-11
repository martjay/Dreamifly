import type { Metadata } from 'next'
import CommunityPageClient from './CommunityPageClient'

export const metadata: Metadata = {
  title: 'Dreamifly 社区 - 标签与提示词灵感广场',
  description: '浏览 Dreamifly 社区图片与视频作品，按标签、提示词、模型与生成时间探索最新灵感。',
}

export default function CommunityPage() {
  return <CommunityPageClient />
}
