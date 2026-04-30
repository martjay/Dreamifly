'use client'

import { createScopedT } from '@/lib/strings'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { generateDynamicTokenWithServerTime } from '@/utils/dynamicToken'
import { useSession } from '@/lib/auth-client'
import { usePoints } from '@/contexts/PointsContext'
import { Clock3 } from 'lucide-react'
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

function getVideoInputModerationFailureMessage(reason?: string) {
  if (reason === 'prompt') return '提示词未通过审核，请调整后重试'
  if (reason === 'video' || reason === 'image') return '参考图或源视频未通过审核，请更换后重试'
  if (reason === 'service_error') return '审核服务暂时不可用，请稍后重试'
  return '内容未通过审核，请调整后重试'
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
  const [videoSecondsInput, setVideoSecondsInput] = useState('5')
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
    const defaultSeconds = currentModelConfig.defaultVideoSeconds || 5
    setVideoSeconds(defaultSeconds)
    setVideoSecondsInput(String(defaultSeconds))
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

  const handleVideoSecondsInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value
    if (!/^\d*$/.test(rawValue)) return
    setVideoSecondsInput(rawValue)
    if (rawValue) setVideoSeconds(clampSeconds(Number(rawValue)))
  }

  const normalizeVideoSecondsInput = () => {
    const normalized = clampSeconds(Number(videoSecondsInput || videoSeconds))
    setVideoSeconds(normalized)
    setVideoSecondsInput(String(normalized))
  }

  const stepVideoSeconds = (delta: number) => {
    const nextSeconds = clampSeconds(videoSeconds + delta)
    setVideoSeconds(nextSeconds)
    setVideoSecondsInput(String(nextSeconds))
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
        if ((response.status === 403 || response.status === 422) && errorData.code === 'VIDEO_MODERATION_FAILED') {
          if (!errorData.videoUrl && !errorData.imageUrl) {
            setToast({ message: getVideoInputModerationFailureMessage(errorData?.moderation?.reason), type: 'error' })
            return
          }
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
        </div>

        {isTextToVideo ? null : isReferenceToVideo ? (
          <div>
            <label className="flex items-center text-sm font-medium text-gray-900 mb-3">
              <img src="/form/image.svg" alt="参考图" className="w-5 h-5 mr-2 text-gray-900" />
              参考图
            </label>
            {renderDropzone({
              title: '上传 1-9 张参考图',
              description: `已选择 ${referenceImages.length}/${MAX_HAPPYHORSE_REFERENCE_IMAGES} 张`,
              onClick: () => referenceInputRef.current?.click(),
            })}
            <input ref={referenceInputRef} type="file" accept="image/*" multiple onChange={handleReferenceUpload} className="hidden" />
            {referenceImages.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {referenceImages.map((ref, index) => (
                  <div key={`${index}-${ref.slice(0, 16)}`} className="relative aspect-square overflow-hidden rounded-lg border border-orange-200 bg-white">
                    <img src={imageSrc(ref)} alt={`参考图 ${index + 1}`} className="h-full w-full object-cover" />
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
                <img src="/form/image.svg" alt="源视频" className="w-5 h-5 mr-2 text-gray-900" />
                源视频
              </label>
              {renderDropzone({
                title: sourceVideoName || '上传源视频',
                description: sourceVideoSeconds ? `检测到 ${Math.ceil(sourceVideoSeconds)} 秒，输出设置为 ${billableSeconds} 秒` : '支持 MP4/WebM/MOV，最大 120MB',
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
                <label className="text-sm font-medium text-gray-900">可选参考图</label>
                <button type="button" onClick={() => referenceInputRef.current?.click()} className="text-xs font-medium text-orange-700">添加图片</button>
              </div>
              <input ref={referenceInputRef} type="file" accept="image/*" multiple onChange={handleReferenceUpload} className="hidden" />
              {referenceImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {referenceImages.map((ref, index) => (
                    <div key={`${index}-${ref.slice(0, 16)}`} className="relative aspect-square overflow-hidden rounded-lg border border-orange-200 bg-white">
                      <img src={imageSrc(ref)} alt={`参考图 ${index + 1}`} className="h-full w-full object-cover" />
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
              description: '支持 JPG、PNG 或 WebP，最大 10MB',
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
        {moderationPreviewImageUrl && <p className="text-sm text-amber-900">视频审核未通过，请查看生成预览后重试。</p>}

        <div>
          <label className="flex items-center text-sm font-medium text-gray-900 mb-3">
            <img src="/form/prompt.svg" alt="Prompt" className="w-5 h-5 mr-2 text-gray-900" />
            {t('form.prompt.label')}
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={isVideoEdit ? '描述希望如何编辑源视频。' : tVideo('promptPlaceholder')}
            className="w-full bg-white/50 backdrop-blur-sm border border-orange-400/40 rounded-xl px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:ring-orange-400/50 focus:border-orange-400/50 shadow-inner transition-all duration-300 resize-none"
            rows={4}
            disabled={isGenerating}
          />

          {isHappyHorse && (
            <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label className="flex items-center text-sm font-semibold text-gray-900">
                    <img src="/form/steps.svg" alt="Quality" className="mr-2 h-5 w-5 text-gray-900" />
                    启用高质量
                  </label>
                  <button
                    type="button"
                    onClick={() => setHappyHorseResolution(happyHorseResolution === '1080P' ? '720P' : '1080P')}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 sm:h-6 sm:w-11 ${
                      happyHorseResolution === '1080P' ? 'bg-amber-500' : 'bg-gray-300'
                    }`}
                    disabled={isGenerating}
                    aria-pressed={happyHorseResolution === '1080P'}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform sm:h-4 sm:w-4 ${
                        happyHorseResolution === '1080P' ? 'translate-x-5 sm:translate-x-6' : 'translate-x-0.5 sm:translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs leading-5 text-gray-600 sm:text-sm">
                  提供更高的视频质量，但也会花费少许积分
                </p>
              </div>

              <div>
                <label htmlFor="videoSeconds" className="mb-3 flex items-center text-sm font-semibold text-gray-900">
                  <Clock3 className="mr-2 h-5 w-5 text-gray-900" aria-hidden="true" />
                  视频时长
                </label>
                <div className="relative flex items-center rounded-xl border border-amber-400/40 bg-white/50 shadow-inner backdrop-blur-sm transition-all">
                  <input
                    id="videoSeconds"
                    type="number"
                    min={3}
                    max={15}
                    step={1}
                    value={videoSecondsInput}
                    onChange={handleVideoSecondsInputChange}
                    onBlur={normalizeVideoSecondsInput}
                    disabled={isGenerating}
                      className="w-full border-0 bg-transparent px-4 py-2.5 text-center text-sm text-gray-900 outline-none focus:outline-none focus:ring-0 [appearance:textfield] disabled:cursor-not-allowed disabled:opacity-60 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    aria-label="HappyHorse 视频时长秒数"
                  />
                  <div className="flex items-center border-l border-orange-400/30">
                    <button
                      type="button"
                      onClick={() => stepVideoSeconds(-1)}
                      className="flex h-full items-center justify-center px-3 text-gray-700 transition-colors hover:text-gray-900 disabled:opacity-50"
                      disabled={isGenerating || videoSeconds <= 3}
                      aria-label="减少视频时长"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => stepVideoSeconds(1)}
                      className="flex h-full items-center justify-center px-3 text-gray-700 transition-colors hover:text-gray-900 disabled:opacity-50"
                      disabled={isGenerating || videoSeconds >= 15}
                      aria-label="增加视频时长"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-600 sm:text-sm">
                  一次生成的视频时长（3-15 秒）
                </p>
              </div>
            </div>
          )}

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
                <svg className="h-2.5 w-2.5 text-amber-700" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                </svg>
                <span>{estimatedCost}</span>
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
