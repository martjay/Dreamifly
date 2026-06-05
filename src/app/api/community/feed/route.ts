import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { communityMedia, user } from '@/db/schema'
import { and, desc, eq, inArray, isNull, notInArray, or } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import {
  getExactPublishedCommunityMediaIdsForTag,
  getPublishedCommunityMediaIdsByTagKeyword,
  getPublishedCommunityTagsForMediaIds,
} from '@/utils/communityTags'
import { getLikedMediaIdsForUser } from '@/utils/communityLikes'

const COMMUNITY_IMAGE_BLOCK_WORDS = [
  '**',
  "I'm sorry",
  'loli',
  'toddler',
  "I can't generate",
]

const I2I_MODELS = ['Qwen-Image-Edit', 'Flux-Kontext']

function containsCommunityBlockWords(text: string, words: string[]): boolean {
  if (!text || words.length === 0) return false
  const lowerText = text.toLowerCase()

  return words.some((word) => {
    const normalized = word?.trim()
    if (!normalized) return false
    return lowerText.includes(normalized.toLowerCase())
  })
}

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

type CommunityFeedItem = {
  id: string
  sourceMediaId: string
  imageUrl: string
  mediaType: string
  prompt: string | null
  model: string | null
  userAvatar: string | null
  userNickname: string | null
  avatarFrameId: number | null
  createdAt: Date
}

function scoreHotness(item: CommunityFeedItem, tagCount: number) {
  const ageHours = Math.max(1, (Date.now() - new Date(item.createdAt).getTime()) / 3600000)
  return tagCount * 8 + 72 / ageHours
}

export async function GET(request: NextRequest) {
  try {
    const requestHeaders = await headers()
    const accessError = await checkCommunityAccess()
    if (accessError) return accessError

    const session = await auth.api.getSession({
      headers: requestHeaders,
    })

    const q = request.nextUrl.searchParams.get('q')?.trim() || ''
    const tag = request.nextUrl.searchParams.get('tag')?.trim() || ''
    const sort = request.nextUrl.searchParams.get('sort') || 'latest'
    const type = request.nextUrl.searchParams.get('type') || 'all'
    const offset = Math.max(0, Number.parseInt(request.nextUrl.searchParams.get('offset') || '0', 10) || 0)
    const limit = Math.min(
      36,
      Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('limit') || '18', 10) || 18)
    )

    const [matchedTagMediaIds, exactTagMediaIds] = await Promise.all([
      q ? getPublishedCommunityMediaIdsByTagKeyword(q) : Promise.resolve([]),
      tag ? getExactPublishedCommunityMediaIdsForTag(tag) : Promise.resolve([]),
    ])

    const recentMedia = await db
      .select({
        id: communityMedia.id,
        sourceMediaId: communityMedia.sourceMediaId,
        imageUrl: communityMedia.mediaUrl,
        mediaType: communityMedia.mediaType,
        prompt: communityMedia.prompt,
        model: communityMedia.model,
        userAvatar: communityMedia.userAvatar,
        userNickname: communityMedia.userNickname,
        avatarFrameId: communityMedia.avatarFrameId,
        createdAt: communityMedia.createdAt,
      })
      .from(communityMedia)
      .where(
        and(
          or(
            inArray(communityMedia.userRole, ['premium', 'oldUser', 'regular']),
            isNull(communityMedia.userRole)
          ),
          or(
            notInArray(communityMedia.model, I2I_MODELS),
            isNull(communityMedia.model)
          ),
          eq(communityMedia.moderationLevel, 'low'),
          eq(communityMedia.nsfw, false)
        )
      )
      .orderBy(desc(communityMedia.createdAt))
      .limit(sort === 'latest' ? 240 : 600)

    const promptMatchedMediaIds = q
      ? recentMedia
          .filter((item) => (item.prompt || '').toLowerCase().includes(q.toLowerCase()))
          .map((item) => item.id)
      : []

    const queryMatchedIdSet = new Set([...matchedTagMediaIds, ...promptMatchedMediaIds])
    const exactTagIdSet = new Set(exactTagMediaIds)

    let filteredMedia = recentMedia.filter((item) => {
      const prompt = (item.prompt || '').trim()
      if (!prompt) return false
      if (containsCommunityBlockWords(prompt, COMMUNITY_IMAGE_BLOCK_WORDS)) return false
      if (type === 'image' && item.mediaType !== 'image') return false
      if (type === 'video' && item.mediaType !== 'video') return false
      if (tag && !exactTagIdSet.has(item.id)) return false
      if (q && !queryMatchedIdSet.has(item.id)) return false
      return true
    })

    const mediaIds = filteredMedia.map((item) => item.id)
    const tagsMap = await getPublishedCommunityTagsForMediaIds(mediaIds)

    if (sort === 'random') {
      filteredMedia = [...filteredMedia].sort(() => Math.random() - 0.5)
    } else if (sort === 'hot') {
      filteredMedia = [...filteredMedia].sort((a, b) => {
        const aScore = scoreHotness(a, tagsMap[a.id]?.length || 0)
        const bScore = scoreHotness(b, tagsMap[b.id]?.length || 0)
        return bScore - aScore
      })
    }

    const pageItems = filteredMedia.slice(offset, offset + limit)
    const likedIdSet = session?.user
      ? await getLikedMediaIdsForUser(session.user.id, pageItems.map((item) => item.sourceMediaId))
      : new Set<string>()

    return NextResponse.json({
      success: true,
      items: pageItems.map((item) => ({
        id: item.sourceMediaId,
        mediaUrl: item.imageUrl,
        mediaType: item.mediaType || 'image',
        prompt: item.prompt || '',
        model: item.model || '',
        createdAt: item.createdAt,
        tags: tagsMap[item.id] || [],
        userAvatar: item.userAvatar || '/images/default-avatar.svg',
        userNickname: item.userNickname || '',
        avatarFrameId: item.avatarFrameId,
        likedByCurrentUser: likedIdSet.has(item.sourceMediaId),
      })),
      hasMore: offset + limit < filteredMedia.length,
      total: filteredMedia.length,
    })
  } catch (error) {
    console.error('获取社区 feed 失败:', error)
    return NextResponse.json(
      { success: false, error: '获取社区 feed 失败' },
      { status: 500 }
    )
  }
}
