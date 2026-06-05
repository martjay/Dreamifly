import { db } from '@/db'
import { communityMedia, communityMediaLike } from '@/db/schema'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

export async function getLikedMediaIdsForUser(userId: string, mediaIds: string[]) {
  if (!mediaIds.length) return new Set<string>()

  const rows = await db
    .select({ mediaId: communityMediaLike.communityMediaId })
    .from(communityMediaLike)
    .where(
      and(
        eq(communityMediaLike.userId, userId),
        inArray(communityMediaLike.communityMediaId, mediaIds)
      )
    )

  return new Set(rows.map((row) => row.mediaId))
}

export async function hasUserLikedMedia(userId: string, mediaId: string) {
  const rows = await db
    .select({ id: communityMediaLike.id })
    .from(communityMediaLike)
    .where(
      and(
        eq(communityMediaLike.userId, userId),
        eq(communityMediaLike.communityMediaId, mediaId)
      )
    )
    .limit(1)

  return rows.length > 0
}

export async function getLikedCommunityMediaForUser(userId: string, limit?: number) {
  const baseQuery = db
    .select({
      id: communityMedia.id,
      imageUrl: communityMedia.mediaUrl,
      mediaType: communityMedia.mediaType,
      prompt: communityMedia.prompt,
      model: communityMedia.model,
      moderationLevel: communityMedia.moderationLevel,
      width: communityMedia.width,
      height: communityMedia.height,
      duration: communityMedia.duration,
      fps: communityMedia.fps,
      frameCount: communityMedia.frameCount,
      createdAt: communityMedia.createdAt,
      likedAt: communityMediaLike.createdAt,
    })
    .from(communityMediaLike)
    .innerJoin(communityMedia, eq(communityMediaLike.communityMediaId, communityMedia.id))
    .where(eq(communityMediaLike.userId, userId))
    .orderBy(desc(communityMediaLike.createdAt))

  const rows = typeof limit === 'number' ? await baseQuery.limit(limit) : await baseQuery

  return rows.map((item) => ({
    ...item,
    hasViewConsent: true,
  }))
}

export async function getLikedCommunityMediaCount(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(communityMediaLike)
    .where(eq(communityMediaLike.userId, userId))

  return Number(rows[0]?.count || 0)
}
