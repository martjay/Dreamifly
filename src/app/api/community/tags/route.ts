import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { user } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { getCommunityTagRecommendations } from '@/utils/communityTags'

async function checkCommunityAccess() {
  const isPublic = process.env.COMMUNITY_IMAGES_PUBLIC !== 'false'
  if (isPublic) return null

  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: '未授权，请先登录' },
      { status: 401 }
    )
  }

  const currentUser = await db
    .select({ isAdmin: user.isAdmin })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)

  if (currentUser.length === 0 || !currentUser[0].isAdmin) {
    return NextResponse.json(
      { success: false, error: '无权限访问，需要管理员权限' },
      { status: 403 }
    )
  }

  return null
}

export async function GET(request: NextRequest) {
  try {
    const accessError = await checkCommunityAccess()
    if (accessError) return accessError

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
