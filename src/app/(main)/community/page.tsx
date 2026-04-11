import type { Metadata } from 'next'
import CommunityPageClient from './CommunityPageClient'

const siteUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://dreamifly.com').replace(/\/+$/, '')
const communityUrl = `${siteUrl}/community`

export const metadata: Metadata = {
  title: 'AI 图片/视频/提示词分享社区 | Dreamifly',
  description:
    '浏览 Dreamifly AI 社区，发现用户分享的 AI 图片、AI 视频与高质量提示词，按标签快速筛选创作灵感，并一键生成同款内容。',
  keywords: ['AI 图片社区', 'AI 视频社区', '提示词分享', 'AI 提示词社区', 'AI 创作灵感', 'Dreamifly 社区'],
  alternates: {
    canonical: communityUrl,
  },
  openGraph: {
    title: 'AI 图片/视频/提示词分享社区 | Dreamifly',
    description:
      '浏览 Dreamifly AI 社区，发现用户分享的 AI 图片、AI 视频与高质量提示词，按标签快速筛选创作灵感，并一键生成同款内容。',
    url: communityUrl,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI 图片/视频/提示词分享社区 | Dreamifly',
    description:
      '浏览 Dreamifly AI 社区，发现用户分享的 AI 图片、AI 视频与高质量提示词，按标签快速筛选创作灵感，并一键生成同款内容。',
  },
}

export default function CommunityPage() {
  return <CommunityPageClient />
}
