'use client'

import { createScopedT } from '@/lib/strings'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { generateDynamicTokenWithServerTime } from '@/utils/dynamicToken'
import { useSession } from '@/lib/auth-client'
import { usePoints } from '@/contexts/PointsContext'
import {
  aspectRatioLabelToNumber,
  calculateVideoLayoutForAspectRatio,
  getVideoAspectRatioOptions,
  getVideoModelById,
  type VideoAspectRatioLabel,
  type VideoModelConfig,
  type VideoModelMode,
} from '@/utils/videoModelConfig'
import { optimizeVideoPrompt } from '@/utils/videoPromptOptimizer'
import Toast from '@/components/Toast'
import type { VisualRiskLevel } from '@/utils/visualModeration'
import type { HappyHorseResolution } from '@/utils/happyHorseVideoApi'

interface VideoGenerateFormProps {
  prompt: string
  setPrompt: (prompt: string) => void
  negativePrompt: string
  setNegativePrompt: (negativePrompt: string) => void
  width: number
  setWidth: (width: number) => void
  height: number
  setHeight: (height: number) => void
  aspectRatio: number
  setAspectRatio: (aspectRatio: number) => void
  model: string
  setModel: (model: string) => void
  uploadedImage: string | null
  setUploadedImage: (image: string | null) => void
  generatedVideo: string | null
  setGeneratedVideo: (video: string | null) => void
  onModerationFailed?: (payload: {
    imageUrl?: string | null
    videoUrl?: string | null
    moderation?: { visualRiskLevel?: Exclude<VisualRiskLevel, 'low'> }
    mediaId?: string | null
  }) => void
  isGenerating: boolean
  setIsGenerating: (generating: boolean) => void
  isQueuing: boolean
  setIsQueuing: (queuing: boolean) => void
  onGenerate: (videoUrl: string, moderation?: { visualRiskLevel?: Exclude<VisualRiskLevel, 'low'> }) => void
  setErrorModal: (show: boolean, type: 'concurrency' | 'daily_limit' | 'insufficient_points' | 'login_required' | 'maintenance_mode', message?: string) => void
}

const MAX_HAPPYHORSE_REFERENCE_IMAGES = 9

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function stripDataUrlPrefix(value: string): string {
  const idx = value.indexOf(',')
  if (value.startsWith('data:') && idx >= 0) return value.slice(idx + 1)
  return value
}

function imageSrc(base64OrDataUrl: string): string {
  return base64OrDataUrl.startsWith('data:') ? base64OrDataUrl : `data:image/jpeg;base64,${base64OrDataUrl}`
}

function clampSeconds(value: number): number {
  return Math.min(15, Math.max(3, Math.round(value)))
}

function inferHappyHorseMode(modelId: string): VideoModelMode | undefined {
  if (modelId === 'happyhorse-1.0-t2v') return 'text-to-video'
  if (modelId === 'happyhorse-1.0-i2v') return 'image-to-video'
  if (modelId === 'happyhorse-1.0-r2v') return 'reference-to-video'
  if (modelId === 'happyhorse-1.0-video-edit') return 'video-edit'
  return undefined
}

