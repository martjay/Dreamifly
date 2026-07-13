import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { communityMedia, userGeneratedImages, user } from '@/db/schema'
import { eq, isNotNull } from 'drizzle-orm'
import { headers } from 'next/headers'

const DEFAULT_GPT_IMAGE_2_MODEL = 'gpt-image-2.0'

function normalizeModel(model: string) {
  return model === 'gpt-image-2' ? DEFAULT_GPT_IMAGE_2_MODEL : model
}

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user) {
      return NextResponse.json(
        { error: '未授权，请先登录' },
        { status: 401 }
      )
    }

    const currentUser = await db.select()
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1)

    if (currentUser.length === 0 || !currentUser[0].isAdmin) {
      return NextResponse.json(
        { error: '无权限访问，需要管理员权限' },
        { status: 403 }
      )
    }

    const generatedModels = await db
      .select({
        model: userGeneratedImages.model,
      })
      .from(userGeneratedImages)
      .where(isNotNull(userGeneratedImages.model))
      .groupBy(userGeneratedImages.model)

    const communityModels = await db
      .select({
        model: communityMedia.model,
      })
      .from(communityMedia)
      .where(isNotNull(communityMedia.model))
      .groupBy(communityMedia.model)

    const modelList = Array.from(
      new Set(
        [...generatedModels, ...communityModels]
          .map(item => item.model)
          .filter((model): model is string => model !== null)
          .map(normalizeModel)
      )
    ).sort()

    return NextResponse.json({
      success: true,
      models: modelList,
    })
  } catch (error) {
    console.error('Error fetching review image models:', error)
    return NextResponse.json(
      { error: '获取模型列表失败' },
      { status: 500 }
    )
  }
}
