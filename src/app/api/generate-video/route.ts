import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createHash } from 'crypto'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { user } from '@/db/schema'
import { generateVideo } from '@/utils/videoComfyApi'
import {
  calculateVideoResolution,
  calculateVideoResolutionForModel,
  getVideoAspectRatioOptions,
  getVideoModelById,
  resolveHappyHorseModelId,
  pickClosestAspectRatioLabel,
  type VideoAspectRatioLabel,
  type VideoModelConfig,
  type VideoModelMode,
} from '@/utils/videoModelConfig'
import { getModelBaseCost, checkPointsSufficient, deductPoints, refundPoints, getPointsBalance } from '@/utils/points'
import { saveUserGeneratedVideo } from '@/utils/userVideoStorage'
import { callGrokImagineVideo, downloadMp4AsDataUrl } from '@/utils/grokVideoApi'
import {
  callHappyHorseVideo,
  uploadHappyHorseImage,
  uploadHappyHorseVideo,
  type HappyHorseMediaInput,
  type HappyHorseResolution,
} from '@/utils/happyHorseVideoApi'
import { moderateHappyHorseInputMedia, moderateVideoGenerationInput } from '@/utils/videoModerationFlow'
import { incrementSiteGenerationStats } from '@/utils/siteStats'
import { getClientIP } from '@/utils/clientIp'
import { getElapsedSeconds, recordModelUsage } from '@/utils/modelUsageStats'

export const maxDuration = 1500

function validateDynamicToken(providedToken: string): boolean {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY
  if (!apiKey) return false

  const now = new Date()
  const timeSlots = [now, new Date(now.getTime() - 60 * 1000)]

  for (const timeSlot of timeSlots) {
    const year = timeSlot.getFullYear()
    const month = String(timeSlot.getMonth() + 1).padStart(2, '0')
    const day = String(timeSlot.getDate()).padStart(2, '0')
    const hour = String(timeSlot.getHours()).padStart(2, '0')
    const minute = String(timeSlot.getMinutes()).padStart(2, '0')
    const salt = `${year}${month}${day}${hour}${minute}`
    const expectedToken = createHash('md5').update(apiKey + salt).digest('hex')
    if (providedToken === expectedToken) return true
  }

  return false
}

function parseAspectRatio(aspectRatio: number | string | undefined): number | undefined {
  if (typeof aspectRatio === 'number' && Number.isFinite(aspectRatio) && aspectRatio > 0) {
    return aspectRatio
  }

  if (typeof aspectRatio === 'string' && aspectRatio.includes(':')) {
    const [wStr, hStr] = aspectRatio.split(':')
    const w = parseFloat(wStr)
    const h = parseFloat(hStr)
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return w / h
    }
  }

  return undefined
}

function resolveDimensions(params: {
  modelConfig: VideoModelConfig
  width?: number
  height?: number
  aspectRatio?: number | string
}): { width: number; height: number; closestLabel: VideoAspectRatioLabel } {
  const { modelConfig, width, height, aspectRatio } = params
  const aspectRatioNumber = parseAspectRatio(aspectRatio)
  const ratioFromInput =
    aspectRatioNumber ??
    (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0 ? width / height : 16 / 9)

  const allowedRatioOptions = getVideoAspectRatioOptions(modelConfig)
  const allowedLabels = allowedRatioOptions.map(o => o.label)
  const closestLabel = pickClosestAspectRatioLabel(
    ratioFromInput,
    allowedLabels,
    allowedLabels.includes('1:1' as VideoAspectRatioLabel) ? '1:1' : allowedLabels[0]
  )

  if (modelConfig.provider === 'grok') {
    const resolution = calculateVideoResolutionForModel(modelConfig, closestLabel)
    return { width: resolution.width, height: resolution.height, closestLabel }
  }

  if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
    const maxPixels = modelConfig.totalPixels || 1280 * 720
    const totalPixels = width * height
    if (totalPixels > maxPixels) {
      const scale = Math.sqrt(maxPixels / totalPixels)
      return {
        width: Math.max(64, Math.round((width * scale) / 8) * 8),
        height: Math.max(64, Math.round((height * scale) / 8) * 8),
        closestLabel,
      }
    }

    return {
      width: Math.max(64, Math.round(width / 8) * 8),
      height: Math.max(64, Math.round(height / 8) * 8),
      closestLabel,
    }
  }

  const resolution = calculateVideoResolution(modelConfig, ratioFromInput)
  return { width: resolution.width, height: resolution.height, closestLabel }
}

