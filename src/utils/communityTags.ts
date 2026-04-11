import OpenAI from 'openai'
import { randomUUID } from 'crypto'
import { db } from '@/db'
import { communityMediaTag, communityTag, userGeneratedImages } from '@/db/schema'
import { decodeMediaFromStorage } from '@/utils/mediaStorage'
import { eq, inArray, sql } from 'drizzle-orm'

type CommunityTaggingEnv = {
  baseUrl?: string
  apiKey: string
  model: string
  prompt: string
  maxTags: number
}

function getCommunityTaggingEnv(): CommunityTaggingEnv {
  return {
    baseUrl: process.env.COMMUNITY_TAGGING_BASE_URL || process.env.AVATAR_MODERATION_BASE_URL,
    apiKey: process.env.COMMUNITY_TAGGING_API_KEY || process.env.AVATAR_MODERATION_API_KEY || 'ollama',
    model: process.env.COMMUNITY_TAGGING_MODEL || process.env.AVATAR_MODERATION_MODEL || 'Qwen/Qwen3-VL-8B-Instruct-FP8',
    prompt:
      process.env.COMMUNITY_TAGGING_PROMPT ||
      '请分析该图片的元素和风格，给出一系列符合图片的标签，相邻标签之间用“/”进行分隔，仅输出标签本身，不含思考过程',
    maxTags: Number.parseInt(process.env.COMMUNITY_TAGGING_MAX_TAGS || '18', 10),
  }
}

