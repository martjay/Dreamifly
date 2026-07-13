import { NextRequest, NextResponse } from 'next/server'
import { getCommunityTagRecommendations } from '@/utils/communityTags'

export async function GET(request: NextRequest) {
  try {
    const mode = (request.nextUrl.searchParams.get('mode') || 'latest') as 'latest' | 'hot' | 'random'
    const limit = Math.min(
      18,
      Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('limit') || '10', 10) || 10)
    )

    const tags = await getCommunityTagRecommendations(mode, limit)

    return NextResponse.json({
      success: true,
      tags,
    })
  } catch (error) {
    console.error('获取社区标签失败:', error)
    return NextResponse.json(
      { success: false, error: '获取社区标签失败' },
      { status: 500 }
    )
  }
}
