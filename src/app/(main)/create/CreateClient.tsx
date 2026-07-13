'use client'


import { createScopedT } from '@/lib/strings'
import Image from 'next/image'
import { useMemo, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import GenerateSection from '@/components/GenerateSection'
import CommunityMasonry, { type CommunityWork } from '@/components/CommunityMasonry'
import { transferUrl } from '@/utils/locale'
import community from '../communityWorks'
import videoCommunityWorks from '../videoCommunityWorks'
import { useSession } from '@/lib/auth-client'
import { buildCreatePromptParams, readCreatePageDraft, readPromptDraft } from '@/utils/createPromptTransfer'

export default function CreateClient() {
  const COMMUNITY_SHOWCASE_LIMIT = 6
  const t = createScopedT('home')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()

  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'generate' | 'video-generation'>('generate')

  // 当URL参数改变时，更新activeTab状态
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    const newTab = tabParam === 'video' ? 'video-generation' : 'generate'
    setActiveTab(newTab)
  }, [searchParams])

  const initialPromptKey = useMemo(() => {
    const source = searchParams.get('source')
    const id = searchParams.get('id')
    const draft = searchParams.get('draft')
    const prompt = searchParams.get('prompt')

    if (source === 'community' && id) return `community:${id}`
    if (draft) return `draft:${draft}`
    if (prompt) return `prompt:${prompt}`
    return ''
  }, [searchParams])

  const [initialPrompt, setInitialPrompt] = useState(() => searchParams.get('prompt') || '')
  const [initialModel, setInitialModel] = useState(() => searchParams.get('model') || '')
  const [promptRestoreMessage, setPromptRestoreMessage] = useState<string | null>(null)

  useEffect(() => {
    const source = searchParams.get('source')
    const id = searchParams.get('id')
    const draft = searchParams.get('draft')
    const promptParam = searchParams.get('prompt') || ''
    const modelParam = searchParams.get('model') || ''
    const promptEdited = searchParams.get('promptEdited') === '1'

    setInitialModel(modelParam)
    setPromptRestoreMessage(null)

    if (initialPromptKey) {
      const pageDraftResult = readCreatePageDraft(initialPromptKey)

      if (pageDraftResult.status === 'found') {
        setInitialPrompt(pageDraftResult.draft.prompt)
        if (!modelParam && pageDraftResult.draft.model) {
          setInitialModel(pageDraftResult.draft.model)
        }
        if (pageDraftResult.draft.tab === 'video' || pageDraftResult.draft.mediaType === 'video') {
          setActiveTab('video-generation')
        }
        return
      }
    }

    if (promptEdited) {
      setInitialPrompt('')
      return
    }

    if (source === 'community' && id) {
      const controller = new AbortController()
      setInitialPrompt('')

      const restoreCommunityPrompt = async () => {
        try {
          const response = await fetch(`/api/community/media/${encodeURIComponent(id)}`, {
            signal: controller.signal,
          })
          const data = await response.json()

          if (controller.signal.aborted) return

          if (!response.ok || !data.success) {
            setPromptRestoreMessage(data.error || '作品信息不可用，请重新输入提示词')
            return
          }

          const item = data.item || {}
          setInitialPrompt(item.prompt || '')

          if (!modelParam && item.model) {
            setInitialModel(item.model)
          }

          if (item.mediaType === 'video') {
            setActiveTab('video-generation')
          }
        } catch (error) {
          if (controller.signal.aborted) return
          console.error('Failed to restore community prompt:', error)
          setPromptRestoreMessage('暂时无法读取同款提示词，请稍后重试')
        }
      }

      restoreCommunityPrompt()

      return () => controller.abort()
    }

    if (draft) {
      const result = readPromptDraft(draft)

      if (result.status === 'found') {
        setInitialPrompt(result.draft.prompt)
        if (!modelParam && result.draft.model) {
          setInitialModel(result.draft.model)
        }
        if (result.draft.tab === 'video' || result.draft.mediaType === 'video') {
          setActiveTab('video-generation')
        }
      } else {
        setInitialPrompt('')
        setPromptRestoreMessage(
          result.status === 'expired'
            ? '同款内容已过期，请重新点击画同款'
            : '同款内容不可用，请重新输入提示词'
        )
      }
      return
    }

    setInitialPrompt(promptParam)
  }, [searchParams, initialPromptKey])
  
  // 社区作品数据状态
  const [communityWorks, setCommunityWorks] = useState<CommunityWork[]>(
    (community.slice(0, COMMUNITY_SHOWCASE_LIMIT) as unknown as CommunityWork[])
  )
  
  // 视频社区作品数据状态
  const [videoWorks] = useState<CommunityWork[]>(
    videoCommunityWorks.map(work => ({
      id: work.id,
      image: work.image,
      video: work.video, // 添加视频字段
      prompt: work.prompt,
      model: '视频生成',
      mediaType: 'video',
      userAvatar: '/images/default-avatar.svg',
      userNickname: '默认',
      avatarFrameId: null,
    })) as CommunityWork[]
  )

  // 加载社区作品图片（仅用于图片生成界面）
  useEffect(() => {
    if (activeTab === 'video-generation') {
      // 视频生成界面使用视频社区，不需要从API加载
      return
    }
    
    // 游客也展示真实社区图片
    const fetchCommunityImages = async () => {
      try {
        const response = await fetch(`/api/community/images?limit=${COMMUNITY_SHOWCASE_LIMIT}`)
        
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.images && data.images.length > 0) {
            // 使用从数据库获取的图片，确保包含 userAvatar、userNickname、model 和 avatarFrameId
            const dbImages: CommunityWork[] = data.images.map((img: any) => ({
              id: img.id,
              communityMediaId: img.communityMediaId,
              sourceMediaId: img.sourceMediaId,
              image: img.image,
              prompt: img.prompt,
              model: img.model || '',
              mediaType: 'image',
              userAvatar: img.userAvatar || '/images/default-avatar.svg',
              userNickname: img.userNickname || '',
              avatarFrameId: img.avatarFrameId || null,
            }))
            
            // 如果数据库中的图片少于目标数量，用默认图片补足
            if (dbImages.length < COMMUNITY_SHOWCASE_LIMIT) {
              const defaultImages: CommunityWork[] = (community as any[]).map((work: any) => ({
                ...work,
                model: '默认',
                userAvatar: '/images/default-avatar.svg',
                userNickname: '默认',
                avatarFrameId: null,
              }))
              
              // 合并数据库图片和默认图片，优先显示数据库图片
              // 使用 'default-' 前缀确保默认图片的ID不会与数据库图片ID冲突
              const fillImages: CommunityWork[] = defaultImages
                .slice(0, COMMUNITY_SHOWCASE_LIMIT - dbImages.length)
                .map((work: any, index: number) => ({
                  ...work,
                  id: `default-${work.id}-${index}`, // 确保ID唯一
                  model: '默认',
                  mediaType: 'image',
                  userNickname: '默认',
                }))
              
              const combinedImages = [
                ...dbImages,
                ...fillImages
              ]
              
              setCommunityWorks(combinedImages)
            } else {
              // 如果数量足够，直接使用指定数量的社区图片
              setCommunityWorks(dbImages.slice(0, COMMUNITY_SHOWCASE_LIMIT))
            }
          } else {
            // 如果返回的数据无效或为空，使用默认图片（添加默认头像信息）
            setCommunityWorks((community as any[]).map((work: any) => ({
              ...work,
              model: '默认',
              userAvatar: '/images/default-avatar.svg',
              userNickname: '默认',
              avatarFrameId: null,
            })).slice(0, COMMUNITY_SHOWCASE_LIMIT))
          }
        } else {
          // 请求失败，使用默认图片（添加默认头像信息）
          setCommunityWorks((community as any[]).map((work: any) => ({
            ...work,
            model: '默认',
            userAvatar: '/images/default-avatar.svg',
            userNickname: '默认',
            avatarFrameId: null,
          })).slice(0, COMMUNITY_SHOWCASE_LIMIT))
        }
      } catch (error) {
        console.error('Error fetching community images:', error)
        // 请求失败，使用默认图片（添加默认头像信息）
        setCommunityWorks((community as any[]).map((work: any) => ({
          ...work,
          model: '默认',
          userAvatar: '/images/default-avatar.svg',
          userNickname: '默认',
          avatarFrameId: null,
        })).slice(0, COMMUNITY_SHOWCASE_LIMIT))
      }
    }

    fetchCommunityImages()
  }, [activeTab, session?.user])

  // 将图片URL转换为base64
  const imageUrlToBase64 = async (imageUrl: string): Promise<string | null> => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const base64String = reader.result?.toString()
          if (base64String) {
            // 移除 base64 前缀，只返回纯base64字符串
            const base64 = base64String.split(',')[1] || base64String
            resolve(base64)
          } else {
            reject(new Error('Failed to convert image to base64'))
          }
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    } catch (error) {
      console.error('Error converting image URL to base64:', error)
      return null
    }
  }

  const navigateToCreate = async (work: CommunityWork, imageUrl?: string) => {
    const mediaType = work.mediaType || (work.video || activeTab === 'video-generation' ? 'video' : 'image')
    const params = buildCreatePromptParams({
      communityMediaId: work.communityMediaId,
      prompt: work.prompt,
      model: work.model,
      mediaType,
      tab: activeTab === 'video-generation' ? 'video' : undefined,
    })
    const query = params.toString()
    router.push(transferUrl(`/create${query ? `?${query}` : ''}`))

    // 如果有图片URL，转换为base64并存储到sessionStorage，供GenerateSection使用
    if (imageUrl && activeTab === 'video-generation') {
      const base64 = await imageUrlToBase64(imageUrl)
      if (base64) {
        sessionStorage.setItem('videoReferenceImage', base64)
        // 触发自定义事件，通知GenerateSection
        window.dispatchEvent(new CustomEvent('videoReferenceImageReady', { detail: { base64, prompt: work.prompt } }))
      }
    }

    // 同页跳转时手动滚回顶部，确保用户立即看到生成表单
    window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 50)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 overflow-x-hidden">
      {/* 图片放大模态框 */}
      {zoomedImage && (
        <div
          className="fixed inset-0 bg-gray-200/95 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4 animate-fadeInUp"
          onClick={() => setZoomedImage(null)}
        >
          {/* 顶部控制栏 */}
          <div className="w-full max-w-[1400px] flex justify-end mb-4">
            <button
              className="p-2 text-gray-700 hover:text-gray-900 transition-colors hover:scale-110 transform duration-300 bg-gray-100/50 rounded-full hover:bg-gray-200/50"
              onClick={(e) => {
                e.stopPropagation()
                setZoomedImage(null)
              }}
              aria-label={t('banner.closeButton')}
            >
              <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 图片容器 */}
          <div className="relative w-full h-full flex items-center justify-center">
            <div className="relative w-full max-w-[1400px] max-h-[calc(100vh-8rem)] flex items-center justify-center">
              <Image
                src={zoomedImage}
                alt="Zoomed preview"
                width={1400}
                height={800}
                className="max-w-full max-h-[calc(100vh-8rem)] w-auto h-auto object-contain rounded-lg shadow-2xl border border-orange-400/30 animate-scaleIn"
                onClick={(e) => e.stopPropagation()}
                priority={false}
              />
            </div>
          </div>

          {/* 底部提示 */}
          <div className="w-full max-w-[1400px] mt-4 text-center text-sm text-gray-600">
            <p>{t('preview.closeHint')}</p>
          </div>
        </div>
      )}

      <main className="transition-all duration-300 pt-10 sm:pt-8 lg:ml-48 lg:mt-0 lg:pt-2">
        {promptRestoreMessage && (
          <div className="mx-auto mb-4 max-w-[1260px] px-3 sm:px-5">
            <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 shadow-sm">
              {promptRestoreMessage}
            </div>
          </div>
        )}
        <GenerateSection
          communityWorks={activeTab === 'video-generation' ? videoWorks : communityWorks}
          initialPrompt={initialPrompt}
          initialPromptKey={initialPromptKey}
          initialModel={initialModel}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Community Showcase Section - 同步首页优化方案 */}
        <section
          id="community-showcase"
          className="py-14 sm:py-20 px-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 bg-gray-50/90 backdrop-blur-md relative"
        >
          <div className="w-full max-w-[1260px] mx-auto relative px-4 sm:px-6">
            {/* 头部区域：与首页保持一致的优化结构 */}
            <div className="text-center mb-10 sm:mb-14">
              {/* 主标题 + 社区图标 */}
              <div className="flex items-center justify-center gap-3 sm:gap-4 mb-6">
                <div className="p-2.5 sm:p-3 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-50 border border-orange-200 shadow-sm">
                  <Image
                    src="/common/comunity.svg"
                    alt="Community"
                    width={32}
                    height={32}
                    className="w-7 h-7 sm:w-8 sm:h-8"
                    priority={false}
                  />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 animate-fadeInUp">
                  {t('community.title')}
                </h2>
              </div>

              {/* 副标题 + 立即进入按钮 */}
              <div className="animate-fadeInUp animation-delay-200">
                <p className="text-base sm:text-lg text-gray-600 mb-5 max-w-2xl mx-auto">
                  {t('community.subtitle')}
                </p>

                {/* 核心优化：显眼的完整社区入口 */}
                <button
                  type="button"
                  onClick={() => router.push(transferUrl('/community'))}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-6 sm:px-8 py-3 sm:py-3.5 text-sm sm:text-base font-semibold text-white shadow-lg shadow-orange-500/25 transition-all duration-300 hover:shadow-orange-500/40 hover:scale-105 hover:from-orange-400 hover:to-amber-400 active:scale-95"
                >
                  <span>进入社区</span>
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 微型社区展示 */}
            <div className="animate-fadeInUp animation-delay-300">
              <CommunityMasonry
                works={activeTab === 'video-generation' ? videoWorks : communityWorks}
                onGenerateSame={(work, imageUrl) => navigateToCreate(work, imageUrl)}
                onPreview={(img) => setZoomedImage(img)}
                generateSameText={t('community.generateSame')}
              />
            </div>

          </div>
        </section>
      </main>
    </div>
  )
}