function normalizeTagName(tag: string): string {
  return tag
    .replace(/^[\s"'`「『【\[\(]+/, '')
    .replace(/[\s"'`」』】\]\)]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildTagSlug(tag: string): string {
  return normalizeTagName(tag)
    .toLowerCase()
    .replace(/[\/\\]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function normalizeCommunityTags(raw: string, maxTags = 18): string[] {
  const parts = raw
    .split(/\/|／|\||\n|,|，|；|;/)
    .map(normalizeTagName)
    .filter(Boolean)

  const unique = new Set<string>()
  const results: string[] = []

  for (const part of parts) {
    if (part.length < 2 || part.length > 24) continue
    const key = part.toLowerCase()
    if (unique.has(key)) continue
    unique.add(key)
    results.push(part)
    if (results.length >= maxTags) break
  }

  return results
}

export function fallbackCommunityTagsFromPrompt(prompt?: string, maxTags = 12): string[] {
  const text = (prompt || '').trim()
  if (!text) return []

  return normalizeCommunityTags(
    text
      .replace(/[。.]/g, '/')
      .replace(/、/g, '/')
      .replace(/,/g, '/')
      .replace(/，/g, '/'),
    maxTags
  )
}

function dataUrlFromBuffer(imageBuffer: Buffer): string {
  return `data:image/png;base64,${imageBuffer.toString('base64')}`
}

function bufferFromBase64Image(input?: string | null): Buffer | null {
  if (!input) return null
  const base64 = input.includes(',') ? input.split(',')[1] : input
  if (!base64) return null

  try {
    return Buffer.from(base64, 'base64')
  } catch {
    return null
  }
}

async function generateCommunityTagsFromImage(imageBuffer: Buffer): Promise<string[]> {
  const env = getCommunityTaggingEnv()
  if (!env.baseUrl) return []

  const client = new OpenAI({
    baseURL: env.baseUrl,
    apiKey: env.apiKey || 'ollama',
  })

  const response = await client.chat.completions.create({
    model: env.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: env.prompt },
          {
            type: 'image_url',
            image_url: {
              url: dataUrlFromBuffer(imageBuffer),
            },
          },
        ],
      },
    ],
    stream: false,
    max_tokens: 200,
    chat_template_kwargs: { enable_thinking: false },
  } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming)

  const content = response.choices[0]?.message?.content?.trim() || ''
  return normalizeCommunityTags(content, env.maxTags)
}

async function refreshCommunityTagStats(tagIds: number[]) {
  const uniqueTagIds = Array.from(new Set(tagIds.filter((id) => Number.isFinite(id))))
  if (uniqueTagIds.length === 0) return

  for (const tagId of uniqueTagIds) {
    const [stat] = await db
      .select({
        count: sql<number>`count(*)`,
        lastUsedAt: sql<Date | null>`max(${communityMediaTag.createdAt})`,
      })
      .from(communityMediaTag)
      .where(eq(communityMediaTag.tagId, tagId))

    await db
      .update(communityTag)
      .set({
        usageCount: Number(stat?.count || 0),
        lastUsedAt: stat?.lastUsedAt ?? null,
        updatedAt: new Date(),
      })
      .where(eq(communityTag.id, tagId))
  }
}

export async function syncCommunityTagsForMedia(mediaId: string, tags: string[]) {
  const normalizedTags = normalizeCommunityTags(tags.join('/'))
  const [existingRelations] = await Promise.all([
    db
      .select({ tagId: communityMediaTag.tagId })
      .from(communityMediaTag)
      .where(eq(communityMediaTag.mediaId, mediaId)),
  ])

  const existingTagIds = existingRelations.map((item) => item.tagId)

  if (normalizedTags.length === 0) {
    if (existingTagIds.length > 0) {
      await db.delete(communityMediaTag).where(eq(communityMediaTag.mediaId, mediaId))
      await refreshCommunityTagStats(existingTagIds)
    }
    return
  }

  const existingTags = await db
    .select({
      id: communityTag.id,
      name: communityTag.name,
    })
    .from(communityTag)
    .where(inArray(communityTag.name, normalizedTags))

  const tagIdMap = new Map(existingTags.map((item) => [item.name, item.id]))
  const missingTags = normalizedTags.filter((tag) => !tagIdMap.has(tag))

  if (missingTags.length > 0) {
    await db
      .insert(communityTag)
      .values(
        missingTags.map((tag) => ({
          name: tag,
          slug: buildTagSlug(tag) || tag,
          usageCount: 0,
          lastUsedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
      )
      .onConflictDoNothing()

    const createdTags = await db
      .select({
        id: communityTag.id,
        name: communityTag.name,
      })
      .from(communityTag)
      .where(inArray(communityTag.name, missingTags))

    for (const item of createdTags) {
      tagIdMap.set(item.name, item.id)
    }
  }

  const nextTagIds = normalizedTags
    .map((tag) => tagIdMap.get(tag))
    .filter((id): id is number => typeof id === 'number')

  await db.delete(communityMediaTag).where(eq(communityMediaTag.mediaId, mediaId))

  if (nextTagIds.length > 0) {
    await db
      .insert(communityMediaTag)
      .values(
        nextTagIds.map((tagId) => ({
          id: randomUUID(),
          mediaId,
          tagId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
      )
      .onConflictDoNothing()
  }

  await refreshCommunityTagStats([...existingTagIds, ...nextTagIds])
}

export async function ensureCommunityTagsForSavedMedia(params: {
  mediaId: string
  prompt?: string
  imageBuffer?: Buffer | null
  referenceImageBase64?: string | null
}) {
  try {
    const imageBuffer = params.imageBuffer || bufferFromBase64Image(params.referenceImageBase64)
    let tags: string[] = []

    if (imageBuffer) {
      try {
        tags = await generateCommunityTagsFromImage(imageBuffer)
      } catch (error) {
        console.error('社区标签生成失败，改用提示词兜底:', error)
      }
    }

    if (tags.length === 0) {
      tags = fallbackCommunityTagsFromPrompt(params.prompt)
    }

    await syncCommunityTagsForMedia(params.mediaId, tags)
  } catch (error) {
    console.error('同步社区标签失败:', error)
  }
}

async function fetchDecodedImageBufferFromUrl(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null

    if (url.endsWith('.dat')) {
      const text = await response.text()
      return decodeMediaFromStorage(Buffer.from(text, 'utf-8'))
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
    console.error('读取社区媒体失败:', error)
    return null
  }
}

export async function ensureCommunityTagsForExistingMedia(mediaId: string) {
  const existing = await db
    .select({ id: communityMediaTag.id })
    .from(communityMediaTag)
    .where(eq(communityMediaTag.mediaId, mediaId))
    .limit(1)

  if (existing.length > 0) return

  const media = await db
    .select({
      id: userGeneratedImages.id,
      prompt: userGeneratedImages.prompt,
      imageUrl: userGeneratedImages.imageUrl,
      mediaType: userGeneratedImages.mediaType,
      referenceImages: userGeneratedImages.referenceImages,
    })
    .from(userGeneratedImages)
    .where(eq(userGeneratedImages.id, mediaId))
    .limit(1)

  const current = media[0]
  if (!current) return

  let imageBuffer: Buffer | null = null
  if (current.mediaType === 'video') {
    const referenceUrl = Array.isArray(current.referenceImages) ? current.referenceImages[0] : null
    if (referenceUrl) {
      imageBuffer = await fetchDecodedImageBufferFromUrl(referenceUrl)
    }
  } else if (current.imageUrl) {
    imageBuffer = await fetchDecodedImageBufferFromUrl(current.imageUrl)
  }

  await ensureCommunityTagsForSavedMedia({
    mediaId,
    prompt: current.prompt || '',
    imageBuffer,
  })
}

export async function getCommunityTagsForMediaIds(mediaIds: string[]) {
  if (mediaIds.length === 0) return {}

  const rows = await db
    .select({
      mediaId: communityMediaTag.mediaId,
      tagName: communityTag.name,
    })
    .from(communityMediaTag)
    .innerJoin(communityTag, eq(communityMediaTag.tagId, communityTag.id))
    .where(inArray(communityMediaTag.mediaId, mediaIds))

  return rows.reduce<Record<string, string[]>>((acc, row) => {
    if (!acc[row.mediaId]) acc[row.mediaId] = []
    acc[row.mediaId].push(row.tagName)
    return acc
  }, {})
}

export async function getMediaIdsByTagKeyword(keyword: string) {
  const normalized = keyword.trim()
  if (!normalized) return []

  const tags = await db
    .select({
      id: communityTag.id,
    })
    .from(communityTag)
    .where(sql`lower(${communityTag.name}) like lower(${`%${normalized}%`})`)

  const tagIds = tags.map((item) => item.id)
  if (tagIds.length === 0) return []

  const relations = await db
    .select({ mediaId: communityMediaTag.mediaId })
    .from(communityMediaTag)
    .where(inArray(communityMediaTag.tagId, tagIds))

  return relations.map((item) => item.mediaId)
}

export async function getExactMediaIdsForTag(tagName: string) {
  const normalized = normalizeTagName(tagName)
  if (!normalized) return []

  const tags = await db
    .select({ id: communityTag.id })
    .from(communityTag)
    .where(sql`lower(${communityTag.name}) = lower(${normalized})`)
    .limit(1)

  if (tags.length === 0) return []

  const relations = await db
    .select({ mediaId: communityMediaTag.mediaId })
    .from(communityMediaTag)
    .where(eq(communityMediaTag.tagId, tags[0].id))

  return relations.map((item) => item.mediaId)
}

export async function getCommunityTagRecommendations(mode: 'latest' | 'hot' | 'random', limit: number) {
  const safeLimit = Math.min(Math.max(limit, 1), 24)
  const liveTagStatsQuery = db
    .select({
      id: communityTag.id,
      name: communityTag.name,
      usageCount: sql<number>`count(${communityMediaTag.id})::int`,
      lastUsedAt: sql<Date | null>`max(${communityMediaTag.createdAt})`,
    })
    .from(communityTag)
    .leftJoin(communityMediaTag, eq(communityTag.id, communityMediaTag.tagId))
    .groupBy(communityTag.id, communityTag.name)

  const fallbackQuery = db
    .select({
      id: communityTag.id,
      name: communityTag.name,
      usageCount: communityTag.usageCount,
      lastUsedAt: communityTag.lastUsedAt,
    })
    .from(communityTag)

  if (mode === 'random') {
    const liveTags = await liveTagStatsQuery
      .having(sql`count(${communityMediaTag.id}) > 0`)
      .orderBy(sql`random()`)
      .limit(safeLimit)

    if (liveTags.length > 0) {
      return liveTags.map(({ id, name, usageCount }) => ({ id, name, usageCount }))
    }

    const fallbackTags = await fallbackQuery.orderBy(sql`random()`).limit(safeLimit)
    return fallbackTags.map(({ id, name, usageCount }) => ({ id, name, usageCount }))
  }

  const liveTags = await liveTagStatsQuery
    .having(sql`count(${communityMediaTag.id}) > 0`)
    .orderBy(
      mode === 'hot'
        ? sql`count(${communityMediaTag.id}) desc`
        : sql`max(${communityMediaTag.createdAt}) desc nulls last`,
      sql`count(${communityMediaTag.id}) desc`,
      sql`${communityTag.id} desc`
    )
    .limit(safeLimit)

  if (liveTags.length > 0) {
    return liveTags.map(({ id, name, usageCount }) => ({ id, name, usageCount }))
  }

  return fallbackQuery
    .orderBy(
      mode === 'hot'
        ? sql`${communityTag.usageCount} desc`
        : sql`${communityTag.lastUsedAt} desc nulls last`,
      sql`${communityTag.usageCount} desc`,
      sql`${communityTag.id} desc`
    )
    .limit(safeLimit)
}
