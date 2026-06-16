import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { communityMedia } from '@/db/schema'

const I2I_MODELS = ['Qwen-Image-Edit', 'Flux-Kontext']
const PUBLIC_USER_ROLES = ['premium', 'oldUser', 'regular']
const COMMUNITY_IMAGE_BLOCK_WORDS = [
  '**',
  "I'm sorry",
  'loli',
  'toddler',
  "I can't generate",
]

function containsCommunityBlockWords(text: string, words: string[]) {
  if (!text || words.length === 0) return false
  const lowerText = text.toLowerCase()

  return words.some((word) => {
    const normalized = word?.trim()
    if (!normalized) return false
    return lowerText.includes(normalized.toLowerCase())
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const mediaId = id?.trim()

    if (!mediaId) {
      return NextResponse.json(
        { success: false, code: 'invalid_id', error: '作品ID无效' },
        { status: 400 }
      )
    }

    const rows = await db
      .select({
        id: communityMedia.id,
        sourceMediaId: communityMedia.sourceMediaId,
        mediaType: communityMedia.mediaType,
        prompt: communityMedia.prompt,
        model: communityMedia.model,
        moderationLevel: communityMedia.moderationLevel,
        nsfw: communityMedia.nsfw,
        userRole: communityMedia.userRole,
      })
      .from(communityMedia)
      .where(eq(communityMedia.id, mediaId))
      .limit(1)

    const media = rows[0]

    if (!media) {
      return NextResponse.json(
        { success: false, code: 'not_found', error: '作品不存在' },
        { status: 404 }
      )
    }

    if (media.moderationLevel !== 'low' || media.nsfw) {
      return NextResponse.json(
        { success: false, code: 'content_restricted', error: '该作品因内容审核已不可用' },
        { status: 403 }
      )
    }

    if (!media.prompt?.trim() || containsCommunityBlockWords(media.prompt, COMMUNITY_IMAGE_BLOCK_WORDS)) {
      return NextResponse.json(
        { success: false, code: 'prompt_unavailable', error: '该作品提示词暂不可用' },
        { status: 404 }
      )
    }

    if (media.userRole && !PUBLIC_USER_ROLES.includes(media.userRole)) {
      return NextResponse.json(
        { success: false, code: 'not_public', error: '作品暂不可用于画同款' },
        { status: 404 }
      )
    }

    if (media.model && I2I_MODELS.includes(media.model)) {
      return NextResponse.json(
        { success: false, code: 'model_unavailable', error: '该作品模型暂不可用于画同款' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      item: {
        id: media.id,
        sourceMediaId: media.sourceMediaId,
        mediaType: media.mediaType || 'image',
        prompt: media.prompt || '',
        model: media.model || '',
      },
    })
  } catch (error) {
    console.error('获取社区作品详情失败:', error)
    return NextResponse.json(
      { success: false, code: 'server_error', error: '获取社区作品详情失败' },
      { status: 500 }
    )
  }
}
