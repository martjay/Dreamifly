import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import {
  communityMedia,
  communityMediaTag,
  communityPublishedMediaTag,
  userGeneratedImages,
} from '@/db/schema'
import { decodeMediaFromStorage, encodeMediaForStorage } from '@/utils/mediaStorage'
import { uploadToOSS } from '@/utils/oss'

async function fetchMediaBufferFromUrl(mediaUrl: string): Promise<Buffer> {
  const response = await fetch(mediaUrl)
  if (!response.ok) {
    throw new Error(`读取来源媒体失败: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  if (mediaUrl.endsWith('.dat')) {
    return decodeMediaFromStorage(buffer)
  }

  return buffer
}

function buildCommunityMediaFolder(mediaType: string | null): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const mediaFolder = mediaType === 'video' ? 'videos' : 'images'

  return `community-media/${mediaFolder}/${year}/${month}/${day}`
}

function buildCommunityMediaUpload(mediaBuffer: Buffer, mediaType: string | null) {
  if (mediaType === 'video') {
    return {
      fileBuffer: encodeMediaForStorage(mediaBuffer),
      fileName: `${randomUUID()}.dat`,
    }
  }

  return {
    fileBuffer: mediaBuffer,
    fileName: `${randomUUID()}.png`,
  }
}

async function copyPublishedTags(sourceMediaId: string, communityMediaId: string) {
  const oldRelations = await db
    .select({
      tagId: communityMediaTag.tagId,
    })
    .from(communityMediaTag)
    .where(eq(communityMediaTag.mediaId, sourceMediaId))

  if (oldRelations.length === 0) return

  await db
    .insert(communityPublishedMediaTag)
    .values(
      oldRelations.map((relation) => ({
        id: randomUUID(),
        communityMediaId,
        tagId: relation.tagId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    )
    .onConflictDoNothing()
}

export async function publishCommunityMediaFromGeneratedImage(params: {
  sourceMediaId: string
  approvedBy: string
}) {
  const existing = await db
    .select({
      id: communityMedia.id,
    })
    .from(communityMedia)
    .where(eq(communityMedia.sourceMediaId, params.sourceMediaId))
    .limit(1)

  if (existing[0]) {
    await copyPublishedTags(params.sourceMediaId, existing[0].id)
    return existing[0].id
  }

  const sourceRows = await db
    .select({
      id: userGeneratedImages.id,
      userId: userGeneratedImages.userId,
      imageUrl: userGeneratedImages.imageUrl,
      mediaType: userGeneratedImages.mediaType,
      prompt: userGeneratedImages.prompt,
      model: userGeneratedImages.model,
      width: userGeneratedImages.width,
      height: userGeneratedImages.height,
      duration: userGeneratedImages.duration,
      fps: userGeneratedImages.fps,
      frameCount: userGeneratedImages.frameCount,
      userRole: userGeneratedImages.userRole,
      userAvatar: userGeneratedImages.userAvatar,
      userNickname: userGeneratedImages.userNickname,
      avatarFrameId: userGeneratedImages.avatarFrameId,
      moderationLevel: userGeneratedImages.moderationLevel,
      nsfw: userGeneratedImages.nsfw,
      manualReviewedAt: userGeneratedImages.manualReviewedAt,
      createdAt: userGeneratedImages.createdAt,
    })
    .from(userGeneratedImages)
    .where(eq(userGeneratedImages.id, params.sourceMediaId))
    .limit(1)

  const source = sourceRows[0]
  if (!source) {
    throw new Error('来源作品不存在')
  }

  const mediaBuffer = await fetchMediaBufferFromUrl(source.imageUrl)
  const { fileBuffer, fileName } = buildCommunityMediaUpload(mediaBuffer, source.mediaType)
  const mediaUrl = await uploadToOSS(fileBuffer, fileName, buildCommunityMediaFolder(source.mediaType))
  const communityMediaId = randomUUID()
  const now = new Date()

  await db.insert(communityMedia).values({
    id: communityMediaId,
    sourceMediaId: source.id,
    sourceUserId: source.userId,
    sourceMediaUrl: source.imageUrl,
    mediaUrl,
    mediaType: source.mediaType || 'image',
    prompt: source.prompt,
    model: source.model,
    width: source.width,
    height: source.height,
    duration: source.duration,
    fps: source.fps,
    frameCount: source.frameCount,
    userRole: source.userRole,
    userAvatar: source.userAvatar,
    userNickname: source.userNickname,
    avatarFrameId: source.avatarFrameId,
    moderationLevel: source.moderationLevel || 'low',
    nsfw: source.nsfw || false,
    approvedAt: source.manualReviewedAt || now,
    approvedBy: params.approvedBy,
    createdAt: source.createdAt || now,
    updatedAt: now,
  })

  await copyPublishedTags(source.id, communityMediaId)

  return communityMediaId
}
