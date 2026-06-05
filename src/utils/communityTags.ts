import OpenAI from 'openai'
import { randomUUID } from 'crypto'
import { db } from '@/db'
import { communityMedia, communityMediaTag, communityPublishedMediaTag, communityTag, userGeneratedImages } from '@/db/schema'
import { decodeMediaFromStorage } from '@/utils/mediaStorage'
import { and, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'

type CommunityTaggingEnv = {
  baseUrl?: string
  apiKey: string
  model: string
  prompt: string
  maxTags: number
}

const COMMUNITY_VISIBLE_USER_ROLES = ['premium', 'oldUser', 'regular']
const COMMUNITY_VISIBLE_EXCLUDED_MODELS = ['Qwen-Image-Edit', 'Flux-Kontext']
const COMMUNITY_VISIBLE_BLOCK_WORDS = [
  '**',
  "I'm sorry",
  'loli',
  'toddler',
  "I can't generate",
]

function buildVisibleCommunityMediaWhere() {
  const blockWordFilters = COMMUNITY_VISIBLE_BLOCK_WORDS.map((word) => {
    return sql`lower(coalesce(${communityMedia.prompt}, '')) not like ${`%${word.toLowerCase()}%`}`
  })

  return and(
    or(
      inArray(communityMedia.userRole, COMMUNITY_VISIBLE_USER_ROLES),
      isNull(communityMedia.userRole)
    ),
    or(
      notInArray(communityMedia.model, COMMUNITY_VISIBLE_EXCLUDED_MODELS),
      isNull(communityMedia.model)
    ),
    eq(communityMedia.moderationLevel, 'low'),
    eq(communityMedia.nsfw, false),
    sql`length(trim(coalesce(${communityMedia.prompt}, ''))) > 0`,
    ...blockWordFilters
  )
}

function getCommunityTaggingEnv(): CommunityTaggingEnv {
  return {
    baseUrl: process.env.COMMUNITY_TAGGING_BASE_URL || process.env.AVATAR_MODERATION_BASE_URL,
    apiKey: process.env.COMMUNITY_TAGGING_API_KEY || process.env.AVATAR_MODERATION_API_KEY || 'ollama',
    model: process.env.COMMUNITY_TAGGING_MODEL || process.env.AVATAR_MODERATION_MODEL || 'Qwen/Qwen3-VL-8B-Instruct-FP8',
    prompt:
      process.env.COMMUNITY_TAGGING_PROMPT ||
      `请忽略图片中的水印或文字。你是一个专业的图像标签生成器，任务是为图片生成用于检索的标签词串。

【输出格式铁律】
1. 仅输出一行纯文本，标签之间用半角斜杠 "/" 分隔。
2. 禁止输出任何解释、问候语、换行符、空格或标点。
3. 标签必须全部使用中文。

【标签生成逻辑 - 必须按以下顺序思考】

第一步：判断图片类型（必选1个）
首先判断这张图片的整体属性，从以下类别中选出最匹配的1个：
- 摄影照片/二次元插画/CG渲染/厚涂插画/线稿/矢量插画/水墨画/油画/像素画
- Logo/徽章/图标/海报/宣传单/电商主图/Banner/UI界面/APP截图/图表/信息图/表情包/梗图/漫画/连环画
- 纯色背景图/纹理背景/壁纸/文字排版/手写便签

第二步：识别画面主体（必选1-3个）
判断画面的核心内容是什么，选出最主要的类别：
- 人物（一个或多个人）/动物/机械/产品/食物/饮料/植物花卉/建筑/室内空间/自然风景/交通工具/抽象图形/文字为主/空镜

第三步：根据主体类型，深入打标签

【分支A：如果主体是人物】
请从以下清单中观察并输出所有显著特征，每个维度不限标签数量：

角色身份：女孩/男孩/成年女性/成年男性/老人/儿童/天使/恶魔/妖精/机器人/士兵/骑士/护士/女仆/学生/偶像/武者/上班族

头发：长发/短发/中长发/黑发/白发/金发/粉发/蓝发/马尾/双马尾/丸子头/散发/刘海/呆毛/发饰/头发飘动

面部：微笑/哭泣/生气/惊讶/闭眼/吐舌/脸红/蓝瞳/红瞳/绿瞳/异色瞳/发光眼睛/眼镜/口罩

身体：苗条/丰满/娇小/纤细/长腿/白皙/小麦色/兽耳/尾巴/翅膀

服装：水手服/连衣裙/洛丽塔/和服/浴衣/西装/衬衫/帽衫/校服/运动服/盔甲/披风/露肩/领带/蝴蝶结

下装与鞋袜：短裙/百褶裙/牛仔裤/光腿/裸足/过膝袜/连裤袜/腿环/高跟鞋/学生皮鞋/运动鞋/拖鞋/赤脚

动作姿态：站姿/坐姿/躺姿/行走/奔跑/跳跃/回头/招手/比耶/双手合十/抱臂/吃东西/喝饮料/看手机/拥抱/面对镜头/背对镜头

装饰与手持：耳机/项链/背包/手机/书本/刀/剑/枪/花束/乐器/食物/饮料/伞

【分支B：如果主体是动物】
动物种类：猫/狗/鸟/鱼/兔子/仓鼠/马/牛/虎/狮/狼/狐狸/熊/熊猫/龙/幻想生物
动物状态：幼崽/成年/坐/卧/奔跑/进食/睡觉/看镜头/群体
特写部位：脸部特写/眼睛特写/爪子/毛发细节

【分支C：如果主体是产品/商品】
产品类型：电子产品/手机/电脑/耳机/手表/相机/美妆产品/护肤品/服装/鞋履/箱包/首饰/家具/餐具/玩具/书籍/食品包装/饮料瓶
拍摄方式：白底图/场景图/模特手持/平铺拍摄/细节特写/多角度组合
电商特征：主图/辅图/带文案/带价格标签/带Logo

【分支D：如果主体是食物/饮料】
食物类型：中餐/西餐/日料/甜点/蛋糕/面包/咖啡/奶茶/酒水/水果/蔬菜/肉类/海鲜/面条/米饭/火锅/烧烤
呈现方式：俯拍/平视/特写/摆盘/切开/流心/冒热气/带餐具/带人物手部

【分支E：如果主体是建筑/空间】
建筑类型：住宅/公寓/别墅/办公楼/商场/教堂/寺庙/城堡/桥梁/塔/古迹/废墟
空间类型：客厅/卧室/厨房/卫生间/办公室/会议室/餐厅/咖啡馆/图书馆/教室/医院/健身房
视角：外观/室内/鸟瞰/仰视/夜景/广角

【分支F：如果主体是自然风景】
景观类型：山/海/湖/河流/瀑布/森林/沙漠/雪景/草原/天空/云/星空/极光/日出/日落
季节：春/夏/秋/冬

【分支G：如果主体是文字/排版】
内容类型：标语/引言/歌词/诗/菜单/价目表/日历/日程/邀请函/名片
排版特征：衬线字体/无衬线字体/手写体/居中排版/左对齐/图文混排

第四步：补充全局标签（无论什么主体都要输出）
- 画面色调：暖色调/冷色调/黑白/高饱和/低饱和/柔和/霓虹色/复古色调
- 光线条件：自然光/逆光/侧光/顶光/柔光/强光/暗光/霓虹灯光/阳光/月光/烛光
- 构图特征：对称构图/三分构图/中心构图/留白/特写/广角/虚化背景/鱼眼/第一人称视角
- 氛围感受：宁静/热闹/孤独/温馨/忧郁/神秘/科幻/恐怖/浪漫/可爱/帅气/优雅/复古/未来感

【输出示例1：电商产品图】
电商主图/产品/耳机/白底图/产品特写/无人物/暖色调/柔光/中心构图/简洁

【输出示例2：风景摄影】
摄影照片/自然风景/山/湖/日落/暖色调/逆光/对称构图/宁静/大气

【输出示例3：UI界面】
UI界面/APP截图/音乐播放器/深色模式/霓虹色/圆角设计/图文混排/无人物

【输出示例4：人物插画】
二次元插画/人物/女孩/粉发/长发/马尾/蓝瞳/微笑/水手服/百褶裙/站姿/比耶/面对镜头/樱花/白天/暖色调/可爱

【输出示例5：表情包】
表情包/梗图/动物/猫/脸部特写/惊讶/睁大眼/文字排版/搞笑`,
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

function normalizeDateValue(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
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
        lastUsedAt: normalizeDateValue(stat?.lastUsedAt),
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

export async function getPublishedCommunityTagsForMediaIds(communityMediaIds: string[]) {
  if (communityMediaIds.length === 0) return {}

  const rows = await db
    .select({
      mediaId: communityPublishedMediaTag.communityMediaId,
      tagName: communityTag.name,
    })
    .from(communityPublishedMediaTag)
    .innerJoin(communityTag, eq(communityPublishedMediaTag.tagId, communityTag.id))
    .where(inArray(communityPublishedMediaTag.communityMediaId, communityMediaIds))

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

export async function getPublishedCommunityMediaIdsByTagKeyword(keyword: string) {
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
    .select({ mediaId: communityPublishedMediaTag.communityMediaId })
    .from(communityPublishedMediaTag)
    .where(inArray(communityPublishedMediaTag.tagId, tagIds))

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

export async function getExactPublishedCommunityMediaIdsForTag(tagName: string) {
  const normalized = normalizeTagName(tagName)
  if (!normalized) return []

  const tags = await db
    .select({ id: communityTag.id })
    .from(communityTag)
    .where(sql`lower(${communityTag.name}) = lower(${normalized})`)
    .limit(1)

  if (tags.length === 0) return []

  const relations = await db
    .select({ mediaId: communityPublishedMediaTag.communityMediaId })
    .from(communityPublishedMediaTag)
    .where(eq(communityPublishedMediaTag.tagId, tags[0].id))

  return relations.map((item) => item.mediaId)
}

export async function getCommunityTagRecommendations(mode: 'latest' | 'hot' | 'random', limit: number) {
  const safeLimit = Math.min(Math.max(limit, 1), 24)
  const liveTagStatsQuery = db
    .select({
      id: communityTag.id,
      name: communityTag.name,
      usageCount: sql<number>`count(${communityPublishedMediaTag.id})::int`,
      lastUsedAt: sql<Date | null>`max(${communityPublishedMediaTag.createdAt})`,
    })
    .from(communityTag)
    .innerJoin(communityPublishedMediaTag, eq(communityTag.id, communityPublishedMediaTag.tagId))
    .innerJoin(communityMedia, eq(communityPublishedMediaTag.communityMediaId, communityMedia.id))
    .where(buildVisibleCommunityMediaWhere())
    .groupBy(communityTag.id, communityTag.name)

  if (mode === 'random') {
    const liveTags = await liveTagStatsQuery
      .having(sql`count(${communityPublishedMediaTag.id}) > 0`)
      .orderBy(sql`random()`)
      .limit(safeLimit)

    return liveTags.map(({ id, name, usageCount }) => ({ id, name, usageCount }))
  }

  const liveTags = await liveTagStatsQuery
    .having(sql`count(${communityPublishedMediaTag.id}) > 0`)
    .orderBy(
      mode === 'hot'
        ? sql`count(${communityPublishedMediaTag.id}) desc`
        : sql`max(${communityPublishedMediaTag.createdAt}) desc nulls last`,
      sql`count(${communityPublishedMediaTag.id}) desc`,
      sql`${communityTag.id} desc`
    )
    .limit(safeLimit)

  return liveTags.map(({ id, name, usageCount }) => ({ id, name, usageCount }))
}
