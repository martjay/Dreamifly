import { NextResponse } from 'next/server'
import { db } from '@/db'
import { user, imageReports, userGeneratedImages, communityMedia } from '@/db/schema'
import { eq, and, or, sql, inArray } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { v4 as uuidv4 } from 'uuid'

/**
 * 举报社区图片 API
 * 允许已登录用户举报不当内容，分为两种处理方式：
 * 1. 一票举报权：管理员和优质用户举报后直接标记为 NSFW
 * 2. 累计举报：其他用户举报需达到阈值后标记为 NSFW
 *
 * 请求格式：
 * POST /api/community/report
 * Body: {
 *   imageId: string,      // 被举报的图片ID
 *   reason: string,       // 举报原因：pornography, political, violence, gore, illegal, other
 *   description?: string  // 详细描述（选择"其他"时可填写）
 * }
 *
 * 权限要求：
 * - 用户必须登录
 * - 同一用户不能重复举报同一图片
 *
 * 处理逻辑：
 * 1. 验证用户登录状态
 * 2. 检查是否重复举报
 * 3. 验证请求参数
 * 4. 验证图片是否存在
 * 5. 根据用户类型执行不同的举报逻辑：
 *    - 管理员/优质用户：直接设置 nsfw=true
 *    - 其他用户：report_count += 1，达到阈值后设置 nsfw=true
 * 6. 插入举报记录到 image_reports 表
 * 7. 返回成功响应
 */

// 举报原因选项
const VALID_REPORT_REASONS = [
  'pornography', // 色情内容
  'political',   // 政治敏感
  'violence',    // 暴力恐怖
  'gore',        // 血腥恶心
  'illegal',     // 违法违规
  'other',       // 其他
] as const

type ReportReason = typeof VALID_REPORT_REASONS[number]

export async function POST(request: Request) {
  try {
    // 1. 验证用户登录状态
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user) {
      return NextResponse.json(
        {
          success: false,
          error: '请先登录'
        },
        { status: 401 }
      )
    }

    // 2. 获取用户信息
    const currentUser = await db.select({
      isAdmin: user.isAdmin,
      isPremium: user.isPremium,
      isSubscribed: user.isSubscribed,
      isOldUser: user.isOldUser
    })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1)

    if (currentUser.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '用户不存在'
        },
        { status: 404 }
      )
    }

    const userData = currentUser[0]

    // 3. 解析请求体
    const body = await request.json()
    const { imageId, reason, description } = body

    // 4. 验证请求参数
    if (!imageId || typeof imageId !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: '缺少或无效的图片ID'
        },
        { status: 400 }
      )
    }

    if (!reason || typeof reason !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: '缺少举报原因'
        },
        { status: 400 }
      )
    }

    if (!VALID_REPORT_REASONS.includes(reason as ReportReason)) {
      return NextResponse.json(
        {
          success: false,
          error: '无效的举报原因'
        },
        { status: 400 }
      )
    }

    // 如果选择"其他"，必须提供描述
    if (reason === 'other' && (!description || description.trim() === '')) {
      return NextResponse.json(
        {
          success: false,
          error: '选择"其他"时必须填写详细描述'
        },
        { status: 400 }
      )
    }

    // 5. 先查已发布社区媒体，举报新社区图时使用社区媒体 ID 作为举报主键
    const publishedMedia = await db.select({
      id: communityMedia.id,
      sourceMediaId: communityMedia.sourceMediaId,
      nsfw: communityMedia.nsfw,
    })
      .from(communityMedia)
      .where(or(eq(communityMedia.id, imageId), eq(communityMedia.sourceMediaId, imageId)))
      .limit(1)

    const reportImageId = publishedMedia[0]?.id || imageId
    const sourceMediaId = publishedMedia[0]?.sourceMediaId || imageId
    const reportTargetIds = Array.from(new Set([reportImageId, sourceMediaId]))

    // 6. 检查是否重复举报
    const existingReport = await db.select({ id: imageReports.id })
      .from(imageReports)
      .where(
        and(
          eq(imageReports.reporterId, session.user.id),
          inArray(imageReports.imageId, reportTargetIds)
        )
      )
      .limit(1)

    if (existingReport.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: '您已举报过此图片，请勿重复举报'
        },
        { status: 400 }
      )
    }

    // 7. 验证图片是否存在且未被删除，兼容旧作品 ID
    const imageExists = publishedMedia.length > 0 ? [] : await db.select({
      id: userGeneratedImages.id,
      reportCount: userGeneratedImages.reportCount,
      nsfw: userGeneratedImages.nsfw,
    })
      .from(userGeneratedImages)
      .where(eq(userGeneratedImages.id, imageId))
      .limit(1)

    if (publishedMedia.length === 0 && imageExists.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '图片不存在或已被删除'
        },
        { status: 404 }
      )
    }

    // 8. 判断用户类型并执行相应的举报逻辑
    const reportId = uuidv4()
    
    // 判断是否为一票举报权用户（管理员或优质用户）
    const hasOneVoteRight = userData.isAdmin || userData.isPremium
    const publishedMediaRecord = publishedMedia[0] || null

    await db.transaction(async (tx) => {
      // 8.1 插入举报记录
      await tx.insert(imageReports).values({
        id: reportId,
        reporterId: session.user.id,
        imageId: reportImageId,
        reason: reason,
        description: description || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      if (hasOneVoteRight) {
        // 8.2a 一票举报权：直接设置 nsfw=true，不更新 report_count
        if (publishedMediaRecord) {
          await tx.update(communityMedia)
            .set({
              nsfw: true,
              updatedAt: new Date(),
            })
            .where(eq(communityMedia.id, publishedMediaRecord.id))
        }

        await tx.update(userGeneratedImages)
          .set({
            nsfw: true,
            updatedAt: new Date(),
          })
          .where(eq(userGeneratedImages.id, sourceMediaId))
      } else {
        // 8.2b 累计举报：增加 report_count，检查是否达到阈值
        const nsfwThreshold = parseInt(process.env.NSFW_REPORT_THRESHOLD || '3', 10)
        
        // 获取当前举报次数
        const currentImage = await tx.select({
          reportCount: userGeneratedImages.reportCount,
          nsfw: userGeneratedImages.nsfw
        })
          .from(userGeneratedImages)
          .where(eq(userGeneratedImages.id, sourceMediaId))
          .limit(1)

        const reportRows = await tx.select({
          count: sql<number>`count(*)`,
        })
          .from(imageReports)
          .where(inArray(imageReports.imageId, reportTargetIds))

        const newReportCount = Number(reportRows[0]?.count || 0)
        const shouldMarkAsNsfw = newReportCount >= nsfwThreshold

        if (currentImage.length > 0) {
          await tx.update(userGeneratedImages)
            .set({
              reportCount: newReportCount,
              nsfw: shouldMarkAsNsfw || currentImage[0].nsfw, // 保持已标记为 nsfw 的状态
              updatedAt: new Date(),
            })
            .where(eq(userGeneratedImages.id, sourceMediaId))

        }

        if (publishedMediaRecord && shouldMarkAsNsfw) {
          await tx.update(communityMedia)
            .set({
              nsfw: true,
              updatedAt: new Date(),
            })
            .where(eq(communityMedia.id, publishedMediaRecord.id))
        }
      }
    })

    // 8. 返回成功响应
    return NextResponse.json({
      success: true,
      message: '举报成功，感谢您的反馈'
    })

  } catch (error) {
    console.error('举报图片失败:', error)
    return NextResponse.json(
      {
        success: false,
        error: '举报失败，请稍后重试'
      },
      { status: 500 }
    )
  }
}
