import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { communityLike, userGeneratedImages } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'

async function getSessionUser(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session?.user) {
    return null
  }

  return session.user
}

async function validateMediaExists(imageId: string) {
  const rows = await db
    .select({ id: userGeneratedImages.id })
    .from(userGeneratedImages)
    .where(eq(userGeneratedImages.id, imageId))
    .limit(1)

  return rows.length > 0
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 })
    }

    const { id } = await params
    const exists = await validateMediaExists(id)
    if (!exists) {
      return NextResponse.json({ success: false, error: '作品不存在' }, { status: 404 })
    }

    const existing = await db
      .select({ id: communityLike.id })
      .from(communityLike)
      .where(
        and(
          eq(communityLike.userId, currentUser.id),
          eq(communityLike.imageId, id)
        )
      )
      .limit(1)

    if (existing.length === 0) {
      await db.insert(communityLike).values({
        id: uuidv4(),
        userId: currentUser.id,
        imageId: id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    return NextResponse.json({ success: true, liked: true })
  } catch (error) {
    console.error('Like community image failed:', error)
    return NextResponse.json(
      { success: false, error: '点赞失败，请稍后重试' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 })
    }

    const { id } = await params

    await db
      .delete(communityLike)
      .where(
        and(
          eq(communityLike.userId, currentUser.id),
          eq(communityLike.imageId, id)
        )
      )

    return NextResponse.json({ success: true, liked: false })
  } catch (error) {
    console.error('Unlike community image failed:', error)
    return NextResponse.json(
      { success: false, error: '取消点赞失败，请稍后重试' },
      { status: 500 }
    )
  }
}
