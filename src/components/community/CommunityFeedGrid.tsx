'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import AvatarWithFrame from '@/components/AvatarWithFrame'
import ReportDialog from '@/components/ReportDialog'
import { useDownloadWithTerms } from '@/hooks/useDownloadWithTerms'
import { formatCommunityTime } from '@/utils/communityTime'
import { getMediaDisplayUrl, isEncryptedImage } from '@/utils/imageDisplay'
import { useSession } from '@/lib/auth-client'

export type CommunityFeedItem = {
  id: string
  mediaUrl: string
  mediaType: 'image' | 'video'
  prompt: string
  model: string
  createdAt: string
  tags: string[]
  userAvatar: string
  userNickname: string
  avatarFrameId: number | null
  likedByCurrentUser?: boolean
}

type Props = {
  items: CommunityFeedItem[]
  loading?: boolean
  generateSameText?: string
  onGenerateSame?: (item: CommunityFeedItem) => void
  onTagClick?: (tag: string) => void
}

export default function CommunityFeedGrid({
  items,
  loading = false,
  generateSameText = '画同款',
  onGenerateSame,
  onTagClick,
}: Props) {
  const [decodedMedia, setDecodedMedia] = useState<Record<string, string>>({})
  const [decodingMedia, setDecodingMedia] = useState<Set<string>>(new Set())
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const [reportingItemId, setReportingItemId] = useState('')
  const [likedItemIds, setLikedItemIds] = useState<Set<string>>(new Set())
  const [likeLoadingIds, setLikeLoadingIds] = useState<Set<string>>(new Set())
  const [selectedItem, setSelectedItem] = useState<CommunityFeedItem | null>(null)
  const [copiedPromptItemId, setCopiedPromptItemId] = useState<string | null>(null)
  const { data: session } = useSession()
  const { checkAndDownload, DownloadTermsModalWrapper } = useDownloadWithTerms()

  useEffect(() => {
    const pendingItems = items.filter(
      (item) => isEncryptedImage(item.mediaUrl) && !decodedMedia[item.mediaUrl] && !decodingMedia.has(item.mediaUrl)
    )

    if (pendingItems.length === 0) return

    let cancelled = false
    const queue = [...pendingItems]

    const runWorker = async () => {
      while (queue.length > 0 && !cancelled) {
        const item = queue.shift()
        if (!item) continue

        setDecodingMedia((prev) => new Set(prev).add(item.mediaUrl))
        try {
          const decodedUrl = await getMediaDisplayUrl(item.mediaUrl, decodedMedia, item.mediaType)
          if (!cancelled) {
            setDecodedMedia((prev) => ({
              ...prev,
              [item.mediaUrl]: decodedUrl,
            }))
          }
        } catch (error) {
          console.error('社区媒体解码失败:', error)
        } finally {
          setDecodingMedia((prev) => {
            const next = new Set(prev)
            next.delete(item.mediaUrl)
            return next
          })
        }
      }
    }

    Promise.all(Array.from({ length: Math.min(4, queue.length) }, runWorker)).catch((error) => {
      console.error('批量解码社区媒体失败:', error)
    })

    return () => {
      cancelled = true
    }
  }, [items, decodedMedia, decodingMedia])

  useEffect(() => {
    setLikedItemIds(new Set(items.filter((item) => item.likedByCurrentUser).map((item) => item.id)))
  }, [items])

  useEffect(() => {
    if (!selectedItem) return

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedItem(null)
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedItem])

  const getDisplayUrl = (item: CommunityFeedItem) => decodedMedia[item.mediaUrl] || item.mediaUrl

  const handleReport = (itemId: string) => {
    setReportingItemId(itemId)
    setReportDialogOpen(true)
  }

  const handleDownload = async (item: CommunityFeedItem) => {
    await checkAndDownload(async () => {
      let downloadUrl = getDisplayUrl(item)

      if (isEncryptedImage(item.mediaUrl) && !decodedMedia[item.mediaUrl]) {
        downloadUrl = await getMediaDisplayUrl(item.mediaUrl, decodedMedia, item.mediaType)
        setDecodedMedia((prev) => ({
          ...prev,
          [item.mediaUrl]: downloadUrl,
        }))
      }

      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `${item.mediaType === 'video' ? 'video' : 'image'}-${Date.now()}.${item.mediaType === 'video' ? 'mp4' : 'png'}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    })
  }

  const handleLikeToggle = async (itemId: string) => {
    if (!session?.user) {
      alert('请先登录后再点赞收藏')
      return
    }

    if (likeLoadingIds.has(itemId)) return

    const liked = likedItemIds.has(itemId)

    setLikeLoadingIds((prev) => new Set(prev).add(itemId))
    try {
      const response = await fetch(`/api/community/likes/${itemId}`, {
        method: liked ? 'DELETE' : 'POST',
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || '操作失败')
      }

      setLikedItemIds((prev) => {
        const next = new Set(prev)
        if (liked) {
          next.delete(itemId)
        } else {
          next.add(itemId)
        }
        return next
      })
    } catch (error) {
      console.error('社区点赞失败:', error)
      alert(error instanceof Error ? error.message : '操作失败，请稍后重试')
    } finally {
      setLikeLoadingIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const handleCopyPrompt = async (item: CommunityFeedItem) => {
    const prompt = item.prompt?.trim()
    if (!prompt) {
      alert('暂无可复制的提示词')
      return
    }

    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedPromptItemId(item.id)
      window.setTimeout(() => {
        setCopiedPromptItemId((current) => (current === item.id ? null : current))
      }, 1500)
    } catch (error) {
      console.error('复制提示词失败:', error)
      alert('复制失败，请稍后重试')
    }
  }

  const renderMedia = (
    item: CommunityFeedItem,
    options: {
      sizes: string
      className: string
      showVideoBadge?: boolean
      showVideoControls?: boolean
      containerClassName?: string
      intrinsicMedia?: boolean
    }
  ) => {
    const displayUrl = getDisplayUrl(item)
    const isDecoding = isEncryptedImage(item.mediaUrl) && !decodedMedia[item.mediaUrl]
    const isIntrinsic = options.intrinsicMedia ?? false

    return (
      <div
        className={`relative overflow-hidden ${isIntrinsic ? 'inline-flex max-w-full items-center justify-center' : 'h-full w-full'} ${options.containerClassName ?? 'bg-gray-100'}`}
      >
        {isDecoding ? (
          <div className={`flex items-center justify-center ${isIntrinsic ? 'min-h-[240px] min-w-[180px]' : 'absolute inset-0'}`}>
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-orange-500" />
          </div>
        ) : item.mediaType === 'video' ? (
          <video
            src={displayUrl}
            autoPlay
            loop
            muted
            playsInline
            controls={options.showVideoControls ?? false}
            className={options.className}
          />
        ) : isIntrinsic ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl}
            alt={item.prompt || '社区作品'}
            className={options.className}
          />
        ) : (
          <Image
            src={displayUrl}
            alt={item.prompt || '社区作品'}
            fill
            className={options.className}
            unoptimized={isEncryptedImage(item.mediaUrl)}
            sizes={options.sizes}
          />
        )}

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_25%_10%,rgba(255,255,255,0.22),transparent_42%)] opacity-70" />

        {options.showVideoBadge && item.mediaType === 'video' && (
          <div className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur">
            <svg className="h-3 w-3 fill-current" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M6.5 5.5a1 1 0 011.53-.848l6 3.75a1 1 0 010 1.696l-6 3.75A1 1 0 016.5 13.5v-8z" />
            </svg>
            <span>视频</span>
          </div>
        )}
      </div>
    )
  }

  if (loading && items.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-3 xl:gap-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-[20px] border border-orange-200/60 bg-white/80 p-1.5 shadow-sm sm:rounded-[26px] sm:p-2.5"
          >
            <div className="aspect-[4/5] animate-pulse rounded-[16px] bg-gray-200 sm:rounded-[22px]" />
            <div className="space-y-3 p-3 sm:p-4">
              <div className="h-5 w-1/3 animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-3 xl:gap-4">
        {items.map((item) => {
          const isLiked = likedItemIds.has(item.id)
          const isLikeLoading = likeLoadingIds.has(item.id)
          const nickname = item.userNickname?.trim() || '匿名用户'
          const model = item.model?.trim() || '未知模型'
          const avatar = item.userAvatar || '/images/default-avatar.svg'

          return (
            <article
              key={item.id}
              role="button"
              tabIndex={0}
              aria-label={`查看${nickname}发布的${item.mediaType === 'video' ? '视频' : '图片'}`}
              onClick={() => setSelectedItem(item)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedItem(item)
                }
              }}
              className="group cursor-pointer overflow-hidden rounded-[20px] border border-orange-200/60 bg-white/88 p-1.5 text-left shadow-[0_18px_50px_-35px_rgba(249,115,22,0.42)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_22px_54px_-34px_rgba(249,115,22,0.48)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200/70 sm:rounded-[26px] sm:p-2.5 lg:p-3"
            >
              <div className="overflow-hidden rounded-[16px] border border-orange-100/70 bg-gray-100 sm:rounded-[22px]">
                <div className="aspect-[4/5]">
                  {renderMedia(item, {
                    sizes: '(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw',
                    className:
                      'h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] group-focus-visible:scale-[1.03]',
                    showVideoBadge: true,
                  })}
                </div>
              </div>

              <div className="space-y-3 px-0.5 pt-2.5 sm:space-y-4 sm:px-1 sm:pt-3.5">
                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                  <AvatarWithFrame
                    avatar={avatar}
                    avatarFrameId={item.avatarFrameId}
                    size={26}
                    className="border border-orange-200/70 sm:h-[34px] sm:w-[34px]"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-gray-900 sm:text-sm">
                      {nickname}
                    </p>
                    <p className="text-[10px] text-gray-500 sm:text-xs">{formatCommunityTime(item.createdAt)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-orange-100 pt-3 text-[10px] text-gray-500 sm:gap-3 sm:text-xs">
                  <span className="max-w-[52%] truncate text-[10px] sm:max-w-none sm:text-xs">{model}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      void handleLikeToggle(item.id)
                    }}
                    disabled={isLikeLoading}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 transition sm:gap-1.5 sm:px-3 sm:py-1.5 ${
                      isLiked
                        ? 'border-pink-200 bg-pink-50 text-pink-600 hover:bg-pink-100'
                        : 'border-orange-200 bg-white text-gray-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    title={isLiked ? '取消收藏' : '点赞收藏'}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                      />
                    </svg>
                    <span className="hidden sm:inline">{isLiked ? '已收藏' : '收藏'}</span>
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {selectedItem && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/60 p-3 backdrop-blur-[6px] sm:p-5"
          onClick={() => setSelectedItem(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="社区作品详情"
            className="relative max-h-[92vh] w-full max-w-[1040px] overflow-hidden rounded-[28px] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,249,243,0.98)_100%)] shadow-[0_30px_120px_-32px_rgba(15,23,42,0.45)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedItem(null)}
              className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/88 text-gray-600 shadow-sm transition hover:bg-white"
              aria-label="关闭详情弹窗"
              title="关闭"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 6l8 8M14 6l-8 8" />
              </svg>
            </button>

            <div className="max-h-[92vh] overflow-y-auto p-3 pb-8 sm:p-5 sm:pb-10 lg:p-6 lg:pb-12">
              <div className="space-y-4 sm:space-y-5">
                <div className="flex justify-center">
                  <div className="max-h-[68vh] max-w-full">
                    {renderMedia(selectedItem, {
                      sizes: '(max-width: 1024px) 92vw, 880px',
                      className:
                        selectedItem.mediaType === 'video'
                          ? 'block max-h-[68vh] w-auto max-w-full rounded-[24px] object-contain'
                          : 'block max-h-[68vh] w-auto max-w-full rounded-[24px] object-contain',
                      showVideoControls: true,
                      containerClassName: 'bg-transparent',
                      intrinsicMedia: true,
                    })}
                  </div>
                </div>

                <div className="space-y-4 pb-2 sm:space-y-5 sm:pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <AvatarWithFrame
                        avatar={selectedItem.userAvatar || '/images/default-avatar.svg'}
                        avatarFrameId={selectedItem.avatarFrameId}
                        size={36}
                        className="border border-orange-200/70"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-gray-900 sm:text-sm">
                          {selectedItem.userNickname?.trim() || '匿名用户'}
                        </p>
                        <p className="text-[11px] text-gray-500 sm:text-xs">
                          {formatCommunityTime(selectedItem.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-full border border-orange-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-gray-600 sm:px-3 sm:py-1.5 sm:text-xs">
                      {selectedItem.model?.trim() || '未知模型'}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-orange-100/80 bg-white/78 p-4 shadow-sm">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <p className="text-xs font-medium tracking-[0.2em] text-orange-500/90">提示词</p>
                      <button
                        type="button"
                        onClick={() => void handleCopyPrompt(selectedItem)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-orange-200 bg-white text-orange-700 transition hover:border-orange-300 hover:bg-orange-50"
                        aria-label={copiedPromptItemId === selectedItem.id ? '提示词已复制' : '复制提示词'}
                        title={copiedPromptItemId === selectedItem.id ? '提示词已复制' : '复制提示词'}
                      >
                        {copiedPromptItemId === selectedItem.id ? (
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V5a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2h-2m-4 4H6a2 2 0 01-2-2v-6a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <p className="max-h-36 overflow-y-auto whitespace-pre-wrap pr-1 text-[12px] leading-5 text-gray-700 sm:text-[13px] sm:leading-5">
                      {selectedItem.prompt?.trim() || '暂无提示词'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                      {selectedItem.tags.length > 0 ? (
                        selectedItem.tags.map((tag) => (
                          <button
                            key={`${selectedItem.id}-${tag}`}
                            type="button"
                            onClick={() => {
                              onTagClick?.(tag)
                              setSelectedItem(null)
                            }}
                            className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-700 transition hover:border-orange-300 hover:bg-orange-100 sm:px-3 sm:py-1.5 sm:text-xs"
                          >
                            {tag}
                          </button>
                        ))
                      ) : (
                        <span className="rounded-full border border-dashed border-orange-200 bg-orange-50/70 px-2.5 py-1 text-[11px] text-gray-500 sm:px-3 sm:py-1.5 sm:text-xs">
                          标签生成中
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {session?.user && (
                        <button
                          type="button"
                          onClick={() => handleReport(selectedItem.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-orange-200 bg-white text-orange-700 transition hover:border-orange-300 hover:bg-orange-50"
                          aria-label="举报不当内容"
                          title="举报不当内容"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => void handleDownload(selectedItem)}
                      className="inline-flex min-w-0 items-center justify-center gap-2 rounded-[18px] border border-orange-200 bg-white px-4 py-3 text-sm font-semibold text-orange-700 transition hover:border-orange-300 hover:bg-orange-50 sm:px-5"
                      aria-label="下载作品"
                      title="下载作品"
                    >
                      <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-5l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>下载</span>
                    </button>
                    {onGenerateSame && (
                      <button
                        type="button"
                        onClick={() => onGenerateSame(selectedItem)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:from-orange-400 hover:to-amber-400 active:scale-[0.99] sm:px-5 sm:text-base"
                      >
                        <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                        </svg>
                        <span>{generateSameText}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ReportDialog
        isOpen={reportDialogOpen}
        onClose={() => {
          setReportDialogOpen(false)
          setReportingItemId('')
        }}
        imageId={reportingItemId}
      />
      <DownloadTermsModalWrapper />
    </>
  )
}
