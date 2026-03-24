import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI 工作流 - 专业图像处理流程 | Dreamifly',
  description:
    '在 Dreamifly 工作流工具中体验图像修复与高清放大，上传图片即可去除划痕噪点、提升清晰度与细节表现，适合老照片修复、低清图片增强和日常素材优化。',
}

export default function WorkflowsLayout({ children }: { children: React.ReactNode }) {
  return children
}
