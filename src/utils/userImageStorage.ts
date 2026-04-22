import { db } from '@/db'
import { userGeneratedImages, user } from '@/db/schema'
import { eq, asc, desc, sql, and, inArray } from 'drizzle-orm'
import { uploadToOSS, deleteFromOSS } from './oss'
import { getImageStorageConfig } from './points'
import { encodeMediaForStorage } from './mediaStorage'
import { getMediaViewConsentMap } from './mediaViewConsent'
import type { VisualRiskLevel } from './visualModeration'
import { ensureCommunityTagsForSavedMedia } from './communityTags'

/**
 * 检查用户是否为订阅用户（实时检查）
 */
async function isSubscribedUser(userId: string): Promise<boolean> {
  const userData = await db
    .select({ 
      isSubscribed: user.isSubscribed, 
      subscriptionExpiresAt: user.subscriptionExpiresAt 
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  
  if (userData.length === 0) return false
  
  const { isSubscribed, subscriptionExpiresAt } = userData[0]
  
  // 检查订阅是否有效（未过期）
  return Boolean(isSubscribed && 
    subscriptionExpiresAt && 
    new Date(subscriptionExpiresAt) > new Date())
}

/**
 * 清理超出数量的旧媒体（图片+视频，从前往后删除，保留最新的）
 * @param userId 用户ID
 * @param maxMedia 最大媒体数量（图片+视频总数）
 */
async function cleanupOldMedia(userId: string, maxMedia: number): Promise<void> {
  // 获取用户的所有媒体（图片+视频），按创建时间升序排列（最旧的在前）
  const allMedia = await db
    .select({ 
      id: userGeneratedImages.id, 
      imageUrl: userGeneratedImages.imageUrl,
      mediaType: userGeneratedImages.mediaType,
      referenceImages: userGeneratedImages.referenceImages
    })
    .from(userGeneratedImages)
    .where(eq(userGeneratedImages.userId, userId))
    .orderBy(asc(userGeneratedImages.createdAt)) // 按创建时间升序：最旧的在前
  
  // 如果超出数量，删除最旧的媒体（从前往后删除）
  if (allMedia.length > maxMedia) {
    const mediaToDelete = allMedia.slice(0, allMedia.length - maxMedia) // 保留最后 maxMedia 个
    
    for (const media of mediaToDelete) {
      // 先删除参考图片（如果有）
      if (media.referenceImages && Array.isArray(media.referenceImages) && media.referenceImages.length > 0) {
        for (const refImageUrl of media.referenceImages) {
          if (refImageUrl && typeof refImageUrl === 'string') {
            try {
              await deleteFromOSS(refImageUrl)
            } catch (error) {
              console.error(`删除参考图片失败: ${refImageUrl}`, error)
              // 继续删除其他文件，不中断流程
            }
          }
        }
      }
      
      // 从数据库删除记录
      await db
        .delete(userGeneratedImages)
        .where(eq(userGeneratedImages.id, media.id))
      
      // 从OSS删除主媒体文件
      try {
        await deleteFromOSS(media.imageUrl)
      } catch (error) {
        console.error(`删除OSS文件失败: ${media.imageUrl}`, error)
        // 继续删除其他文件，不中断流程
      }
    }
    
  }
}


/**
 * 保存用户生成的图片（自动维护数量限制）
 * @param userId 用户ID，如果为null则视为未登录用户
 */
export async function saveUserGeneratedImage(
  userId: string | null,
  imageBase64: string,
  metadata?: {
    prompt?: string
    model?: string
    width?: number
    height?: number
    ipAddress?: string // 客户端IP地址（用于未登录用户记录）
    referenceImages?: string[] // 参考图的base64数组（不包含data:image前缀）
    moderationLevel?: VisualRiskLevel
  },
  options?: {
    /**
     * 已在上层完成审核时可跳过（例如：生成接口同步审核通过后再保存）
     */
    skipModeration?: boolean
  }
): Promise<string> {
  // 1. 检查是否为管理员（管理员不记录未通过审核的图片，但可以保存通过的图片）
  if (userId) {
    const userData = await db
      .select({ isAdmin: user.isAdmin })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
    
    if (userData.length > 0 && userData[0].isAdmin) {
      // 管理员不记录未通过审核的图片，但可以正常保存通过的图片
    }
  }

  // 2. 获取图片存储配置（数据库 > 环境变量 > 默认值）
  const imageConfig = await getImageStorageConfig()
  
  // 3. 实时检查用户订阅状态（仅登录用户）
  let isSubscribed = false
  let maxImages = imageConfig.regularUserMaxImages
  if (userId) {
    isSubscribed = await isSubscribedUser(userId)
    maxImages = isSubscribed ? imageConfig.subscribedUserMaxImages : imageConfig.regularUserMaxImages
  }
  
  // 4. 将base64转换为Buffer
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')
  
  // 4.5 编码图片（统一使用加密存储，避免OSS审核）
  const encodedBuffer = encodeMediaForStorage(buffer)
  
  // 5. 审核（图片和提示词都需要通过）
  if (!options?.skipModeration) {
    const { moderateGeneratedOutput } = await import('./moderationFlow')

    const decision = await moderateGeneratedOutput({
      imageBuffer: buffer,
      prompt: metadata?.prompt,
      hasReferenceImages: Boolean(metadata?.referenceImages && metadata.referenceImages.length > 0),
    })

    if (!decision.approved) {
      // 保存未通过审核的图片
      try {
        const { saveRejectedImage } = await import('./rejectedImageStorage')

        // 先保存参考图（如果有）
        let referenceImageUrls: string[] = []
        if (metadata?.referenceImages && metadata.referenceImages.length > 0) {
          try {
            const { saveReferenceImages } = await import('./referenceImageStorage')
            referenceImageUrls = await saveReferenceImages(metadata.referenceImages)
          } catch (error) {
            console.error('保存未通过审核图片的参考图失败:', error)
          }
        }

        const rejectionReason =
          decision.reason === 'prompt' ? 'prompt' : decision.reason === 'image' ? 'image' : 'both'

        await saveRejectedImage(buffer, {
          userId: userId || null,
          ipAddress: metadata?.ipAddress,
          prompt: metadata?.prompt,
          model: metadata?.model,
          width: metadata?.width,
          height: metadata?.height,
          rejectionReason,
          referenceImages: referenceImageUrls,
        })
      } catch (error) {
        console.error('保存未通过审核图片失败:', error)
      }
      throw new Error('审核未通过，无法保存')
    }
  }
  
  // 6. 审核通过后，保存参考图到OSS（如果有参考图）
  let referenceImageUrls: string[] = []
  if (metadata?.referenceImages && metadata.referenceImages.length > 0) {
    try {
      const { saveReferenceImages } = await import('./referenceImageStorage')
      // 将base64数组转换为OSS URL数组
      referenceImageUrls = await saveReferenceImages(metadata.referenceImages)
    } catch (error) {
      console.error('保存参考图失败:', error)
      // 不阻止主流程，继续保存生成的图片
    }
  }
  
  // 7. 上传到OSS（使用加密存储，.dat扩展名）
  const { v4: uuidv4 } = await import('uuid')
  const fileName = `${uuidv4()}.dat` // 改为.dat扩展名，统一使用加密存储
  
  // 按日期生成文件夹路径：YYYY/MM/DD
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const dateFolder = `${year}/${month}/${day}`
  
  // 构建完整路径：user-generated-images/YYYY/MM/DD
  const folderPath = `user-generated-images/${dateFolder}`
  const imageUrl = await uploadToOSS(encodedBuffer, fileName, folderPath) // 使用加密后的buffer
  
  // 8. 获取用户信息（角色、头像、昵称、头像框）- 仅登录用户
  let userData: Array<{
    isAdmin: boolean
    isSubscribed: boolean
    subscriptionExpiresAt: Date | null
    isPremium: boolean
    isOldUser: boolean
    avatar: string | null
    nickname: string | null
    avatarFrameId: number | null
  }> = []
  
  if (userId) {
    const rawUserData = await db
      .select({
        isAdmin: user.isAdmin,
        isSubscribed: user.isSubscribed,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        isPremium: user.isPremium,
        isOldUser: user.isOldUser,
        avatar: user.avatar,
        nickname: user.nickname,
        avatarFrameId: user.avatarFrameId,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
    
    // 确保布尔字段不为 null
    userData = rawUserData.map(u => ({
      isAdmin: u.isAdmin ?? false,
      isSubscribed: u.isSubscribed ?? false,
      subscriptionExpiresAt: u.subscriptionExpiresAt,
      isPremium: u.isPremium ?? false,
      isOldUser: u.isOldUser ?? false,
      avatar: u.avatar,
      nickname: u.nickname,
      avatarFrameId: u.avatarFrameId,
    }))
  }

  // 判断用户角色
  let userRole: 'admin' | 'subscribed' | 'premium' | 'oldUser' | 'regular' = 'regular'
  if (userData.length > 0) {
    const userInfo = userData[0]
    if (userInfo.isAdmin) {
      userRole = 'admin'
    } else if (userInfo.isSubscribed && userInfo.subscriptionExpiresAt && new Date(userInfo.subscriptionExpiresAt) > new Date()) {
      userRole = 'subscribed'
    } else if (userInfo.isPremium) {
      userRole = 'premium'
    } else if (userInfo.isOldUser) {
      userRole = 'oldUser'
    }
  }

  const userAvatar = userData.length > 0 ? (userData[0].avatar || '/images/default-avatar.svg') : '/images/default-avatar.svg'
  const userNickname = userData.length > 0 ? (userData[0].nickname || null) : null
  const avatarFrameId = userData.length > 0 ? userData[0].avatarFrameId : null

  // 9. 保存到数据库（仅登录用户）
  if (userId) {
    const imageId = uuidv4()
    await db.insert(userGeneratedImages).values({
      id: imageId,
      userId,
      imageUrl,
      prompt: metadata?.prompt,
      model: metadata?.model,
      width: metadata?.width,
      height: metadata?.height,
      moderationLevel: metadata?.moderationLevel || 'low',
      manualReviewStatus: 'pending',
      manualReviewedAt: null,
      manualReviewedBy: null,
      nsfw: metadata?.moderationLevel ? metadata.moderationLevel !== 'low' : false,
      userRole,
      userAvatar,
      userNickname,
      avatarFrameId,
      referenceImages: referenceImageUrls, // 保存参考图URL数组
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    void ensureCommunityTagsForSavedMedia({
      mediaId: imageId,
      prompt: metadata?.prompt,
      imageBuffer: buffer,
    })
    
    // 10. 自动清理超出数量的旧媒体（图片+视频，从前往后删除，保留最新的）
    // 无论会员是否过期，都会自动维护对应的上限
    await cleanupOldMedia(userId, maxImages)
  }
  
  return imageUrl
}

/**
 * 获取用户的所有保存的媒体（图片和视频，最新的在前）
 */
export async function getUserGeneratedImages(
  userId: string,
  limit?: number
): Promise<Array<{
  id: string
  imageUrl: string
  mediaType?: string | null
  prompt?: string | null
  model?: string | null
  moderationLevel?: string | null
  hasViewConsent: boolean
  width?: number | null
  height?: number | null
  duration?: number | null
  fps?: number | null
  frameCount?: number | null
  createdAt: Date
}>> {
  const conditions = and(
    eq(userGeneratedImages.userId, userId),
    inArray(userGeneratedImages.moderationLevel, ['low', 'medium'])
  )

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
    })
    .from(userGeneratedImages)
    .where(conditions)
    .orderBy(desc(userGeneratedImages.createdAt))

  const images = typeof limit === 'number' ? await baseQuery.limit(limit) : await baseQuery
  const consentMap = await getMediaViewConsentMap(userId, images.map((image) => image.id))

  return images.map((image) => ({
    ...image,
    hasViewConsent: Boolean(consentMap[image.id]),
  }))
}

export async function getUserGeneratedImagesCount(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userGeneratedImages)
    .where(
      and(
        eq(userGeneratedImages.userId, userId),
        inArray(userGeneratedImages.moderationLevel, ['low', 'medium'])
      )
    )

  return Number(rows[0]?.count || 0)
}

/**
 * 删除用户指定的图片
 */
export async function deleteUserGeneratedImage(
  userId: string,
  imageId: string
): Promise<boolean> {
  // 先获取图片信息，确保是用户的图片
  const image = await db
    .select()
    .from(userGeneratedImages)
    .where(
      and(
        eq(userGeneratedImages.id, imageId),
        eq(userGeneratedImages.userId, userId)
      )
    )
    .limit(1)
  
  if (image.length === 0) {
    return false
  }
  
  // 先删除参考图片（如果有）
  if (image[0].referenceImages && Array.isArray(image[0].referenceImages) && image[0].referenceImages.length > 0) {
    for (const refImageUrl of image[0].referenceImages) {
      if (refImageUrl && typeof refImageUrl === 'string') {
        try {
          await deleteFromOSS(refImageUrl)
        } catch (error) {
          console.error(`删除参考图片失败: ${refImageUrl}`, error)
          // 继续删除其他文件，不中断流程
        }
      }
    }
  }
  
  // 从数据库删除
  await db
    .delete(userGeneratedImages)
    .where(eq(userGeneratedImages.id, imageId))
  
  // 从OSS删除主媒体文件
  try {
    await deleteFromOSS(image[0].imageUrl)
  } catch (error) {
    console.error(`删除OSS文件失败: ${image[0].imageUrl}`, error)
  }
  
  return true
}

/**
 * 获取用户媒体存储状态信息（图片+视频）
 */
export async function getUserImageStorageInfo(userId: string): Promise<{
  currentCount: number
  maxImages: number
  isSubscribed: boolean
  subscriptionExpiresAt: Date | null
  canAddMore: boolean
  message?: string
}> {
  // 获取存储配置（数据库 > 环境变量 > 默认值）
  const imageConfig = await getImageStorageConfig()
  
  const isSubscribed = await isSubscribedUser(userId)
  const maxImages = isSubscribed ? imageConfig.subscribedUserMaxImages : imageConfig.regularUserMaxImages
  
  // 获取当前媒体数量（图片+视频）
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(userGeneratedImages)
    .where(eq(userGeneratedImages.userId, userId))
  
  const currentCount = Number(countResult[0]?.count || 0)
  
  // 获取订阅过期时间
  const userData = await db
    .select({ subscriptionExpiresAt: user.subscriptionExpiresAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  
  const subscriptionExpiresAt = userData[0]?.subscriptionExpiresAt || null
  
  // 判断是否可以新增（实际上总是可以新增，系统会自动清理）
  const canAddMore = true
  
  // 生成提示信息
  let message: string | undefined
  if (!isSubscribed && currentCount >= imageConfig.regularUserMaxImages) {
    message = `您的会员已过期，当前保存了 ${currentCount} 个作品（图片+视频）。继续添加新作品时，系统会自动保留最新的 ${imageConfig.regularUserMaxImages} 个。`
  } else if (isSubscribed && currentCount >= imageConfig.subscribedUserMaxImages - 5) {
    message = `您已保存 ${currentCount}/${imageConfig.subscribedUserMaxImages} 个作品（图片+视频），接近上限。继续添加新作品时，系统会自动保留最新的 ${imageConfig.subscribedUserMaxImages} 个。`
  } else if (!isSubscribed) {
    message = `普通用户最多保存 ${imageConfig.regularUserMaxImages} 个作品（图片+视频）。订阅会员可保存最多 ${imageConfig.subscribedUserMaxImages} 个。`
  }
  
  return {
    currentCount,
    maxImages,
    isSubscribed,
    subscriptionExpiresAt,
    canAddMore,
    message,
  }
}

