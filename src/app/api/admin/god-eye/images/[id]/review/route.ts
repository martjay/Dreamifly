import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { and, eq } from 'drizzle-orm'

import { auth } from '@/lib/auth'
import { db } from '@/db'
import { communityMedia, user, userGeneratedImages } from '@/db/schema'
import { publishCommunityMediaFromGeneratedImage } from '@/utils/communityMediaPublisher'

type ManualReviewStatus = 'approved' | 'rejected'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.user) {
      return NextResponse.json({ error: '未授权，请先登录' }, { status: 401 })
    }

    const currentUser = await db
      .select({ isAdmin: user.isAdmin })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1)

    if (currentUser.length === 0 || !currentUser[0].isAdmin) {
      return NextResponse.json({ error: '无权限访问，需要管理员权限' }, { status: 403 })
    }

    const { id } = await context.params
    const body = await request.json().catch(() => ({}))
    const status = body?.status as ManualReviewStatus | undefined

    if (!id) {
      return NextResponse.json({ error: '缺少作品 ID' }, { status: 400 })
    }

    if (status !== 'approved' && status !== 'rejected') {
      return NextResponse.json({ error: '无效的审核状态' }, { status: 400 })
    }

    const existing = await db
      .select({
        id: userGeneratedImages.id,
        moderationLevel: userGeneratedImages.moderationLevel,
        nsfw: userGeneratedImages.nsfw,
      })
      .from(userGeneratedImages)
      .where(and(eq(userGeneratedImages.id, id), eq(userGeneratedImages.moderationLevel, 'low')))
      .limit(1)

    if (existing.length === 0) {
      return NextResponse.json({ error: '作品不存在，或不属于待人工审核范围' }, { status: 404 })
    }

    if (status === 'approved') {
      await publishCommunityMediaFromGeneratedImage({
        sourceMediaId: id,
        approvedBy: session.user.id,
      })
    } else {
      await db
        .update(communityMedia)
        .set({
          nsfw: true,
          updatedAt: new Date(),
        })
        .where(eq(communityMedia.sourceMediaId, id))
    }

    await db
      .update(userGeneratedImages)
      .set({
        manualReviewStatus: status,
        manualReviewedAt: new Date(),
        manualReviewedBy: session.user.id,
        // 驳回后直接下架；通过时不覆盖现有举报下架状态
        nsfw: status === 'rejected' ? true : existing[0].nsfw,
        updatedAt: new Date(),
      })
      .where(eq(userGeneratedImages.id, id))

    return NextResponse.json({
      success: true,
      id,
      manualReviewStatus: status,
    })
  } catch (error) {
    console.error('人工审核作品失败:', error)
    return NextResponse.json({ error: '人工审核失败' }, { status: 500 })
  }
}
