import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getLikedCommunityMediaCount, getLikedCommunityMediaForUser } from '@/utils/communityLikes'

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limitParam = request.nextUrl.searchParams.get('limit')
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : NaN
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined

    const [images, totalCount] = await Promise.all([
      getLikedCommunityMediaForUser(session.user.id, limit),
      getLikedCommunityMediaCount(session.user.id),
    ])

    return NextResponse.json({
      success: true,
      images: images.map((img) => ({
        ...img,
        createdAt: img.createdAt.toISOString(),
        likedAt: img.likedAt.toISOString(),
      })),
      count: totalCount,
      returnedCount: images.length,
      totalCount,
    })
  } catch (error) {
    console.error('Error fetching liked community images:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
