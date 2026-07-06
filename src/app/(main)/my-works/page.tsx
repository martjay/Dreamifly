'use client'


import { createScopedT } from '@/lib/strings'
import { useState, useEffect } from 'react'
import { useSession } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { transferUrl } from '@/utils/locale'
import Link from 'next/link'
import Image from 'next/image'
import { isEncryptedImage, getImageDisplayUrl, getVideoDisplayUrl } from '@/utils/imageDisplay'
import { useDownloadWithTerms } from '@/hooks/useDownloadWithTerms'
import { useVisibleMediaKeys } from '@/hooks/useVisibleMediaKeys'
import ModerationConsentModal from '@/components/ModerationConsentModal'
import RestrictedMediaMask from '@/components/RestrictedMediaMask'
import { MEDIUM_RISK_CONFIRM_MESSAGE, getModerationWarning, type VisualRiskLevel } from '@/utils/visualModeration'

interface UserImage {
  id: string
  imageUrl: string
  mediaType?: string | null // 'image' | 'video'
  prompt?: string | null
  model?: string | null
  moderationLevel?: VisualRiskLevel | null
  hasViewConsent: boolean
  width?: number | null
  height?: number | null
  duration?: number | null
  fps?: number | null
  frameCount?: number | null
  createdAt: string
  likedAt?: string
}

interface StorageInfo {
  currentCount: number
  maxImages: number
  isSubscribed: boolean
  subscriptionExpiresAt: string | null
  canAddMore: boolean
  message?: string
}

interface MediaLibrarySection {
  images: UserImage[]
  totalCount: number
}

interface MediaLibraryResponse {
  success: boolean
  generated?: MediaLibrarySection
  liked?: MediaLibrarySection
  storageInfo?: StorageInfo
}

const DEFAULT_COLLAPSED_MEDIA_COUNT = 4

