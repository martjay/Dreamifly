import { db } from '@/db'
import { communityLike, userGeneratedImages } from '@/db/schema'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { getMediaViewConsentMap } from './mediaViewConsent'

export async function getLikedMediaIdsForUser(userId: string, mediaIds: string[]) {
  if (!mediaIds.length) return new Set<string>()

  const rows = await db
    .select({ imageId: communityLike.imageId })
    .from(communityLike)
    .where(
      and(
        eq(communityLike.userId, userId),
        inArray(communityLike.imageId, mediaIds)
      )
    )

  return new Set(rows.map((row) => row.imageId))
}

export async function hasUserLikedMedia(userId: string, imageId: string) {
  const rows = await db
    .select({ id: communityLike.id })
    .from(communityLike)
    .where(
      and(
        eq(communityLike.userId, userId),
        eq(communityLike.imageId, imageId)
      )
    )
    .limit(1)

  return rows.length > 0
}

export async function getLikedCommunityMediaForUser(userId: string, limit?: number) {
  const baseQuery = db
    .select({
      id: userGeneratedImages.id,
      imageUrl: userGeneratedImages.imageUrl,
      mediaType: userGeneratedImages.mediaType,
      prompt: userGeneratedImages.prompt,
      model: userGeneratedImages.model,
      moderationLevel: userGeneratedImages.moderationLevel,
      width: userGeneratedImages.width,
      height: userGeneratedImages.height,
      duration: userGeneratedImages.duration,
      fps: userGeneratedImages.fps,
      frameCount: userGeneratedImages.frameCount,
      createdAt: userGeneratedImages.createdAt,
      likedAt: communityLike.createdAt,
    })
    .from(communityLike)
    .innerJoin(userGeneratedImages, eq(communityLike.imageId, userGeneratedImages.id))
    .where(eq(communityLike.userId, userId))
    .orderBy(desc(communityLike.createdAt))

  const rows = typeof limit === 'number' ? await baseQuery.limit(limit) : await baseQuery

  const consentMap = await getMediaViewConsentMap(userId, rows.map((item) => item.id))

  return rows.map((item) => ({
    ...item,
    hasViewConsent: Boolean(consentMap[item.id]),
  }))
}

export async function getLikedCommunityMediaCount(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(communityLike)
    .where(eq(communityLike.userId, userId))

  return Number(rows[0]?.count || 0)
}
