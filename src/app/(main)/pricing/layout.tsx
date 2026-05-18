import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '定价方案 - 会员订阅与积分套餐 | Dreamifly',
  description:
    '查看 Dreamifly 会员订阅与积分套餐价格，了解每日积分、去水印、生成速度、存储容量等权益差异，按创作频率选择更适合的 AI 绘画与视频生成方案。',
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