function clampDuration(value: unknown, fallback: number, min = 3, max = 15): number {
  const raw = typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
  return Math.min(max, Math.max(min, Math.round(raw)))
}

function stripDataUrlPrefix(value: string): string {
  const idx = value.indexOf(',')
  if (value.startsWith('data:') && idx >= 0) return value.slice(idx + 1)
  return value
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : []
}

function getHappyHorseMode(modelConfig: VideoModelConfig): VideoModelMode {
  if (!modelConfig.mode) {
    throw new Error(`HappyHorse model ${modelConfig.id} is missing mode metadata`)
  }
  return modelConfig.mode
}

function parseHappyHorseResolution(value: unknown): HappyHorseResolution | null {
  if (value === undefined || value === null || value === '') return '720P'
  return value === '720P' || value === '1080P' ? value : null
}

function buildInsufficientPointsResponse(pointsCost: number, currentBalance: number) {
  return NextResponse.json(
    {
      error: `积分不足。本次生成需要消耗 ${pointsCost} 积分，但当前余额为 ${currentBalance} 积分。`,
      code: 'INSUFFICIENT_POINTS',
      requiredPoints: pointsCost,
      currentBalance,
    },
    { status: 402 }
  )
}

export async function POST(request: Request) {
  const requestId = Math.random().toString(36).substring(7)
  const totalStartTime = Date.now()
  const clientIP = getClientIP(request)
  let spentRecordId: string | null = null
  let chargedPointsCost = 0
  let currentUserId: string | null = null
  let currentModelId: string | null = null
  let generationModelCallStarted = false
  let generationStatsRecorded = false

  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 })
    }

    if (!validateDynamicToken(authHeader.substring(7))) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) {
      return NextResponse.json({ error: 'Please log in before generating video.', code: 'LOGIN_REQUIRED' }, { status: 401 })
    }

    const userId = session.user.id
    currentUserId = userId
    const currentUser = await db
      .select({ isAdmin: user.isAdmin })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
    const isAdmin = currentUser.length > 0 && currentUser[0].isAdmin

    if (process.env.VIDEO_GENERATION_MAINTENANCE_MODE === 'true' && !isAdmin) {
      return NextResponse.json({ error: 'Video generation is under maintenance.', code: 'MAINTENANCE_MODE' }, { status: 503 })
    }

    const body = await request.json()
    const {
      prompt,
      width,
      height,
      aspectRatio,
      length,
      fps,
      seed,
      steps,
      model,
      image,
      negative_prompt,
      videoSeconds,
      resolution,
      referenceImages,
      sourceVideo,
      videoMode,
    } = body as {
      prompt?: string
      width?: number
      height?: number
      aspectRatio?: number | string
      length?: number
      fps?: number
      seed?: number | string
      steps?: number
      model: string
      image?: string
      negative_prompt?: string
      videoSeconds?: number
      resolution?: string
      referenceImages?: string[]
      sourceVideo?: string
      videoMode?: string
    }

    const promptText = String(prompt ?? '').trim()
    if (!promptText) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const resolvedModel = resolveHappyHorseModelId(model, videoMode)
    currentModelId = resolvedModel
    const modelConfig = getVideoModelById(resolvedModel)
    if (!modelConfig) {
      return NextResponse.json({ error: 'Unknown video model' }, { status: 400 })
    }

    const happyHorseResolution = modelConfig.provider === 'happyhorse'
      ? parseHappyHorseResolution(resolution)
      : '720P'
    if (!happyHorseResolution) {
      return NextResponse.json({ error: 'Invalid HappyHorse resolution. Use 720P or 1080P.' }, { status: 400 })
    }

    const resolved = resolveDimensions({ modelConfig, width, height, aspectRatio })
    const finalWidth = resolved.width
    const finalHeight = resolved.height
    if (!finalWidth || !finalHeight || finalWidth < 64 || finalHeight < 64) {
      return NextResponse.json({ error: 'Invalid video dimensions' }, { status: 400 })
    }

    const refs = asStringArray(referenceImages)
    let billableSeconds = 0
    let generationSeconds = 0

    if (modelConfig.provider === 'happyhorse') {
      const mode = getHappyHorseMode(modelConfig)
      const minSeconds = modelConfig.minVideoSeconds || 3
      const maxSeconds = modelConfig.maxVideoSeconds || 15
      const defaultSeconds = modelConfig.defaultVideoSeconds || 5

      if (mode === 'image-to-video' && !image) {
        return NextResponse.json({ error: 'HappyHorse I2V requires a first-frame image' }, { status: 400 })
      }

      if (mode === 'reference-to-video') {
        if (refs.length < 1 || refs.length > (modelConfig.maxReferenceImages || 9)) {
          return NextResponse.json({ error: 'HappyHorse R2V requires 1-9 reference images' }, { status: 400 })
        }
      }

      if (mode === 'video-edit') {
        if (!sourceVideo) {
          return NextResponse.json({ error: 'HappyHorse video edit requires a source video' }, { status: 400 })
        }
        if (refs.length > (modelConfig.maxReferenceImages || 9)) {
          return NextResponse.json({ error: 'HappyHorse video edit supports at most 9 reference images' }, { status: 400 })
        }
      }

      generationSeconds = clampDuration(videoSeconds, defaultSeconds, minSeconds, maxSeconds)
      billableSeconds = generationSeconds
    } else if (modelConfig.provider === 'grok') {
      if (!image) {
        return NextResponse.json({ error: 'Grok video requires an input image' }, { status: 400 })
      }
      generationSeconds = clampDuration(videoSeconds, modelConfig.defaultVideoSeconds || 6, 1, 30)
      billableSeconds = generationSeconds
    } else {
      if (!image) {
        return NextResponse.json({ error: 'Image-to-video requires an input image' }, { status: 400 })
      }
      const videoLength = length || modelConfig.defaultLength || 100
      const comfyFps = fps || modelConfig.defaultFps || 20
      generationSeconds = videoLength / comfyFps
      billableSeconds = Math.ceil(generationSeconds)
    }

    const inputModerationDecision = await moderateVideoGenerationInput({
      prompt: promptText,
    })

    const inputModerationLevel = inputModerationDecision.approved ? inputModerationDecision.visualRiskLevel : 'low'

    if (!inputModerationDecision.approved && inputModerationDecision.reason !== 'service_error') {
      return NextResponse.json(
        {
          error: '内容未通过审核',
          code: 'VIDEO_MODERATION_FAILED',
          moderation: inputModerationDecision,
          mediaId: null,
        },
        { status: 403 }
      )
    }
    if (!inputModerationDecision.approved) {
      console.warn(`[generate-video] [${requestId}] Prompt moderation service failed; allowing generation to continue`, {
        reason: inputModerationDecision.reason,
      })
    }

    if (modelConfig.provider === 'happyhorse') {
      const mode = getHappyHorseMode(modelConfig)
      const mediaModerationDecision = await moderateHappyHorseInputMedia({
        firstFrameBase64OrDataUrl: mode === 'image-to-video' ? image || null : null,
        referenceImagesBase64OrDataUrl:
          mode === 'reference-to-video' || mode === 'video-edit' ? refs : [],
        sourceVideoBase64OrDataUrl: mode === 'video-edit' ? sourceVideo || null : null,
      })

      if (!mediaModerationDecision.approved) {
        return NextResponse.json(
          {
            error: mediaModerationDecision.reason === 'service_error'
              ? 'Media moderation is temporarily unavailable. Please try again later.'
              : 'The uploaded image or video did not pass moderation. Please replace it and try again.',
            code: 'HAPPYHORSE_INPUT_MODERATION_FAILED',
            moderation: mediaModerationDecision,
            mediaId: null,
          },
          { status: mediaModerationDecision.reason === 'service_error' ? 503 : 403 }
        )
      }
    }

    let pointsCostForResponse = 0
    if (!isAdmin) {
      const baseCost = await getModelBaseCost(resolvedModel, happyHorseResolution)
      if (baseCost === null) {
        return NextResponse.json({ error: `No points cost configured for video model ${resolvedModel}` }, { status: 400 })
      }

      const pointsCost = modelConfig.provider === 'happyhorse'
        ? Math.max(0, baseCost * billableSeconds)
        : baseCost
      pointsCostForResponse = pointsCost
      chargedPointsCost = pointsCost

      const hasEnoughPoints = await checkPointsSufficient(userId, pointsCost)
      if (!hasEnoughPoints) {
        const currentBalance = await getPointsBalance(userId)
        return buildInsufficientPointsResponse(pointsCost, currentBalance)
      }

      const spendDesc = modelConfig.provider === 'happyhorse'
        ? `视频生成 - ${resolvedModel} (${happyHorseResolution}, ${finalWidth}x${finalHeight}, ${billableSeconds}s, ${baseCost}/s)`
        : `视频生成 - ${resolvedModel} (${finalWidth}x${finalHeight}, ${billableSeconds}s)`

      spentRecordId = await deductPoints(userId, pointsCost, spendDesc)
      if (!spentRecordId) {
        const currentBalance = await getPointsBalance(userId)
        if (currentBalance < pointsCost) {
          return buildInsufficientPointsResponse(pointsCost, currentBalance)
        }
        return NextResponse.json({ error: 'Points deduction failed', code: 'POINTS_DEDUCTION_FAILED' }, { status: 500 })
      }
    }

    let videoUrl: string
    let videoDurationSeconds: number
    let videoFps: number | undefined
    let videoFrameCount: number | undefined
    const referenceImagesForStorage: string[] = []

    if (modelConfig.provider === 'grok') {
      const apiUrl = process.env.GROK_VIDEO_API_URL || ''
      const apiKey = process.env.GROK_VIDEO_API_KEY || 'xxx'
      let imageUrl: string = image as string
      if (typeof imageUrl === 'string' && !imageUrl.startsWith('data:')) {
        imageUrl = `data:image/jpeg;base64,${imageUrl}`
      }

      generationModelCallStarted = true
      const { mp4Url } = await callGrokImagineVideo({
        apiUrl,
        apiKey,
        imageBase64DataUrl: imageUrl,
        promptText,
        aspectRatio: resolved.closestLabel as any,
        videoSeconds: generationSeconds,
      })

      videoUrl = await downloadMp4AsDataUrl({ url: mp4Url, apiKey })
      videoDurationSeconds = generationSeconds
      videoFps = undefined
      videoFrameCount = undefined
      referenceImagesForStorage.push(stripDataUrlPrefix(image as string))
    } else if (modelConfig.provider === 'happyhorse') {
      const mode = getHappyHorseMode(modelConfig)
      const media: HappyHorseMediaInput[] = []

      if (mode === 'image-to-video') {
        const firstFrameUrl = await uploadHappyHorseImage(image as string, 'happyhorse-first-frames')
        media.push({ type: 'first_frame', url: firstFrameUrl })
        referenceImagesForStorage.push(stripDataUrlPrefix(image as string))
      } else if (mode === 'reference-to-video') {
        const uploadedRefs = await Promise.all(refs.map(ref => uploadHappyHorseImage(ref, 'happyhorse-reference-images')))
        media.push(...uploadedRefs.map(url => ({ type: 'reference_image' as const, url })))
        referenceImagesForStorage.push(...refs.map(stripDataUrlPrefix))
      } else if (mode === 'video-edit') {
        const sourceVideoUrl = await uploadHappyHorseVideo(sourceVideo as string, 'happyhorse-source-videos')
        media.push({ type: 'video', url: sourceVideoUrl })
        if (refs.length > 0) {
          const uploadedRefs = await Promise.all(refs.map(ref => uploadHappyHorseImage(ref, 'happyhorse-reference-images')))
          media.push(...uploadedRefs.map(url => ({ type: 'reference_image' as const, url })))
          referenceImagesForStorage.push(...refs.map(stripDataUrlPrefix))
        }
      }

      const parsedSeed =
        typeof seed === 'number'
          ? seed
          : typeof seed === 'string' && seed.trim() !== ''
            ? parseInt(seed, 10)
            : undefined

      generationModelCallStarted = true
      const result = await callHappyHorseVideo({
        mode,
        media,
        promptText,
        durationSeconds: generationSeconds,
        resolution: happyHorseResolution,
        watermark: false,
        seed: typeof parsedSeed === 'number' && Number.isFinite(parsedSeed) ? parsedSeed : undefined,
      })

      videoUrl = await downloadMp4AsDataUrl({ url: result.videoUrl })
      videoDurationSeconds = result.durationSeconds || generationSeconds
      videoFps = 24
      videoFrameCount = Math.round(videoDurationSeconds * 24)
    } else {
      generationModelCallStarted = true
      videoUrl = await generateVideo({
        prompt: promptText,
        width: finalWidth,
        height: finalHeight,
        length: length || modelConfig.defaultLength || 100,
        fps: fps || modelConfig.defaultFps || 20,
        seed: typeof seed === 'number'
          ? seed
          : typeof seed === 'string' && seed.trim() !== ''
            ? parseInt(seed, 10)
            : undefined,
        steps: steps || 4,
        model: resolvedModel,
        image,
        negative_prompt,
      })

      const videoLength = length || modelConfig.defaultLength || 100
      const comfyFps = fps || modelConfig.defaultFps || 20
      videoDurationSeconds = videoLength / comfyFps
      videoFps = comfyFps
      videoFrameCount = videoLength
      referenceImagesForStorage.push(stripDataUrlPrefix(image as string))
    }

    try {
      const headersList = await headers()
      const ipAddress = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown'

      await saveUserGeneratedVideo(
        userId,
        videoUrl,
        {
          prompt: promptText,
          model: resolvedModel,
          width: finalWidth,
          height: finalHeight,
          duration: Math.round(videoDurationSeconds),
          fps: videoFps,
          frameCount: videoFrameCount,
          ipAddress,
          referenceImages: referenceImagesForStorage,
          moderationLevel: inputModerationLevel,
        },
        { skipModeration: true }
      )
    } catch (error) {
      console.error(`[generate-video] [${requestId}] Failed to save generated video:`, error)
    }

    try {
      await incrementSiteGenerationStats(1)
    } catch (error) {
      console.error(`[generate-video] [${requestId}] Failed to update site stats:`, error)
    }

    const responseTime = getElapsedSeconds(totalStartTime)
    await recordModelUsage({
      modelName: resolvedModel,
      modelType: 'video_generation',
      responseTime,
      isSuccess: true,
      userId,
      isAuthenticated: true,
      ipAddress: clientIP,
    })
    generationStatsRecorded = true

    return NextResponse.json({
      videoUrl,
      moderation: inputModerationLevel === 'medium'
        ? { visualRiskLevel: inputModerationLevel }
        : undefined,
      responseTime: Math.round(responseTime * 100) / 100,
      pointsCost: pointsCostForResponse,
      duration: Math.round(videoDurationSeconds),
    })
  } catch (error) {
    const totalDuration = Date.now() - totalStartTime

    if (generationModelCallStarted && !generationStatsRecorded && currentModelId) {
      await recordModelUsage({
        modelName: currentModelId,
        modelType: 'video_generation',
        responseTime: getElapsedSeconds(totalStartTime),
        isSuccess: false,
        userId: currentUserId,
        isAuthenticated: Boolean(currentUserId),
        ipAddress: clientIP,
        error,
      })
      generationStatsRecorded = true
    }

    if (spentRecordId) {
      const refundSuccess = await refundPoints(
        spentRecordId,
        `Video generation failed - ${error instanceof Error ? error.message : 'unknown error'}`
      )
      if (!refundSuccess) {
        console.error(`[generate-video] [${requestId}] Points refund failed`, { spentRecordId, chargedPointsCost })
      }
    }

    console.error(`[generate-video] [${requestId}] Failed after ${totalDuration}ms`, {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      spentRecordId,
    })

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate video',
        requestId,
      },
      { status: 500 }
    )
  }
}