export default function MyWorksPage() {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  const t = createScopedT('myWorks')
  const { checkAndDownload, DownloadTermsModalWrapper } = useDownloadWithTerms()
  
  const [images, setImages] = useState<UserImage[]>([])
  const [likedImages, setLikedImages] = useState<UserImage[]>([])
  const [loading, setLoading] = useState(true)
  const [likedLoading, setLikedLoading] = useState(true)
  const [error, setError] = useState('')
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [zoomedMediaType, setZoomedMediaType] = useState<'image' | 'video' | null>(null)
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showHeaderSpacer, setShowHeaderSpacer] = useState(false)
  const [decodedImages, setDecodedImages] = useState<{ [key: string]: string }>({})
  const [decodingImages, setDecodingImages] = useState<Set<string>>(new Set())
  const [pendingModerationImageId, setPendingModerationImageId] = useState<string | null>(null)
  const [showAllGenerated, setShowAllGenerated] = useState(false)
  const [showAllLiked, setShowAllLiked] = useState(false)
  const [generatedTotalCount, setGeneratedTotalCount] = useState(0)
  const [likedTotalCount, setLikedTotalCount] = useState(0)
  const [loadingMoreGenerated, setLoadingMoreGenerated] = useState(false)
  const [loadingMoreLiked, setLoadingMoreLiked] = useState(false)
  const { visibleKeys: visibleMediaUrls, registerElement: registerMediaElement } = useVisibleMediaKeys(
    [...images, ...likedImages].map((image) => image.imageUrl)
  )

  useEffect(() => {
    if (isPending) return
    
    if (!session?.user) {
      router.push(transferUrl('/'))
      return
    }
    
    let cancelled = false

    const fetchInitialMediaLibrary = async () => {
      try {
        setLoading(true)
        setLikedLoading(true)

        const params = new URLSearchParams({
          generatedLimit: String(DEFAULT_COLLAPSED_MEDIA_COUNT),
          likedLimit: String(DEFAULT_COLLAPSED_MEDIA_COUNT),
        })
        const response = await fetch(`/api/user/media-library?${params.toString()}`)

        if (!response.ok) {
          throw new Error('获取作品失败')
        }

        const data = await response.json() as MediaLibraryResponse
        if (cancelled) return

        setImages(data.generated?.images || [])
        setGeneratedTotalCount(data.generated?.totalCount || 0)
        setLikedImages(data.liked?.images || [])
        setLikedTotalCount(data.liked?.totalCount || 0)
        setStorageInfo(data.storageInfo || null)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '获取作品失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setLikedLoading(false)
        }
      }
    }

    void fetchInitialMediaLibrary()

    return () => {
      cancelled = true
    }
  }, [session, isPending, router])

  // 检测页眉是否显示
  useEffect(() => {
    const checkHeader = () => {
      // 检查是否有固定定位在顶部的元素（页眉）
      // 查找所有固定定位的元素，检查是否在顶部
      const fixedElements = Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el)
        return style.position === 'fixed' && 
               (parseFloat(style.top) === 0 || style.top === '0px')
      })
      
      if (fixedElements.length > 0) {
        // 检查这些元素是否可见
        const visibleHeader = fixedElements.find(el => {
          const style = window.getComputedStyle(el)
          return style.display !== 'none' && 
                 style.visibility !== 'hidden' &&
                 parseFloat(style.opacity) > 0 &&
                 parseFloat(style.height) > 0
        })
        setShowHeaderSpacer(!!visibleHeader)
      } else {
        // 如果没有找到固定定位的顶部元素，根据窗口宽度判断（移动端通常小于 1024px）
        setShowHeaderSpacer(window.innerWidth < 1024)
      }
    }

    // 延迟检查，确保 DOM 已渲染
    const timeoutId = setTimeout(checkHeader, 100)

    // 监听窗口大小变化
    window.addEventListener('resize', checkHeader)
    
    // 使用 MutationObserver 监听 DOM 变化（页眉可能被动态隐藏/显示）
    const observer = new MutationObserver(() => {
      setTimeout(checkHeader, 50)
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    })

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', checkHeader)
      observer.disconnect()
    }
  }, [])

  // 解码加密媒体（图片和视频，批量处理）
  useEffect(() => {
    const mediaToDecode = [...images, ...likedImages].filter((image) => visibleMediaUrls.has(image.imageUrl))
    if (!mediaToDecode.length) return

    const encryptedMedia = mediaToDecode.filter(
      img => isEncryptedImage(img.imageUrl) && !decodedImages[img.imageUrl] && !decodingImages.has(img.imageUrl)
    )

    if (encryptedMedia.length === 0) return

    let cancelled = false
    const concurrency = 4
    const queue = [...encryptedMedia]

    const runWorker = async () => {
      while (queue.length && !cancelled) {
        const media = queue.shift()
        if (!media) continue

        setDecodingImages(prev => new Set(prev).add(media.imageUrl))

        try {
          // 根据媒体类型选择解码函数
          const decodedUrl = media.mediaType === 'video'
            ? await getVideoDisplayUrl(media.imageUrl, decodedImages)
            : await getImageDisplayUrl(media.imageUrl, decodedImages)
          
          if (!cancelled) {
            setDecodedImages(prev => ({
              ...prev,
              [media.imageUrl]: decodedUrl
            }))
          }
        } catch (error) {
          console.error('解码媒体失败:', error)
        } finally {
          setDecodingImages(prev => {
            const newSet = new Set(prev)
            newSet.delete(media.imageUrl)
            return newSet
          })
        }
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, runWorker)
    Promise.all(workers).catch(err => {
      console.error('批量解码媒体失败:', err)
    })

    return () => {
      cancelled = true
    }
  }, [images, likedImages, visibleMediaUrls, decodedImages, decodingImages])

  // 获取媒体显示URL（支持图片和视频）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getDisplayUrl = (imageUrl: string, _mediaType?: string | null): string => {
    if (isEncryptedImage(imageUrl)) {
      return decodedImages[imageUrl] || imageUrl // 如果还在解码中，显示原URL（会有加载状态）
    }
    return imageUrl
  }

  const canViewOriginal = (image: UserImage) => {
    if (image.moderationLevel === 'high') return false
    return true
  }

  const shouldShowMask = (image: UserImage) => {
    return image.moderationLevel === 'high'
  }

  const handleRequestRevealModeratedMedia = (imageId: string) => {
    setPendingModerationImageId(imageId)
  }

  const handleConfirmRevealModeratedMedia = async () => {
    if (!pendingModerationImageId) return

    try {
      const response = await fetch(`/api/user/images/${pendingModerationImageId}/moderation-view`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('保存查看确认失败')
      }

      setImages((prev) =>
        prev.map((image) =>
          image.id === pendingModerationImageId
            ? { ...image, hasViewConsent: true }
            : image
        )
      )
    } catch (error) {
      console.error('确认查看中风险作品失败:', error)
    } finally {
      setPendingModerationImageId(null)
    }
  }

  const visibleGeneratedImages = showAllGenerated
    ? images
    : images.slice(0, DEFAULT_COLLAPSED_MEDIA_COUNT)
  const visibleLikedImages = showAllLiked
    ? likedImages
    : likedImages.slice(0, DEFAULT_COLLAPSED_MEDIA_COUNT)
  const hasMoreGeneratedImages = generatedTotalCount > DEFAULT_COLLAPSED_MEDIA_COUNT
  const hasMoreLikedImages = likedTotalCount > DEFAULT_COLLAPSED_MEDIA_COUNT

  const buildMediaLibraryUrl = (options?: {
    includeGenerated?: boolean
    includeLiked?: boolean
    includeStorage?: boolean
    generatedLimit?: number
    likedLimit?: number
  }) => {
    const params = new URLSearchParams()

    if (options?.includeGenerated === false) params.set('includeGenerated', 'false')
    if (options?.includeLiked === false) params.set('includeLiked', 'false')
    if (options?.includeStorage === false) params.set('includeStorage', 'false')
    if (options?.generatedLimit) params.set('generatedLimit', String(options.generatedLimit))
    if (options?.likedLimit) params.set('likedLimit', String(options.likedLimit))

    const query = params.toString()
    return query ? `/api/user/media-library?${query}` : '/api/user/media-library'
  }

  const fetchImages = async (options?: { loadAll?: boolean; showInitialLoading?: boolean }) => {
    const loadAll = options?.loadAll ?? false
    const showInitialLoading = options?.showInitialLoading ?? false
    try {
      if (showInitialLoading) {
        setLoading(true)
      } else if (loadAll) {
        setLoadingMoreGenerated(true)
      }

      const response = await fetch(buildMediaLibraryUrl({
        includeLiked: false,
        includeStorage: false,
        generatedLimit: loadAll ? undefined : DEFAULT_COLLAPSED_MEDIA_COUNT,
      }))
      if (!response.ok) {
        throw new Error('获取图片失败')
      }
      const data = await response.json() as MediaLibraryResponse
      setImages(data.generated?.images || [])
      setGeneratedTotalCount(data.generated?.totalCount || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取图片失败')
    } finally {
      if (showInitialLoading) {
        setLoading(false)
      } else if (loadAll) {
        setLoadingMoreGenerated(false)
      }
    }
  }

  const fetchLikedImages = async (options?: { loadAll?: boolean; showInitialLoading?: boolean }) => {
    const loadAll = options?.loadAll ?? false
    const showInitialLoading = options?.showInitialLoading ?? false
    try {
      if (showInitialLoading) {
        setLikedLoading(true)
      } else if (loadAll) {
        setLoadingMoreLiked(true)
      }

      const response = await fetch(buildMediaLibraryUrl({
        includeGenerated: false,
        includeStorage: false,
        likedLimit: loadAll ? undefined : DEFAULT_COLLAPSED_MEDIA_COUNT,
      }))
      if (!response.ok) {
        throw new Error('获取点赞收藏失败')
      }
      const data = await response.json() as MediaLibraryResponse
      setLikedImages(data.liked?.images || [])
      setLikedTotalCount(data.liked?.totalCount || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取点赞收藏失败')
    } finally {
      if (showInitialLoading) {
        setLikedLoading(false)
      } else if (loadAll) {
        setLoadingMoreLiked(false)
      }
    }
  }

  const fetchStorageInfo = async () => {
    try {
      const response = await fetch(buildMediaLibraryUrl({
        includeGenerated: false,
        includeLiked: false,
      }))
      if (response.ok) {
        const data = await response.json() as MediaLibraryResponse
        setStorageInfo(data.storageInfo || null)
      }
    } catch (err) {
      console.error('获取存储信息失败:', err)
    }
  }

  const handleDeleteClick = (imageId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
    }
    setConfirmDeleteId(imageId)
    setDeleteError(null)
  }

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return
    
    try {
      setDeletingId(confirmDeleteId)
      setConfirmDeleteId(null)
      const response = await fetch(`/api/user/images/${confirmDeleteId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        throw new Error('删除失败')
      }
      
      // 重新获取图片列表和存储信息
      await fetchImages({ loadAll: showAllGenerated, showInitialLoading: false })
      await fetchStorageInfo()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  const handleCancelDelete = () => {
    setConfirmDeleteId(null)
    setDeleteError(null)
  }

  const handleDownload = async (image: UserImage, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!canViewOriginal(image)) return
    await checkAndDownload(async () => {
      try {
        // 如果是加密图片，需要先解码
        const displayUrl = getDisplayUrl(image.imageUrl)
        // 如果还在解码中，等待解码完成
        if (isEncryptedImage(image.imageUrl) && !decodedImages[image.imageUrl]) {
          const decodedUrl = image.mediaType === 'video'
            ? await getVideoDisplayUrl(image.imageUrl, decodedImages)
            : await getImageDisplayUrl(image.imageUrl, decodedImages)
          setDecodedImages(prev => ({ ...prev, [image.imageUrl]: decodedUrl }))
          const link = document.createElement('a')
          link.href = decodedUrl
          link.download = `${image.mediaType === 'video' ? 'video' : 'image'}-${Date.now()}.${image.mediaType === 'video' ? 'mp4' : 'png'}`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        } else {
          const link = document.createElement('a')
          link.href = displayUrl
          link.download = `${image.mediaType === 'video' ? 'video' : 'image'}-${Date.now()}.${image.mediaType === 'video' ? 'mp4' : 'png'}`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        }
      } catch (error) {
        console.error('下载图片失败:', error)
      }
    })
  }

  const handleImageClick = async (image: UserImage, e: React.MouseEvent) => {
    // 如果点击的是按钮区域，不触发预览
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('[data-action-button]')) {
      return
    }

    if (!canViewOriginal(image)) {
      return
    }
    
    const isVideo = image.mediaType === 'video'
    setZoomedMediaType(isVideo ? 'video' : 'image')
    
    // 如果是加密媒体，确保已解码
    if (isEncryptedImage(image.imageUrl) && !decodedImages[image.imageUrl]) {
      try {
        const decodedUrl = isVideo
          ? await getVideoDisplayUrl(image.imageUrl, decodedImages)
          : await getImageDisplayUrl(image.imageUrl, decodedImages)
        setDecodedImages(prev => ({ ...prev, [image.imageUrl]: decodedUrl }))
        setZoomedImage(decodedUrl)
      } catch (error) {
        console.error('解码媒体失败:', error)
        setZoomedImage(image.imageUrl) // 失败时使用原URL
      }
    } else {
      setZoomedImage(getDisplayUrl(image.imageUrl, image.mediaType))
    }
  }

  const handleCopyPrompt = async (prompt: string, imageId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (prompt) {
      try {
        await navigator.clipboard.writeText(prompt)
        setCopiedPromptId(imageId)
        setTimeout(() => setCopiedPromptId(null), 2000)
      } catch (err) {
        console.error('复制失败:', err)
      }
    }
  }

  const handleUnlike = async (imageId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    try {
      const response = await fetch(`/api/community/likes/${imageId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('取消收藏失败')
      }

      await fetchLikedImages({ loadAll: showAllLiked, showInitialLoading: false })
    } catch (err) {
      console.error('取消收藏失败:', err)
    }
  }

  const handleToggleGeneratedSection = async () => {
    if (showAllGenerated) {
      setShowAllGenerated(false)
      return
    }

    if (images.length < generatedTotalCount) {
      await fetchImages({ loadAll: true, showInitialLoading: false })
    }
    setShowAllGenerated(true)
  }

  const handleToggleLikedSection = async () => {
    if (showAllLiked) {
      setShowAllLiked(false)
      return
    }

    if (likedImages.length < likedTotalCount) {
      await fetchLikedImages({ loadAll: true, showInitialLoading: false })
    }
    setShowAllLiked(true)
  }

  const renderMediaGrid = (imageList: UserImage[], section: 'generated' | 'liked') => (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {imageList.map((image) => {
        const mediaType = image.mediaType || 'image'
        const displayUrl = getDisplayUrl(image.imageUrl, mediaType)
        const shouldLoadMedia = visibleMediaUrls.has(image.imageUrl)
        const isDecoding = shouldLoadMedia && isEncryptedImage(image.imageUrl) && !decodedImages[image.imageUrl]
        const isVideo = mediaType === 'video'
        const masked = shouldShowMask(image)
        const canView = canViewOriginal(image)
        const warningMessage = image.moderationLevel && image.moderationLevel !== 'low'
          ? getModerationWarning(image.moderationLevel, isVideo ? 'video' : 'image')
          : ''
        const infoDate = section === 'liked' && image.likedAt ? image.likedAt : image.createdAt

        return (
          <div
            key={`${section}-${image.id}`}
            ref={registerMediaElement(image.imageUrl)}
            className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all hover:shadow-xl"
          >
            <div className="relative aspect-square overflow-hidden bg-gray-100">
              {!shouldLoadMedia ? (
                <div className="absolute inset-0 bg-gray-100" />
              ) : isDecoding ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-orange-500"></div>
                </div>
              ) : isVideo ? (
                <div
                  className={`absolute inset-0 group ${canView ? 'cursor-pointer' : 'cursor-default'}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleImageClick(image, e as any)
                  }}
                  onMouseEnter={(e) => {
                    if (!canView) return
                    const video = e.currentTarget.querySelector('video') as HTMLVideoElement
                    if (video) {
                      video.currentTime = 0
                      video.play().catch(() => {})
                    }
                  }}
                  onMouseLeave={(e) => {
                    const video = e.currentTarget.querySelector('video') as HTMLVideoElement
                    if (video) {
                      video.pause()
                    }
                  }}
                >
                  <video
                    src={displayUrl}
                    className={`absolute inset-0 h-full w-full object-cover transition-all ${masked ? 'scale-105 blur-xl brightness-75' : ''}`}
                    loop
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/10">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110">
                      <svg className="ml-1 h-8 w-8 text-gray-800" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
              ) : (
                <Image
                  src={displayUrl}
                  alt={image.prompt || '生成的图片'}
                  fill
                  className={`object-cover transition-all ${canView ? 'cursor-zoom-in' : 'cursor-default scale-105 blur-xl brightness-75'}`}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  onClick={(e) => handleImageClick(image, e as any)}
                  unoptimized={isEncryptedImage(image.imageUrl)}
                />
              )}
              {image.moderationLevel && image.moderationLevel !== 'low' && (
                <RestrictedMediaMask
                  level={image.moderationLevel}
                  warning={warningMessage}
                  revealed={canView}
                  canReveal={false}
                  onReveal={() => handleRequestRevealModeratedMedia(image.id)}
                />
              )}

              {section === 'generated' ? (
                <button
                  data-action-button
                  onClick={(e) => handleDeleteClick(image.id, e)}
                  disabled={deletingId === image.id}
                  className="absolute top-3 left-3 z-20 rounded-lg bg-gray-500/60 p-2 shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-gray-600/70 disabled:opacity-50"
                  title={isVideo ? "删除视频" : "删除图片"}
                >
                  <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ) : (
                <button
                  data-action-button
                  onClick={(e) => handleUnlike(image.id, e)}
                  className="absolute top-3 left-3 z-20 rounded-lg bg-pink-500/70 p-2 shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-pink-600/80"
                  title="取消收藏"
                >
                  <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                </button>
              )}

              <button
                data-action-button
                onClick={(e) => handleDownload(image, e)}
                className="absolute top-3 right-3 z-20 rounded-lg bg-gray-500/60 p-2 shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-gray-600/70 focus:outline-none disabled:opacity-50"
                title={isVideo ? "保存视频" : "保存图片"}
                disabled={!canView}
              >
                <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
              </button>

              {image.prompt && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 via-black/40 to-transparent p-3 backdrop-blur-sm">
                  {(image.width && image.height) || image.model ? (
                    <div className="mb-2 flex justify-end gap-2">
                      {image.width && image.height && (
                        <span className="rounded-md border border-white/30 bg-white/20 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
                          {image.width} × {image.height}
                        </span>
                      )}
                      {image.model && (
                        <span className="max-w-[120px] truncate rounded-md border border-white/30 bg-white/20 px-2 py-0.5 text-xs text-white backdrop-blur-sm" title={image.model}>
                          {image.model}
                        </span>
                      )}
                    </div>
                  ) : null}
                  <p
                    className="line-clamp-2 cursor-pointer text-xs text-white transition-colors hover:text-orange-300"
                    onClick={(e) => handleCopyPrompt(image.prompt!, image.id, e)}
                    title="点击复制提示词"
                  >
                    {image.prompt}
                  </p>
                  {copiedPromptId === image.id && (
                    <div className="absolute top-0 left-1/2 z-30 mb-2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-green-500/90 px-3 py-1.5 text-xs text-white backdrop-blur-md animate-fadeIn">
                      已复制提示词！
                      <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-transparent border-t-green-500/90"></div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {!image.prompt && (
              <div className="p-4">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  {image.width && image.height && (
                    <span>{image.width} × {image.height}</span>
                  )}
                  <span>{new Date(infoDate).toLocaleDateString()}</span>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  if (isPending || loading || likedLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-400"></div>
      </div>
    )
  }

  if (!session?.user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-white">
      {/* 页眉占位符 - 当页眉显示时需要占位 */}
      {showHeaderSpacer && <div className="h-16"></div>}
      <div className="max-w-7xl mx-auto px-4 pb-16 pt-10 lg:pl-48">
        {/* 页面标题和统计 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{t('title')}</h1>
          
          {/* 审核提示 */}
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 backdrop-blur-sm px-4 py-3 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-amber-800">
              请注意，中高风险内容将不会保存至我的作品。
            </p>
          </div>
          
          {/* 存储信息卡片 */}
          {storageInfo && (
            <div className={`rounded-2xl border p-6 mb-6 ${
              storageInfo.message 
                ? 'border-blue-200 bg-blue-50' 
                : 'border-gray-200 bg-white'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">{t('saved')}</span>
                  <span className="text-2xl font-bold text-gray-900">
                    {storageInfo.currentCount} / {storageInfo.maxImages}
                  </span>
                  {storageInfo.isSubscribed ? (
                    <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                      {t('member')}
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                      {t('regular')}
                    </span>
                  )}
                </div>
                {!storageInfo.isSubscribed && (
                  <Link
                    href={transferUrl('/pricing')}
                    className="px-4 py-2 bg-gradient-to-r from-orange-400 to-amber-400 text-white rounded-lg hover:from-orange-500 hover:to-amber-500 transition-all text-sm font-medium"
                  >
                    {t('subscribe')}
                  </Link>
                )}
              </div>
              
              {storageInfo.message && (
                <div className="mt-3 p-3 rounded-lg bg-blue-100 border border-blue-200">
                  <p className="text-sm text-blue-800">{storageInfo.message}</p>
                </div>
              )}
              
              {storageInfo.subscriptionExpiresAt && storageInfo.isSubscribed && (
                <p className="mt-2 text-xs text-gray-500">
                  {t('expiresAt')}: {new Date(storageInfo.subscriptionExpiresAt).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 图片网格 */}
        {images.length === 0 && likedImages.length === 0 ? (
          <div className="text-center py-20">
            <div className="mb-6">
              <svg className="w-24 h-24 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('empty.title')}</h2>
            <p className="text-gray-600 mb-6">{t('empty.description')}</p>
            <Link
              href={transferUrl('/create')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-400 to-amber-400 text-white rounded-xl hover:from-orange-500 hover:to-amber-500 transition-all font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              {t('empty.button')}
            </Link>
          </div>
        ) : (
          <>
            {images.length > 0 && (
              <section className="mb-10">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">{t('generated.title')}</h2>
                    <p className="mt-1 text-sm text-gray-500">{t('generated.description')}</p>
                  </div>
                  <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
                    {generatedTotalCount}
                  </span>
                </div>
                {renderMediaGrid(visibleGeneratedImages, 'generated')}
                {hasMoreGeneratedImages && (
                  <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-3">
                    <p className="text-sm text-gray-600">
                      {showAllGenerated
                        ? t('sectionToggle.showingAll', { count: generatedTotalCount })
                        : t('sectionToggle.showingPartial', {
                            visible: visibleGeneratedImages.length,
                            total: generatedTotalCount,
                          })}
                    </p>
                    <button
                      type="button"
                      onClick={handleToggleGeneratedSection}
                      disabled={loadingMoreGenerated}
                      className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-orange-700 shadow-sm transition-colors hover:bg-orange-100"
                    >
                      {loadingMoreGenerated
                        ? t('sectionToggle.loading')
                        : showAllGenerated
                          ? t('sectionToggle.collapse')
                          : t('sectionToggle.expand')}
                    </button>
                  </div>
                )}
              </section>
            )}

            {likedImages.length > 0 && (
              <section className="mb-2">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">{t('liked.title')}</h2>
                    <p className="mt-1 text-sm text-gray-500">{t('liked.description')}</p>
                  </div>
                  <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-medium text-pink-600">
                    {likedTotalCount}
                  </span>
                </div>
                {renderMediaGrid(visibleLikedImages, 'liked')}
                {hasMoreLikedImages && (
                  <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-3">
                    <p className="text-sm text-gray-600">
                      {showAllLiked
                        ? t('sectionToggle.showingAll', { count: likedTotalCount })
                        : t('sectionToggle.showingPartial', {
                            visible: visibleLikedImages.length,
                            total: likedTotalCount,
                          })}
                    </p>
                    <button
                      type="button"
                      onClick={handleToggleLikedSection}
                      disabled={loadingMoreLiked}
                      className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-pink-600 shadow-sm transition-colors hover:bg-pink-100"
                    >
                      {loadingMoreLiked
                        ? t('sectionToggle.loading')
                        : showAllLiked
                          ? t('sectionToggle.collapse')
                          : t('sectionToggle.expand')}
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* 图片放大预览模态框 */}
            {zoomedImage && (
              <div
                className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-4 animate-fadeInUp"
                onClick={() => {
                  setZoomedImage(null)
                  setZoomedMediaType(null)
                }}
              >
                {/* 顶部控制栏 */}
                <div className="w-full max-w-[1400px] flex justify-end mb-4">
                  <button
                    className="p-2 text-orange-300 hover:text-orange-100 transition-colors hover:scale-110 transform duration-300 bg-orange-800/50 rounded-full hover:bg-orange-700/50"
                    onClick={(e) => {
                      e.stopPropagation()
                      setZoomedImage(null)
                      setZoomedMediaType(null)
                    }}
                    aria-label="关闭预览"
                  >
                    <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* 媒体容器 */}
                <div className="relative w-full h-full flex items-center justify-center">
                  <div className="relative w-full max-w-[1400px] max-h-[calc(100vh-8rem)] flex items-center justify-center">
                    {zoomedMediaType === 'video' ? (
                      <video
                        src={zoomedImage || ''}
                        controls
                        autoPlay
                        loop
                        className="max-w-full max-h-[calc(100vh-8rem)] w-auto h-auto object-contain rounded-lg shadow-2xl border border-orange-400/30 animate-scaleIn"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <img
                        src={zoomedImage || ''}
                        alt="预览图片"
                        className="max-w-full max-h-[calc(100vh-8rem)] w-auto h-auto object-contain rounded-lg shadow-2xl border border-orange-400/30 animate-scaleIn"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                </div>

                {/* 底部提示 */}
                <div className="w-full max-w-[1400px] mt-4 text-center text-sm text-orange-200/60">
                  <p>点击背景或关闭按钮退出预览</p>
                </div>
              </div>
            )}

            {/* 删除确认模态框 */}
            {confirmDeleteId && (
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fadeInUp"
                onClick={handleCancelDelete}
              >
                <div
                  className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scaleIn"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">确认删除</h3>
                      <p className="text-sm text-gray-600 mt-1">确定要删除这张图片吗？此操作无法撤销。</p>
                    </div>
                  </div>

                  {deleteError && (
                    <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-sm text-red-700">{deleteError}</p>
                    </div>
                  )}

                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={handleCancelDelete}
                      disabled={deletingId === confirmDeleteId}
                      className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleConfirmDelete}
                      disabled={deletingId === confirmDeleteId}
                      className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
                    >
                      {deletingId === confirmDeleteId ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          删除中...
                        </>
                      ) : (
                        '确认删除'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <ModerationConsentModal
              open={Boolean(pendingModerationImageId)}
              message={MEDIUM_RISK_CONFIRM_MESSAGE}
              onClose={() => setPendingModerationImageId(null)}
              onConfirm={handleConfirmRevealModeratedMedia}
            />
          </>
        )}
      </div>
      
      {/* 下载协议弹窗 */}
      <DownloadTermsModalWrapper />
    </div>
  )
}
