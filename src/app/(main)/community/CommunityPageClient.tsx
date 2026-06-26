'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createScopedT } from '@/lib/strings'
import CommunityFeedGrid, { type CommunityFeedItem } from '@/components/community/CommunityFeedGrid'
import { transferUrl } from '@/utils/locale'
import { buildCreatePromptParams } from '@/utils/createPromptTransfer'

type TagRecommendation = {
  id: number | string
  name: string
  usageCount: number
}

const RECOMMENDED_TAG_LIMIT = 4

export default function CommunityPageClient() {
  const t = createScopedT('communityPage')
  const router = useRouter()
  const [draftKeyword, setDraftKeyword] = useState('')
  const [keyword, setKeyword] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [items, setItems] = useState<CommunityFeedItem[]>([])
  const [tagRecommendations, setTagRecommendations] = useState<TagRecommendation[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingFeed, setLoadingFeed] = useState(true)
  const [loadingTags, setLoadingTags] = useState(true)

  const fetchFeed = useCallback(
    async (reset: boolean, currentOffset = 0) => {
      const params = new URLSearchParams({
        sort: 'latest',
        type: 'all',
        limit: '18',
        offset: reset ? '0' : String(currentOffset),
      })

      if (keyword.trim()) params.set('q', keyword.trim())
      if (selectedTag.trim()) params.set('tag', selectedTag.trim())

      setLoadingFeed(true)
      try {
        const response = await fetch(`/api/community/feed?${params.toString()}`)
        const data = await response.json()

        if (!response.ok || !data.success) {
          throw new Error(data.error || '加载社区作品失败')
        }

        setItems((prev) => (reset ? data.items : [...prev, ...data.items]))
        setHasMore(Boolean(data.hasMore))
      } catch (error) {
        console.error('加载社区作品失败:', error)
        if (reset) setItems([])
        setHasMore(false)
      } finally {
        setLoadingFeed(false)
      }
    },
    [keyword, selectedTag]
  )

  const fetchTags = useCallback(async () => {
    setLoadingTags(true)
    try {
      const response = await fetch(`/api/community/tags?mode=random&limit=${RECOMMENDED_TAG_LIMIT}`)
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || '加载推荐标签失败')
      }
      setTagRecommendations(data.tags || [])
    } catch (error) {
      console.error('加载推荐标签失败:', error)
      setTagRecommendations([])
    } finally {
      setLoadingTags(false)
    }
  }, [])

  useEffect(() => {
    void fetchFeed(true)
  }, [keyword, selectedTag, fetchFeed])

  useEffect(() => {
    void fetchTags()
  }, [fetchTags])

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSelectedTag('')
    setKeyword(draftKeyword.trim())
  }

  const handleSelectTag = (tag: string) => {
    setSelectedTag(tag)
    setKeyword('')
    setDraftKeyword('')
  }

  const handleClearSelectedTag = () => {
    setSelectedTag('')
  }

  const handleGenerateSame = useCallback(
    (item: CommunityFeedItem) => {
      const params = buildCreatePromptParams({
        communityMediaId: item.id,
        prompt: item.prompt,
        model: item.model,
        mediaType: item.mediaType,
      })
      const query = params.toString()
      router.push(transferUrl(`/create${query ? `?${query}` : ''}`))
    },
    [router]
  )

  const visibleTagRecommendations =
    selectedTag && !tagRecommendations.some((tagItem) => tagItem.name === selectedTag)
      ? [...tagRecommendations, { id: `selected-${selectedTag}`, name: selectedTag, usageCount: 0 }]
      : tagRecommendations

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#fffaf5_38%,#ffffff_100%)] px-5 pb-16 pt-24 sm:px-8 sm:pt-12 lg:ml-48 lg:px-12 xl:px-16 2xl:px-20">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-8 px-1 sm:px-6">
        <section className="space-y-5 sm:space-y-6">
          <div className="flex flex-col gap-3 rounded-[32px] border border-orange-100 bg-white/80 p-3.5 shadow-sm backdrop-blur sm:gap-5 sm:p-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900 sm:text-2xl">{t('feedTitle')}</h2>
              <p className="mt-1 text-[11px] text-gray-600 sm:mt-2 sm:text-sm">{t('feedSubtitle')}</p>
            </div>

            <form onSubmit={handleSearch}>
              <div className="flex items-center gap-1.5 sm:gap-3 lg:flex-row">
                <input
                  value={draftKeyword}
                  onChange={(event) => setDraftKeyword(event.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="h-8 min-w-0 flex-1 rounded-xl border border-orange-200 bg-white px-3 text-[11px] text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 sm:h-14 sm:rounded-2xl sm:px-5 sm:text-sm"
                />
                <button
                  type="submit"
                  className="h-8 shrink-0 rounded-xl bg-gray-900 px-3 text-[11px] font-semibold text-white transition hover:bg-gray-800 sm:h-14 sm:rounded-2xl sm:px-6 sm:text-sm"
                >
                  {t('searchButton')}
                </button>
              </div>
            </form>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-[11px] font-medium text-gray-600 sm:text-sm">{t('recommendTitle')}</span>
              <div className="flex min-h-7 flex-wrap gap-1.5 sm:min-h-11 sm:gap-3">
                {loadingTags ? (
                  Array.from({ length: RECOMMENDED_TAG_LIMIT }).map((_, index) => (
                    <div key={index} className="h-6 w-14 animate-pulse rounded-full bg-orange-100 sm:h-10 sm:w-24" />
                  ))
                ) : (
                  visibleTagRecommendations.map((tagItem) => (
                    selectedTag === tagItem.name ? (
                      <div
                        key={tagItem.id}
                        className="inline-flex items-center gap-1 rounded-full border border-orange-500 bg-orange-500 px-2 py-0.5 text-[10px] font-medium text-white sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
                      >
                        <span>{tagItem.name}</span>
                        <button
                          type="button"
                          onClick={handleClearSelectedTag}
                          className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25 sm:h-5 sm:w-5"
                          aria-label={`${t('clearButton')} ${tagItem.name}`}
                          title={t('clearButton')}
                        >
                          <svg className="h-2 w-2 sm:h-3 sm:w-3" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 6l8 8M14 6l-8 8" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        key={tagItem.id}
                        type="button"
                        onClick={() => handleSelectTag(tagItem.name)}
                        className="rounded-full border border-orange-200 bg-white px-2 py-0.5 text-[10px] font-medium text-orange-700 transition hover:border-orange-300 hover:bg-orange-50 sm:px-4 sm:py-2 sm:text-sm"
                      >
                        {tagItem.name}
                      </button>
                    )
                  ))
                )}
              </div>
            </div>

            {keyword && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs text-orange-700 sm:px-4 sm:py-2 sm:text-sm">
                  {t('activeFilter.search')}：{keyword}
                </span>
              </div>
            )}
          </div>

          <div className="relative">
            {items.length === 0 && !loadingFeed ? (
              <div className="rounded-[32px] border border-dashed border-orange-200 bg-white/70 px-6 py-16 text-center text-gray-500">
                {t('empty')}
              </div>
            ) : (
              <CommunityFeedGrid
                items={items}
                loading={loadingFeed}
                generateSameText={t('cta')}
                onGenerateSame={handleGenerateSame}
                onTagClick={(tag) => {
                  handleSelectTag(tag)
                }}
              />
            )}

            {loadingFeed && items.length > 0 && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[32px] bg-white/72 backdrop-blur-[2px]">
                <div className="flex flex-col items-center gap-3 rounded-3xl border border-orange-100 bg-white/90 px-6 py-5 shadow-sm">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
                  <span className="text-sm font-medium text-gray-600">{t('loading')}</span>
                </div>
              </div>
            )}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => void fetchFeed(false, items.length)}
                disabled={loadingFeed}
                className="rounded-2xl border border-orange-200 bg-white px-6 py-3 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingFeed ? t('loading') : t('loadMore')}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