const VideoGenerateForm = ({
  prompt,
  setPrompt,
  negativePrompt,
  setNegativePrompt,
  width,
  setWidth,
  height,
  setHeight,
  aspectRatio,
  setAspectRatio,
  model,
  setModel,
  uploadedImage,
  setUploadedImage,
  setGeneratedVideo,
  onModerationFailed,
  isGenerating,
  setIsGenerating,
  isQueuing,
  setIsQueuing,
  onGenerate,
  setErrorModal,
}: VideoGenerateFormProps) => {
  const t = createScopedT('home.generate')
  const tVideo = createScopedT('home.generate.form.videoGeneration')
  const { data: session, isPending } = useSession()
  const { refreshPoints } = usePoints()

  const [availableModels, setAvailableModels] = useState<VideoModelConfig[]>([])
  const [baseCost, setBaseCost] = useState<number | null>(null)
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null)
  const [videoSeconds, setVideoSeconds] = useState(5)
  const [happyHorseResolution, setHappyHorseResolution] = useState<HappyHorseResolution>('720P')
  const [referenceImages, setReferenceImages] = useState<string[]>([])
  const [sourceVideo, setSourceVideo] = useState<string | null>(null)
  const [sourceVideoSeconds, setSourceVideoSeconds] = useState<number | null>(null)
  const [sourceVideoName, setSourceVideoName] = useState<string | null>(null)
  const [moderationPreviewImageUrl, setModerationPreviewImageUrl] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isNegativePromptEnabled, setIsNegativePromptEnabled] = useState(false)
  const [isRatioOpen, setIsRatioOpen] = useState(false)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'warning' | 'success' | 'info' } | null>(null)
  const [progress, setProgress] = useState(0)
  const [estimatedTime, setEstimatedTime] = useState(280)

  const imageInputRef = useRef<HTMLInputElement>(null)
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const ratioDropdownRef = useRef<HTMLDivElement>(null)

  const authStatus = isPending ? 'loading' : session?.user ? 'authenticated' : 'unauthenticated'
  const currentModelConfig =
    (model ? availableModels.find(m => m.id === model) ?? null : null) ??
    (model ? getVideoModelById(model) : null)

  const inferredHappyHorseMode = inferHappyHorseMode(model)
  const mode = currentModelConfig?.mode ?? inferredHappyHorseMode
  const isHappyHorse = currentModelConfig?.provider === 'happyhorse' || Boolean(inferredHappyHorseMode)
  const isTextToVideo = isHappyHorse && mode === 'text-to-video'
  const isReferenceToVideo = isHappyHorse && mode === 'reference-to-video'
  const isVideoEdit = isHappyHorse && mode === 'video-edit'
  const optimizationImage = uploadedImage || referenceImages[0] || null
  const billableSeconds = clampSeconds(videoSeconds)
  const billingRuleText = isHappyHorse
    ? `${baseCost ?? '-'} 积分/秒 x ${billableSeconds} 秒 = ${estimatedCost ?? '-'} 积分`
    : estimatedCost !== null
      ? `${estimatedCost} 积分/次`
      : '加载计费中'
  const modeGuide = (() => {
    switch (mode) {
      case 'text-to-video':
        return {
          title: 'T2V 文生视频',
          body: '只需要输入提示词，适合从零生成镜头、动作和氛围，不需要上传图片。',
          inputs: '输入：提示词 + 时长 + 画幅',
        }
      case 'image-to-video':
        return {
          title: 'I2V 图生视频',
          body: '上传一张首帧图，模型会基于这张图延展动作，适合让现有图片动起来。',
          inputs: '输入：首帧图 + 提示词 + 时长',
        }
      case 'reference-to-video':
        return {
          title: 'R2V 参考生视频',
          body: '上传 1-9 张参考图来约束角色、主体或风格，提示词中可以写 character1、character2 指代参考图。',
          inputs: '输入：1-9 张参考图 + 提示词 + 时长',
        }
      case 'video-edit':
        return {
          title: '视频编辑',
          body: '上传源视频并写编辑指令，可选参考图用于补充主体或风格，输出秒数按下方选择。',
          inputs: '输入：源视频 + 编辑指令 + 时长，可选参考图',
        }
      default:
        return {
          title: '视频生成',
          body: '上传图片并输入提示词生成视频。',
          inputs: '输入：图片 + 提示词',
        }
    }
  })()

  const applyVideoLayout = (modelConfig: VideoModelConfig, sourceAspectRatio: number) => {
    const layout = calculateVideoLayoutForAspectRatio(modelConfig, sourceAspectRatio)
    setAspectRatio(layout.aspectRatio)
    setWidth(layout.width)
    setHeight(layout.height)
  }

  const applyVideoLayoutFromImage = (image: string, modelConfig: VideoModelConfig, fallbackAspectRatio: number) => {
    const img = new window.Image()
    img.onload = () => applyVideoLayout(modelConfig, img.width / img.height)
    img.onerror = () => applyVideoLayout(modelConfig, fallbackAspectRatio)
    img.src = imageSrc(image)
  }

  useLayoutEffect(() => {
    let cancelled = false
    const loadModels = async () => {
      try {
        const response = await fetch('/api/video-models')
        if (!response.ok || cancelled) return
        const data = await response.json()
        if (cancelled) return
        const models = data.models || []
        setAvailableModels(models)
        if (models.length > 0 && !model) {
          const defaultModel = models.find((m: VideoModelConfig) => m.isRecommended) || models[0]
          setModel(defaultModel.id)
        }
      } catch (error) {
        if (!cancelled) console.error('Failed to load video models:', error)
      }
    }
    loadModels()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!currentModelConfig) return
    setVideoSeconds(currentModelConfig.defaultVideoSeconds || 5)
    setUploadError(null)
    setModerationPreviewImageUrl(null)
  }, [currentModelConfig?.id])

  useEffect(() => {
    let cancelled = false
    const loadCost = async () => {
      if (!model) return
      try {
        const params = new URLSearchParams({ modelId: model })
        if (isHappyHorse) params.set('resolution', happyHorseResolution)
        const response = await fetch(`/api/points/model-base-cost?${params.toString()}`)
        if (!response.ok || cancelled) return
        const data = await response.json()
        setBaseCost(data.baseCost ?? null)
      } catch (error) {
        if (!cancelled) console.error('Failed to get video model base cost:', error)
      }
    }
    loadCost()
    return () => {
      cancelled = true
    }
  }, [model, isHappyHorse, happyHorseResolution])

  useEffect(() => {
    if (baseCost === null) {
      setEstimatedCost(null)
      return
    }
    setEstimatedCost(isHappyHorse ? baseCost * billableSeconds : baseCost)
  }, [baseCost, isHappyHorse, billableSeconds])

  useEffect(() => {
    if (!currentModelConfig) return
    if (uploadedImage) {
      applyVideoLayoutFromImage(uploadedImage, currentModelConfig, aspectRatio)
    } else if (referenceImages[0]) {
      applyVideoLayoutFromImage(referenceImages[0], currentModelConfig, aspectRatio)
    } else if (!isVideoEdit) {
      applyVideoLayout(currentModelConfig, aspectRatio || 16 / 9)
    }
  }, [model, uploadedImage, referenceImages[0]])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ratioDropdownRef.current && !ratioDropdownRef.current.contains(event.target as Node)) {
        setIsRatioOpen(false)
      }
    }
    if (isRatioOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isRatioOpen])

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isGenerating && !isQueuing) {
      const generationTime = 280
      setEstimatedTime(generationTime)
      let currentProgress = 0
      const startTime = Date.now()
      timer = setInterval(() => {
        const elapsedTime = (Date.now() - startTime) / 1000
        const timeRatio = elapsedTime / generationTime
        const targetProgress = timeRatio < 0.2
          ? timeRatio * 60
          : timeRatio < 0.8
            ? 40 + (timeRatio - 0.2) * (40 / 0.6)
            : 80 + (timeRatio - 0.8) * (15 / 0.2)
        currentProgress = Math.min(95, Math.max(currentProgress, currentProgress + Math.min(0.5, Math.abs(targetProgress - currentProgress))))
        setProgress(currentProgress)
      }, 50)
    } else {
      setProgress(0)
      setEstimatedTime(280)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isGenerating, isQueuing])

  const aspectRatioOptions = currentModelConfig ? getVideoAspectRatioOptions(currentModelConfig) : [
    { value: 16 / 9, label: '16:9' as const },
    { value: 4 / 3, label: '4:3' as const },
    { value: 1, label: '1:1' as const },
    { value: 3 / 4, label: '3:4' as const },
    { value: 9 / 16, label: '9:16' as const },
  ]

  const getCurrentRatioLabel = () => {
    const option = aspectRatioOptions.find(opt => Math.abs(opt.value - aspectRatio) < 0.001)
    return option?.label || `${width}:${height}`
  }

  const handleAspectRatioChange = (newLabel: VideoAspectRatioLabel) => {
    if (!currentModelConfig) return
    const newAspectRatio = aspectRatioLabelToNumber(newLabel)
    applyVideoLayout(currentModelConfig, newAspectRatio)
    setIsRatioOpen(false)
  }

  const handlePrimaryImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setUploadError(t('error.validation.fileType'))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError(t('error.validation.fileSize'))
      return
    }

    try {
      const dataUrl = await fileToDataUrl(file)
      const base64 = stripDataUrlPrefix(dataUrl)
      setUploadedImage(base64)
      setUploadError(null)
      if (currentModelConfig) applyVideoLayoutFromImage(base64, currentModelConfig, aspectRatio)
    } catch (error) {
      console.error('Error processing image:', error)
      setUploadError(t('error.validation.imageProcessing'))
    }
  }

  const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const imageFiles = files.filter(file => file.type.startsWith('image/'))
    if (imageFiles.length !== files.length) {
      setUploadError(t('error.validation.fileType'))
      return
    }
    if (imageFiles.some(file => file.size > 10 * 1024 * 1024)) {
      setUploadError(t('error.validation.fileSize'))
      return
    }

    try {
      const nextImages = await Promise.all(imageFiles.map(file => fileToDataUrl(file).then(stripDataUrlPrefix)))
      setReferenceImages(prev => {
        const combined = [...prev, ...nextImages].slice(0, MAX_HAPPYHORSE_REFERENCE_IMAGES)
        if (!uploadedImage && combined[0]) setUploadedImage(combined[0])
        return combined
      })
      setUploadError(null)
    } catch (error) {
      console.error('Error processing reference images:', error)
      setUploadError(t('error.validation.imageProcessing'))
    }
  }

  const handleSourceVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setUploadError('Please upload a video file.')
      return
    }
    if (file.size > 120 * 1024 * 1024) {
      setUploadError('Video file must be 120MB or smaller.')
      return
    }

    try {
      const objectUrl = URL.createObjectURL(file)
      const metadata = await new Promise<{ duration: number; width: number; height: number }>((resolve) => {
        const video = document.createElement('video')
        video.preload = 'metadata'
        video.onloadedmetadata = () => {
          resolve({
            duration: Number.isFinite(video.duration) ? video.duration : 0,
            width: video.videoWidth || width,
            height: video.videoHeight || height,
          })
          URL.revokeObjectURL(objectUrl)
        }
        video.onerror = () => {
          resolve({ duration: 0, width, height })
          URL.revokeObjectURL(objectUrl)
        }
        video.src = objectUrl
      })
      const dataUrl = await fileToDataUrl(file)
      setSourceVideo(dataUrl)
      setSourceVideoSeconds(metadata.duration > 0 ? metadata.duration : null)
      setSourceVideoName(file.name)
      if (metadata.width > 0 && metadata.height > 0) {
        setAspectRatio(metadata.width / metadata.height)
        setWidth(metadata.width)
        setHeight(metadata.height)
      }
      setUploadError(null)
    } catch (error) {
      console.error('Error processing source video:', error)
      setUploadError('Failed to process source video.')
    }
  }

  const handleRemoveImage = () => {
    setUploadedImage(null)
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleRemoveSourceVideo = () => {
    setSourceVideo(null)
    setSourceVideoSeconds(null)
    setSourceVideoName(null)
    if (videoInputRef.current) videoInputRef.current.value = ''
  }

  const handleOptimizePrompt = async () => {
    if (!optimizationImage) {
      setToast({ message: tVideo('imageRequiredForOptimization') || 'Upload a reference image first.', type: 'info' })
      return
    }

    const hasPrompt = prompt.trim().length > 0
    setIsOptimizing(true)
    try {
      const optimizedPrompt = await optimizeVideoPrompt(hasPrompt ? prompt : '', optimizationImage)
      setPrompt(optimizedPrompt)
      setToast({ message: hasPrompt ? (t('form.promptOptimized') || 'Prompt optimized.') : (t('form.promptGenerated') || 'Prompt generated.'), type: 'success' })
    } catch (error) {
      console.error('Failed to optimize prompt:', error)
      setToast({ message: error instanceof Error ? error.message : 'Failed to optimize prompt.', type: 'error' })
    } finally {
      setIsOptimizing(false)
    }
  }

  const hasRequiredMedia = () => {
    if (!currentModelConfig) return false
    if (isTextToVideo) return true
    if (isReferenceToVideo) return referenceImages.length >= 1 && referenceImages.length <= MAX_HAPPYHORSE_REFERENCE_IMAGES
    if (isVideoEdit) return Boolean(sourceVideo)
    return Boolean(uploadedImage)
  }

  const handleGenerateVideo = async () => {
    if (!prompt.trim()) {
      setErrorModal(true, 'concurrency', t('error.validation.promptRequired'))
      return
    }
    if (!model) {
      setErrorModal(true, 'concurrency', t('error.validation.modelRequired'))
      return
    }
    if (!hasRequiredMedia()) {
      const message = isTextToVideo
        ? t('error.validation.promptRequired')
        : isVideoEdit
          ? 'Please upload a source video.'
          : isReferenceToVideo
            ? 'Please upload 1-9 reference images.'
            : tVideo('imageRequired')
      setErrorModal(true, 'concurrency', message)
      return
    }
    if (authStatus !== 'authenticated') {
      setErrorModal(true, 'login_required', tVideo('loginRequired'))
      return
    }

    setIsGenerating(true)
    setIsQueuing(false)
    setGeneratedVideo(null)
    setModerationPreviewImageUrl(null)
    setProgress(0)

    try {
      const token = await generateDynamicTokenWithServerTime()
      const requestBody = {
        prompt: prompt.trim(),
        negative_prompt: negativePrompt.trim(),
        width,
        height,
        aspectRatio,
        model,
        videoSeconds: isHappyHorse ? billableSeconds : currentModelConfig?.provider === 'grok' ? currentModelConfig.defaultVideoSeconds : undefined,
        resolution: isHappyHorse ? happyHorseResolution : undefined,
        videoMode: mode,
        image: uploadedImage,
        referenceImages,
        sourceVideo,
        sourceVideoSeconds: sourceVideoSeconds || undefined,
      }

      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json()
        if (response.status === 401 && errorData.code === 'LOGIN_REQUIRED') {
          setErrorModal(true, 'login_required', errorData.error)
          return
        }
        if (response.status === 402 && errorData.code === 'INSUFFICIENT_POINTS') {
          setErrorModal(true, 'insufficient_points', errorData.error)
          return
        }
        if (response.status === 422 && errorData.code === 'VIDEO_MODERATION_FAILED') {
          setModerationPreviewImageUrl(errorData.imageUrl || null)
          onModerationFailed?.({
            imageUrl: errorData.imageUrl || null,
            videoUrl: errorData.videoUrl || null,
            moderation: errorData.moderation,
            mediaId: errorData.mediaId || null,
          })
          return
        }
        if (response.status === 503 && errorData.code === 'MAINTENANCE_MODE') {
          setErrorModal(true, 'maintenance_mode', errorData.error)
          return
        }
        throw new Error(errorData.error || 'Failed to generate video')
      }

      const data = await response.json()
      setGeneratedVideo(data.videoUrl)
      await refreshPoints()
      onGenerate(data.videoUrl, data.moderation)
    } catch (error) {
      console.error('Video generation error:', error)
      setErrorModal(true, 'concurrency', error instanceof Error ? error.message : 'Failed to generate video')
    } finally {
      setIsGenerating(false)
      setIsQueuing(false)
    }
  }

  const renderDropzone = (params: {
    title: string
    description: string
    onClick: () => void
    children?: React.ReactNode
  }) => (
    <div
      onClick={params.onClick}
      className="border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer border-orange-400/40 bg-white hover:border-orange-400"
    >
      {params.children || (
        <div className="flex flex-col items-center justify-center">
          <svg className="w-14 h-14 text-orange-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm font-medium text-gray-800">{params.title}</p>
          <p className="mt-1 text-xs text-gray-600">{params.description}</p>
        </div>
      )}
    </div>
  )

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleGenerateVideo() }} className="space-y-6 sm:space-y-8 relative flex flex-col">
      <div className="space-y-6 sm:space-y-8">
        <div>
          <label className="flex items-center text-sm font-medium text-gray-900 mb-3">
            <img src="/form/models.svg" alt="Model" className="w-5 h-5 mr-2 text-gray-900" />
            {t('form.model.label')}
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-white/50 backdrop-blur-sm border border-orange-400/40 rounded-xl px-4 py-3.5 text-sm text-gray-900 focus:ring-2 focus:ring-orange-400/50 focus:border-orange-400/50 shadow-inner transition-all duration-300"
            disabled={isGenerating}
          >
            {availableModels.map(modelOption => (
              <option key={modelOption.id} value={modelOption.id}>
                {modelOption.name}
              </option>
            ))}
          </select>
          {currentModelConfig?.description && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span>{currentModelConfig.description}</span>
              {isHappyHorse && (
                <span className="rounded-md border border-amber-300/60 bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                  {baseCost ?? '-'} pts/s
                </span>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-amber-300/60 bg-amber-50/80 p-4 text-sm text-gray-800 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <div className="font-semibold text-gray-950">{modeGuide.title}</div>
              <div>{modeGuide.body}</div>
              <div className="text-xs text-gray-600">{modeGuide.inputs}</div>
            </div>
            <div className="shrink-0 rounded-lg border border-amber-300/70 bg-white/80 px-3 py-2 text-xs font-semibold text-amber-800">
              {isHappyHorse ? '按秒计费' : '固定计费'}
              <div className="mt-1 text-gray-900">{billingRuleText}</div>
            </div>
          </div>
        </div>

        {isHappyHorse && (
          <div className="rounded-xl border border-orange-300/60 bg-white/80 p-4 shadow-sm">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-950">Resolution</div>
                <div className="text-xs text-gray-600">Choose the HappyHorse output quality.</div>
              </div>
              <div className="text-sm font-semibold text-amber-800">{baseCost ?? '-'} pts/s</div>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-orange-50 p-1">
              {(['720P', '1080P'] as const).map(resolutionOption => (
                <button
                  key={resolutionOption}
                  type="button"
                  onClick={() => setHappyHorseResolution(resolutionOption)}
                  disabled={isGenerating}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    happyHorseResolution === resolutionOption
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-gray-700 hover:bg-white'
                  }`}
                  aria-pressed={happyHorseResolution === resolutionOption}
                >
                  {resolutionOption}
                </button>
              ))}
            </div>
          </div>
        )}

        {isHappyHorse && (
          <div className="rounded-xl border border-orange-300/60 bg-white/80 p-4 shadow-sm">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-950">视频时长</div>
                <div className="text-xs text-gray-600">HappyHorse 支持选择 3 到 15 秒，积分按所选秒数实时计算。</div>
              </div>
              <div className="text-sm font-semibold text-amber-800">{videoSeconds} 秒</div>
            </div>
            <div className="space-y-2">
              <input
                type="range"
                min={3}
                max={15}
                step={1}
                value={videoSeconds}
                onChange={(e) => setVideoSeconds(clampSeconds(Number(e.target.value)))}
                disabled={isGenerating}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-amber-200 accent-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="HappyHorse video duration seconds"
              />
              <div className="flex justify-between text-[11px] font-medium text-gray-500">
                <span>3s</span>
                <span>6s</span>
                <span>9s</span>
                <span>12s</span>
                <span>15s</span>
              </div>
            </div>
          </div>
        )}

        {isTextToVideo ? (
          <div className="rounded-xl border border-orange-200/70 bg-white/70 px-4 py-3 text-sm text-gray-700">
            Text-to-video does not require an uploaded image.
          </div>
        ) : isReferenceToVideo ? (
          <div>
            <label className="flex items-center text-sm font-medium text-gray-900 mb-3">
              <img src="/form/image.svg" alt="Reference" className="w-5 h-5 mr-2 text-gray-900" />
              Reference images
            </label>
            {renderDropzone({
              title: 'Upload 1-9 reference images',
              description: `${referenceImages.length}/${MAX_HAPPYHORSE_REFERENCE_IMAGES} selected`,
              onClick: () => referenceInputRef.current?.click(),
            })}
            <input ref={referenceInputRef} type="file" accept="image/*" multiple onChange={handleReferenceUpload} className="hidden" />
            {referenceImages.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {referenceImages.map((ref, index) => (
                  <div key={`${index}-${ref.slice(0, 16)}`} className="relative aspect-square overflow-hidden rounded-lg border border-orange-200 bg-white">
                    <img src={imageSrc(ref)} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" />
                    <button type="button" onClick={() => removeReferenceImage(index)} className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : isVideoEdit ? (
          <div className="space-y-4">
            <div>
              <label className="flex items-center text-sm font-medium text-gray-900 mb-3">
                <img src="/form/image.svg" alt="Video" className="w-5 h-5 mr-2 text-gray-900" />
                Source video
              </label>
              {renderDropzone({
                title: sourceVideoName || 'Upload source video',
                description: sourceVideoSeconds ? `${Math.ceil(sourceVideoSeconds)}s detected, output set to ${billableSeconds}s` : 'MP4/WebM/MOV up to 120MB',
                onClick: () => !sourceVideo && videoInputRef.current?.click(),
                children: sourceVideo ? (
                  <div className="relative">
                    <video src={sourceVideo} className="mx-auto max-h-64 max-w-full rounded-lg shadow-lg" controls />
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveSourceVideo() }} className="absolute -right-2 -top-2 rounded-full bg-red-500 p-2 text-white">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ) : undefined,
              })}
              <input ref={videoInputRef} type="file" accept="video/*" onChange={handleSourceVideoUpload} className="hidden" />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-gray-900">Optional reference images</label>
                <button type="button" onClick={() => referenceInputRef.current?.click()} className="text-xs font-medium text-orange-700">Add images</button>
              </div>
              <input ref={referenceInputRef} type="file" accept="image/*" multiple onChange={handleReferenceUpload} className="hidden" />
              {referenceImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {referenceImages.map((ref, index) => (
                    <div key={`${index}-${ref.slice(0, 16)}`} className="relative aspect-square overflow-hidden rounded-lg border border-orange-200 bg-white">
                      <img src={imageSrc(ref)} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" />
                      <button type="button" onClick={() => removeReferenceImage(index)} className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <label className="flex items-center text-sm font-medium text-gray-900 mb-3">
              <img src="/form/image.svg" alt="Image" className="w-5 h-5 mr-2 text-gray-900" />
              {tVideo('inputImage')}
            </label>
            {renderDropzone({
              title: t('form.upload.clickOrDrag') || 'Upload image',
              description: 'JPG, PNG, or WebP up to 10MB',
              onClick: () => !uploadedImage && imageInputRef.current?.click(),
              children: uploadedImage ? (
                <div className="relative">
                  <img src={imageSrc(uploadedImage)} alt="Uploaded" className="max-w-full max-h-64 mx-auto rounded-lg shadow-lg" />
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveImage() }} className="absolute -right-2 -top-2 rounded-full bg-red-500 p-2 text-white">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : undefined,
            })}
            <input ref={imageInputRef} type="file" accept="image/*" onChange={handlePrimaryImageUpload} className="hidden" />
          </div>
        )}

        {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
        {moderationPreviewImageUrl && <p className="text-sm text-amber-900">Video moderation failed. Review the generated preview before retrying.</p>}

        <div>
          <label className="flex items-center text-sm font-medium text-gray-900 mb-3">
            <img src="/form/prompt.svg" alt="Prompt" className="w-5 h-5 mr-2 text-gray-900" />
            {t('form.prompt.label')}
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={isVideoEdit ? 'Describe how the source video should be edited.' : tVideo('promptPlaceholder')}
            className="w-full bg-white/50 backdrop-blur-sm border border-orange-400/40 rounded-xl px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:ring-orange-400/50 focus:border-orange-400/50 shadow-inner transition-all duration-300 resize-none"
            rows={4}
            disabled={isGenerating}
          />

          <div className="mt-3 flex flex-wrap gap-2 md:gap-3">
            {!isVideoEdit && (
              <div
                onClick={() => !isGenerating && setIsRatioOpen(!isRatioOpen)}
                className="relative flex cursor-pointer items-center rounded-lg border border-amber-400/40 bg-white/95 px-3 py-2 text-sm text-gray-900 shadow-md shadow-amber-400/10 transition-all hover:bg-amber-50/50"
              >
                {getCurrentRatioLabel()}
                {isRatioOpen && (
                  <div ref={ratioDropdownRef} className="absolute left-0 top-full z-50 mt-2 min-w-[150px] rounded-xl border border-amber-400/40 bg-white/95 p-2 shadow-xl">
                    {aspectRatioOptions.map(option => (
                      <div
                        key={option.label}
                        onClick={() => handleAspectRatioChange(option.label)}
                        className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 hover:bg-gray-100/70"
                      >
                        {option.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={handleOptimizePrompt}
              className="rounded-lg border border-amber-400/40 bg-white/95 px-3 py-2 text-sm text-gray-900 shadow-md shadow-amber-400/10 transition-all hover:bg-amber-50/50 disabled:opacity-50"
              disabled={isGenerating || isOptimizing || !optimizationImage}
            >
              {isOptimizing ? t('form.optimizingPrompt') || 'Optimizing...' : t('form.optimizePrompt') || 'Optimize'}
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-900">{t('form.negativePrompt')}</label>
            <button
              type="button"
              onClick={() => {
                const next = !isNegativePromptEnabled
                setIsNegativePromptEnabled(next)
                if (!next) setNegativePrompt('')
              }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isNegativePromptEnabled ? 'bg-orange-500' : 'bg-gray-200'}`}
              disabled={isGenerating}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isNegativePromptEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {isNegativePromptEnabled && (
            <textarea
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder={t('form.negativePromptPlaceholder')}
              className="w-full bg-white/50 backdrop-blur-sm border border-orange-400/40 rounded-xl px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:ring-orange-400/50 focus:border-orange-400/50 shadow-inner transition-all duration-300 resize-none"
              rows={3}
              disabled={isGenerating}
            />
          )}
        </div>

        <div className="flex justify-center">
          <button
            type="submit"
            disabled={isGenerating || isQueuing || !prompt.trim() || !model || !hasRequiredMedia()}
            className="relative w-full overflow-hidden rounded-2xl border border-amber-400/40 bg-white/95 px-4 py-3 text-sm font-semibold text-gray-900 shadow-xl shadow-amber-400/20 transition-all duration-300 hover:bg-amber-50/95 disabled:cursor-not-allowed disabled:opacity-50 md:px-6 md:text-base"
          >
            <span className="relative z-10 flex items-center justify-center font-bold">
              {isGenerating ? (isQueuing ? t('form.progress.status.queuing') : t('form.generating')) : tVideo('generateButton')}
            </span>
            {estimatedCost !== null && authStatus === 'authenticated' && !isGenerating && !isQueuing && (
              <div className="absolute bottom-1.5 right-2.5 flex items-center gap-0.5 rounded-full border border-amber-300/70 bg-amber-100/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 shadow-sm backdrop-blur-sm md:text-xs">
                {isHappyHorse ? billingRuleText : estimatedCost}
              </div>
            )}
          </button>
        </div>

        {isGenerating && !isQueuing && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-900">
              <span>{t('form.progress.title')}</span>
              <span>{t('form.progress.estimatedTime')}: {Math.ceil(estimatedTime)} {t('form.progress.seconds')}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100/70">
              <div className="h-full bg-gradient-to-r from-orange-400 to-amber-400 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </form>
  )
}

export default VideoGenerateForm
