import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  getUserGeneratedImages,
  getUserGeneratedImagesCount,
  getUserImageStorageInfo,
} from '@/utils/userImageStorage'
import {
  getLikedCommunityMediaCount,
  getLikedCommunityMediaForUser,
} from '@/utils/communityLikes'

type GeneratedImage = Awaited<ReturnType<typeof getUserGeneratedImages>>[number]
type LikedImage = Awaited<ReturnType<typeof getLikedCommunityMediaForUser>>[number]

function parsePositiveLimit(value: string | null): number | undefined {
  if (!value) return undefined

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function shouldInclude(value: string | null): boolean {
  return value !== 'false'
}

function serializeGeneratedImage(image: GeneratedImage) {
  return {
    ...image,
    createdAt: image.createdAt.toISOString(),
  }
}

function serializeLikedImage(image: LikedImage) {
  return {
    ...image,
    createdAt: image.createdAt.toISOString(),
    likedAt: image.likedAt.toISOString(),
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = request.nextUrl.searchParams
    const fallbackLimit = parsePositiveLimit(params.get('limit'))
    const generatedLimit = parsePositiveLimit(params.get('generatedLimit')) ?? fallbackLimit
    const likedLimit = parsePositiveLimit(params.get('likedLimit')) ?? fallbackLimit
    const includeGenerated = shouldInclude(params.get('includeGenerated'))
    const includeLiked = shouldInclude(params.get('includeLiked'))
    const includeStorage = shouldInclude(params.get('includeStorage'))

    const [generatedResult, likedResult, storageInfo] = await Promise.all([
      includeGenerated
        ? Promise.all([
            getUserGeneratedImages(session.user.id, generatedLimit),
            getUserGeneratedImagesCount(session.user.id),
          ])
        : Promise.resolve(null),
      includeLiked
        ? Promise.all([
            getLikedCommunityMediaForUser(session.user.id, likedLimit),
            getLikedCommunityMediaCount(session.user.id),
          ])
        : Promise.resolve(null),
      includeStorage ? getUserImageStorageInfo(session.user.id) : Promise.resolve(null),
    ])

    return NextResponse.json({
      success: true,
      generated: generatedResult
        ? {
            images: generatedResult[0].map(serializeGeneratedImage),
            count: generatedResult[1],
            returnedCount: generatedResult[0].length,
            totalCount: generatedResult[1],
          }
        : undefined,
      liked: likedResult
        ? {
            images: likedResult[0].map(serializeLikedImage),
            count: likedResult[1],
            returnedCount: likedResult[0].length,
            totalCount: likedResult[1],
          }
        : undefined,
      storageInfo: storageInfo
        ? {
            ...storageInfo,
            subscriptionExpiresAt: storageInfo.subscriptionExpiresAt?.toISOString() || null,
          }
        : undefined,
    })
  } catch (error) {
    console.error('Error fetching user media library:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
