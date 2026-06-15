'use client'


import { createScopedT, msg } from '@/lib/strings'
import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import community from './communityWorks'
import SiteStats from '@/components/SiteStats'
import { transferUrl } from '@/utils/locale'
import { getHomepageAsset } from '@/utils/homepageAssets'
import { getAvailableModels } from '@/utils/modelConfig'
import { getAvailableWorkflows } from '@/utils/workflowConfig'
import type { VideoModelConfig } from '@/utils/videoModelConfig'
import AIPlazaCard from '@/components/AIPlazaCard'
import VideoToVideoPlazaCard from '@/components/VideoToVideoPlazaCard'
import { ModelConfig } from '@/utils/modelConfig'
import { WorkflowConfig } from '@/utils/workflowConfig'
import { getVideoModelDescription, getVideoModelDisplayTags } from '@/utils/videoModelDisplay'
import CommunityMasonry, { type CommunityWork } from '@/components/CommunityMasonry'
import { buildCreatePromptParams } from '@/utils/createPromptTransfer'

interface FAQItem {
  q: string;
  a: string;
}

const VIDEO_MODEL_DEMOS: Record<string, { videoSrc: string; videoFallbackSrc: string; thumbnailSrc: string; thumbnailFallbackSrc: string }> = {
  'Wan2.2-I2V-Lightning': {
    videoSrc: getHomepageAsset('/images/video-community/video-demo-8.mp4'),
    videoFallbackSrc: '/images/video-community/video-demo-8.mp4',
    thumbnailSrc: getHomepageAsset('/images/video-community/video-demo-8.png'),
    thumbnailFallbackSrc: '/images/video-community/video-demo-8.png',
  },
  'grok-imagine-1.0-video': {
    videoSrc: getHomepageAsset('/images/video-community/video-demo-10.mp4'),
    videoFallbackSrc: '/images/video-community/video-demo-10.mp4',
    thumbnailSrc: getHomepageAsset('/images/video-community/video-demo-10.png'),
    thumbnailFallbackSrc: '/images/video-community/video-demo-10.png',
  },
  'happyhorse-1.0': {
    videoSrc: getHomepageAsset('/images/video-community/video-demo-3.mp4'),
    videoFallbackSrc: '/images/video-community/video-demo-3.mp4',
    thumbnailSrc: getHomepageAsset('/images/video-community/video-demo-3.png'),
    thumbnailFallbackSrc: '/images/video-community/video-demo-3.png',
  },
  'happyhorse-1.0-t2v': {
    videoSrc: getHomepageAsset('/images/video-community/video-demo-11.mp4'),
    videoFallbackSrc: '/images/video-community/video-demo-11.mp4',
    thumbnailSrc: getHomepageAsset('/images/video-community/video-demo-11.png'),
    thumbnailFallbackSrc: '/images/video-community/video-demo-11.png',
  },
  'happyhorse-1.0-i2v': {
    videoSrc: getHomepageAsset('/images/video-community/video-demo-5.mp4'),
    videoFallbackSrc: '/images/video-community/video-demo-5.mp4',
    thumbnailSrc: getHomepageAsset('/images/video-community/video-demo-5.png'),
    thumbnailFallbackSrc: '/images/video-community/video-demo-5.png',
  },
  'happyhorse-1.0-r2v': {
    videoSrc: getHomepageAsset('/images/video-community/video-demo-12.mp4'),
    videoFallbackSrc: '/images/video-community/video-demo-12.mp4',
    thumbnailSrc: getHomepageAsset('/images/video-community/video-demo-12.png'),
    thumbnailFallbackSrc: '/images/video-community/video-demo-12.png',
  },
  'happyhorse-1.0-video-edit': {
    videoSrc: getHomepageAsset('/images/video-community/video-demo-9.mp4'),
    videoFallbackSrc: '/images/video-community/video-demo-9.mp4',
    thumbnailSrc: getHomepageAsset('/images/video-community/video-demo-9.png'),
    thumbnailFallbackSrc: '/images/video-community/video-demo-9.png',
  },
}

function sortImageModelsForHomepage(models: ModelConfig[]): ModelConfig[] {
  return [...models].sort((a, b) => {
    const aIsGrok = a.id.toLowerCase().includes('grok')
    const bIsGrok = b.id.toLowerCase().includes('grok')
    if (aIsGrok === bIsGrok) return 0
    return aIsGrok ? 1 : -1
  })
}

export default function HomeClient() {
  const COMMUNITY_SHOWCASE_LIMIT = 6
  const [currentShowcaseIndex, setCurrentShowcaseIndex] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const t = createScopedT('home')
  const tFriends = createScopedT('friends')
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const router = useRouter()
  const faqQuestions = msg<FAQItem[]>('home.faq.questions')
  // 先使用所有模型和工作流，然后异步更新为可用的
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([])
  const [availableVideoModels, setAvailableVideoModels] = useState<VideoModelConfig[]>([])
  const [availableWorkflows, setAvailableWorkflows] = useState<WorkflowConfig[]>([])
  const [isLoadingAIItems, setIsLoadingAIItems] = useState(false)
  const homepageImageModels = sortImageModelsForHomepage(availableModels)

  // 加载可用的模型和工作流（基于环境变量）
  useEffect(() => {
    const fetchAIItems = async () => {
      setIsLoadingAIItems(true)
      try {
        const [models, workflows, videoModelsResponse] = await Promise.all([
          getAvailableModels(),
          getAvailableWorkflows(),
          fetch('/api/video-models'),
        ])
        const videoModelsData = videoModelsResponse.ok ? await videoModelsResponse.json() : { models: [] }
        setAvailableModels(models)
        setAvailableWorkflows(workflows)
        setAvailableVideoModels(Array.isArray(videoModelsData.models) ? videoModelsData.models : [])
      } catch (error) {
        console.error('Error fetching AI items:', error)
        // 如果API调用失败，显示空列表
        setAvailableModels([])
        setAvailableVideoModels([])
        setAvailableWorkflows([])
      } finally {
        setIsLoadingAIItems(false)
      }
    }

    fetchAIItems()
  }, [])


  const showcaseItems = [
    {
      type: 'video' as const,
      src: '/images/bg.mp4',
      poster: '/images/bg.png',
    },
    {
      type: 'image' as const,
      src: '/images/demo-12.png',
    },
    {
      type: 'image' as const,
      src: '/images/demo-1.png',
    },
    {
      type: 'image' as const,
      src: '/images/demo-8.png',
    },
  ]

  // 自动切换展示内容
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }

    const timer = setInterval(() => {
      setCurrentShowcaseIndex((prevIndex) =>
        prevIndex === showcaseItems.length - 1 ? 0 : prevIndex + 1
      )
    }, 6000)

    timerRef.current = timer

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [showcaseItems.length])

  // 手动切换展示内容时重置计时器
  const handleShowcaseChange = (index: number) => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    setCurrentShowcaseIndex(index)

    const timer = setInterval(() => {
      setCurrentShowcaseIndex((prevIndex) =>
        prevIndex === showcaseItems.length - 1 ? 0 : prevIndex + 1
      )
    }, 6000)

    timerRef.current = timer
  }

  // 社区作品数据状态
  const [communityWorks, setCommunityWorks] = useState<CommunityWork[]>(
    (community.slice(0, COMMUNITY_SHOWCASE_LIMIT) as unknown as CommunityWork[])
  )

  // 加载社区作品图片，游客也展示真实社区图片
  useEffect(() => {
    const fetchCommunityImages = async () => {
      try {
        const response = await fetch(`/api/community/images?limit=${COMMUNITY_SHOWCASE_LIMIT}`)
        
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.images && data.images.length > 0) {
            // 使用从数据库获取的图片，确保包含 userAvatar、userNickname、model 和 avatarFrameId
            const dbImages = data.images.map((img: any) => ({
              id: img.id,
              communityMediaId: img.communityMediaId,
              sourceMediaId: img.sourceMediaId,
              image: img.image,
              prompt: img.prompt,
              model: img.model || '',
              mediaType: 'image' as const,
              userAvatar: img.userAvatar || '/images/default-avatar.svg',
              userNickname: img.userNickname || '',
              avatarFrameId: img.avatarFrameId || null,
            }))
            
            // 如果数据库中的图片少于目标数量，用默认图片补足
            if (dbImages.length < COMMUNITY_SHOWCASE_LIMIT) {
              const defaultImages = community.map((work: any) => ({
                ...work,
                model: '默认',
                userAvatar: '/images/default-avatar.svg',
                userNickname: '默认',
                avatarFrameId: null,
              }))
              
              // 合并数据库图片和默认图片，优先显示数据库图片
              // 使用 'default-' 前缀确保默认图片的ID不会与数据库图片ID冲突
              const fillImages = defaultImages
                .slice(0, COMMUNITY_SHOWCASE_LIMIT - dbImages.length)
                .map((work: any, index: number) => ({
                  ...work,
                  id: `default-${work.id}-${index}`, // 确保ID唯一
                  model: '默认',
                  mediaType: 'image' as const,
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
            setCommunityWorks(community.map((work: any) => ({
              ...work,
              model: '默认',
              userAvatar: '/images/default-avatar.svg',
              userNickname: '默认',
              avatarFrameId: null,
            })).slice(0, COMMUNITY_SHOWCASE_LIMIT))
          }
        } else {
          // 请求失败，使用默认图片（添加默认头像信息）
          setCommunityWorks(community.map((work: any) => ({
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
        setCommunityWorks(community.map((work: any) => ({
          ...work,
          model: '默认',
          userAvatar: '/images/default-avatar.svg',
          userNickname: '默认',
          avatarFrameId: null,
        })).slice(0, COMMUNITY_SHOWCASE_LIMIT))
      }
    }

    fetchCommunityImages()
  }, [])

  const navigateToCreate = (work: CommunityWork) => {
    const params = buildCreatePromptParams({
      communityMediaId: work.communityMediaId,
      prompt: work.prompt,
      model: work.model,
      mediaType: work.mediaType || (work.video ? 'video' : 'image'),
    })
    const query = params.toString()
    router.push(transferUrl(`/create${query ? `?${query}` : ''}`))
  }

  const handleGenerateSame = (work: CommunityWork) => {
    navigateToCreate(work)
  };

  const handleContactClick = () => {
    document.getElementById('community-showcase')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gray-950">
      <div className="fixed inset-0 z-0 bg-white">
        <div className="absolute inset-0 bg-[url('/images/bg.png')] bg-cover bg-center bg-no-repeat opacity-40" />
      </div>

      {/* 图片放大模态框 - 改进响应式设计 */}
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
                e.stopPropagation();
                setZoomedImage(null);
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

      {/* 主要内容区域 - 使用 Tailwind CSS 控制布局 */}
      <main 
        className="relative z-10 transition-all duration-300 mx-auto lg:pl-40 pt-24 lg:pt-0 pt-4"
      >
        {/* Hero Section - 改进响应式设计 */}
        <section className="relative min-h-screen flex items-center justify-center px-5 sm:px-8 lg:px-40 overflow-hidden lg:pt-24">
          <div className="w-full max-w-[1400px] mx-auto relative px-6 sm:px-8 z-10 rounded-[2rem] border border-white/70 bg-white/40 backdrop-blur-sm py-8 sm:py-10 lg:py-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-6 xl:gap-8 items-center">
              {/* 左侧文字内容 - 改进移动端间距 */}
              <div className="text-left">
                <div className="flex items-center gap-5 mb-8 sm:mb-12 animate-fadeInUp hidden md:flex">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-orange-400 to-amber-400 rounded-2xl blur-xl opacity-50 animate-pulse"></div>
                    <Image
                      src="/images/dreamifly-logo.jpg"
                      alt="Dreamifly Logo"
                      width={68}
                      height={68}
                      className="rounded-2xl shadow-xl border border-orange-400/30 relative z-10"
                      priority={true}
                    />
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 bg-clip-text text-transparent">
                      {t('hero.siteName')}
                    </h2>
                    <p className="text-sm text-gray-700 mt-1">
                      {t('hero.description')}
                    </p>
                  </div>
                </div>
                <h1 className="mb-7 sm:mb-9 md:mt-0 mt-0">
                  <span className="block text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-2 sm:mb-3 animate-fadeInUp">
                    {t('hero.titlePrefix')}
                  </span>
                  <span className="block text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent animate-fadeInUp animation-delay-200">
                    {t('hero.titleHighlight')}
                  </span>
                </h1>
                <div className="flex flex-row flex-nowrap justify-center sm:justify-start gap-3 sm:gap-4 animate-fadeInUp animation-delay-500">
                  <button
                    onClick={() => {
                      const aiPlazaSection = document.getElementById('ai-plaza')
                      if (aiPlazaSection) {
                        aiPlazaSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }
                    }}
                    className="group whitespace-nowrap px-7 py-3 sm:px-9 sm:py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl hover:from-orange-400 hover:to-amber-400 transition-all duration-300 shadow-xl shadow-orange-500/20 hover:shadow-2xl hover:shadow-orange-500/30 hover:-translate-y-0.5 text-base sm:text-base font-medium relative overflow-hidden"
                  >
                    <span className="relative z-10">{t('hero.startButton')}</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-orange-400 to-amber-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </button>
                  <button
                    onClick={handleContactClick}
                    className="group whitespace-nowrap px-7 py-3 sm:px-9 sm:py-3.5 border-2 border-orange-500 text-orange-600 rounded-2xl hover:bg-gradient-to-r hover:from-orange-500/10 hover:to-amber-500/10 transition-all duration-300 text-base sm:text-base font-medium relative overflow-hidden"
                  >
                    <span className="relative z-10">{t('hero.contactButton')}</span>
                    <div className="absolute inset-0 bg-orange-400/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </button>
                </div>
              </div>

              {/* 右侧视频展示 */}
              <div className="relative flex justify-end">
                <div className="relative w-full max-w-[350px] lg:max-w-[400px] xl:max-w-[450px]">
                  <div className="relative aspect-square rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl sm:shadow-2xl bg-white/50 border border-orange-400/30 backdrop-blur-sm transform hover:scale-[1.02] transition-transform duration-500">
                    {showcaseItems.map((item, index) => (
                      <div
                        key={item.src}
                        className={`absolute inset-0 transition-opacity duration-500 ${
                          currentShowcaseIndex === index
                            ? 'opacity-100 pointer-events-auto'
                            : 'opacity-0 pointer-events-none'
                        }`}
                        aria-hidden={currentShowcaseIndex !== index}
                      >
                        {item.type === 'video' ? (
                          <video
                            className="h-full w-full object-cover"
                            autoPlay
                            muted
                            loop
                            playsInline
                            preload="metadata"
                            poster={item.poster}
                          >
                            <source src={item.src} type="video/mp4" />
                          </video>
                        ) : (
                          <Image
                            src={item.src}
                            alt={`AI生成示例 ${index + 1}`}
                            fill
                            className="object-cover"
                            priority={index === 0}
                            sizes="(max-width: 768px) 350px, (max-width: 1024px) 400px, 450px"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="absolute -bottom-8 sm:-bottom-10 left-1/2 transform -translate-x-1/2">
                    <div className="flex items-center gap-2 sm:gap-3 bg-white/80 backdrop-blur-md px-4 sm:px-5 py-2.5 sm:py-3 rounded-full shadow-2xl border border-orange-400/20">
                      {showcaseItems.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => handleShowcaseChange(index)}
                          className={`relative transition-all duration-300 ease-out group w-10 h-1.5 overflow-hidden`}
                          aria-label={`切换到展示内容 ${index + 1}`}
                        >
                          <span className="absolute inset-0 rounded-full bg-slate-700/50" />
                          <span className={`absolute inset-0 transition-all duration-500 ${
                            currentShowcaseIndex === index
                              ? 'bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 shadow-lg shadow-orange-400/50'
                              : 'bg-orange-400/40 hover:bg-orange-400/60'
                          }`} />
                          {currentShowcaseIndex === index && (
                            <span className="absolute inset-0 bg-orange-400 animate-ping opacity-20" />
                          )}
                          <span className={`absolute -inset-1 rounded-full bg-gradient-to-r from-orange-300 to-amber-300 opacity-0 group-hover:opacity-30 blur-sm transition-opacity duration-300 ${
                            currentShowcaseIndex === index ? 'opacity-40' : ''
                          }`} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* AI Plaza Section - 统一的AI广场 */}
        <section id="ai-plaza" className="py-14 sm:py-20 px-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 relative overflow-hidden">
          <div className="w-full max-w-[1260px] mx-auto relative z-10 px-4 sm:px-6">
            <div className="text-center mb-12">
              <div className="flex items-center justify-center gap-5 mb-7">
                <svg className="w-10 h-10" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" fill="#FED7AA">
                  <path d="M383.87078 596.712739A85.244128 85.244128 0 0 1 299.138628 682.682168 85.07347 85.07347 0 0 1 213.339858 598.035346a85.286793 85.286793 0 1 1 170.530922-1.279942zM342.144675 426.693794a85.329458 85.329458 0 0 1-1.322607-170.573586A84.98814 84.98814 0 0 1 426.663503 340.639036 85.201464 85.201464 0 0 1 342.144675 426.693794zM682.651877 255.394907A85.500117 85.500117 0 0 1 597.96239 341.364336 85.201464 85.201464 0 0 1 511.992961 256.760179a85.158799 85.158799 0 0 1 84.689487-85.969429c46.973867-0.255988 85.542782 37.544961 85.969429 84.604157zM170.675129 931.502868c195.703112 16.212597 125.604962-191.649963 306.674072-193.569876l78.417772 65.40503c19.540446 236.234604-269.427763 288.968209-385.091844 128.164846z m600.079413-303.559547c60.882568-95.526328 249.46067-415.895778 249.460671-415.895778 15.017985-26.537461-18.345833-54.3122-41.598111-34.686425 0 0-280.435264 243.786261-363.119508 321.052086-65.40503 61.095892-65.661018 88.998625-86.822724 189.730049l71.676745 59.730621c94.971687-39.038227 122.319778-44.371318 170.402927-119.930553zM232.240333 832.990008c-88.913295-77.649807-145.913373-191.137986-146.894662-317.724236-1.877248-235.082657 188.023461-427.927232 423.234112-429.80448 163.789895-0.895959 276.467444 81.233644 277.192744 147.022656l70.951444-62.077181C813.632595 75.563075 678.300075-2.172061 507.897147 0.046505 225.285982 2.393065-2.202353 233.251913 0.016213 515.948407a509.800847 509.800847 0 0 0 120.44253 325.702541c40.87281 21.033711 90.57722 14.079361 111.78159-8.66094z m545.980537-81.318973c45.181948 84.049516-57.640049 143.780137-151.246464 170.317598-12.970078 38.910233-34.217113 73.383334-58.621338 98.555524 224.203151-25.17219 386.627774-183.586329 267.337192-336.539382-19.625775 29.225339-38.270262 51.069681-57.46939 67.66626z" />
                </svg>
                <h2 className="text-2xl font-bold text-gray-900 animate-fadeInUp">AI 广场</h2>
              </div>
              <p className="text-lg text-gray-700 animate-fadeInUp animation-delay-200">探索可用的 AI 模型和工作流工具</p>
            </div>

            {isLoadingAIItems || (availableModels.length === 0 && availableWorkflows.length === 0) ? (
              <div className="flex justify-center items-center py-20">
                <div className="text-gray-500">加载中...</div>
              </div>
            ) : (
              <div className="space-y-12">
                {/* AI 生图模型 */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-5 flex items-center gap-2">
                    <span className="w-1 h-5 bg-orange-400 rounded-full inline-block"></span>
                    AI 生图模型
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                    {homepageImageModels.map((model, index) => (
                      <div key={`model-${model.id}`} className="animate-fadeInUp" style={{ animationDelay: `${index * 100}ms` }}>
                        <AIPlazaCard item={model} type="model" />
                      </div>
                    ))}
                  </div>
                </div>

                {availableVideoModels.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-700 mb-5 flex items-center gap-2">
                      <span className="w-1 h-5 bg-purple-400 rounded-full inline-block"></span>
                      AI 视频模型
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                      {availableVideoModels.map((videoModel, index) => {
                        const demo = VIDEO_MODEL_DEMOS[videoModel.id] || {
                          videoSrc: getHomepageAsset('/images/video-community/video-demo-11.mp4'),
                          videoFallbackSrc: '/images/video-community/video-demo-11.mp4',
                          thumbnailSrc: videoModel.homepageCover
                            ? getHomepageAsset(videoModel.homepageCover)
                            : getHomepageAsset(videoModel.image || '/images/video-community/video-demo-11.png'),
                          thumbnailFallbackSrc: videoModel.homepageCover || videoModel.image || '/images/video-community/video-demo-11.png',
                        }

                        return (
                          <div key={`video-model-${videoModel.id}`} className="animate-fadeInUp" style={{ animationDelay: `${index * 100}ms` }}>
                            <VideoToVideoPlazaCard
                              name={videoModel.name}
                              description={getVideoModelDescription(videoModel)}
                              videoSrc={demo.videoSrc}
                              videoFallbackSrc={demo.videoFallbackSrc}
                              thumbnailSrc={demo.thumbnailSrc}
                              thumbnailFallbackSrc={demo.thumbnailFallbackSrc}
                              modelId={videoModel.id}
                              tags={getVideoModelDisplayTags(videoModel).map(tag => tag.label)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Community Showcase Section - 优化社区入口引导 */}
        <section id="community-showcase" className="py-14 sm:py-20 px-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 relative overflow-hidden">
          <div className="w-full max-w-[1260px] mx-auto relative px-4 sm:px-6">
            {/* 头部区域：优化为三层结构 - 标题 | 数据 | 副标题 */}
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
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 animate-fadeInUp">{t('community.title')}</h2>
              </div>

              {/* Stats Section - 更紧凑的展示 */}
              <div className="mb-6">
                <SiteStats />
              </div>

              {/* 副标题 + 立即进入按钮 */}
              <div className="animate-fadeInUp animation-delay-200">
                <p className="text-base sm:text-lg text-gray-600 mb-5 max-w-2xl mx-auto">{t('community.subtitle')}</p>

                {/* 核心优化：显眼的完整社区入口 */}
                <Link
                  href={transferUrl('/community')}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-6 sm:px-8 py-3 sm:py-3.5 text-sm sm:text-base font-semibold text-white shadow-lg shadow-orange-500/25 transition-all duration-300 hover:shadow-orange-500/40 hover:scale-105 hover:from-orange-400 hover:to-amber-400 active:scale-95"
                >
                  <span>进入社区</span>
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* 微型社区展示 */}
            <div className="animate-fadeInUp animation-delay-300">
              <CommunityMasonry
                works={communityWorks}
                onGenerateSame={(work) => handleGenerateSame(work)}
                onPreview={(img) => setZoomedImage(img)}
                generateSameText={t('community.generateSame')}
              />
            </div>

          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq-section" className="py-14 sm:py-24 px-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 bg-gray-200/80 backdrop-blur-md relative">
            
          <div className="w-full max-w-[1260px] mx-auto relative px-4 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-5 items-start gap-8 lg:gap-0">
              {/* 左侧图片 */}
              <div className="relative lg:col-span-2">
                <div className="lg:sticky lg:top-24">
                  <div className="aspect-[4/5] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl sm:shadow-2xl bg-gray-200/50 border border-orange-400/30 max-w-[400px] lg:max-w-none mx-auto lg:mx-0">
                    <Image
                      src="/images/demo-12.png"
                      alt="FAQ illustration"
                      fill
                      className="object-cover rounded-2xl"
                      priority={false}
                    />
                  </div>
                </div>
              </div>

              {/* 间距列 */}
              <div className="hidden lg:block lg:col-span-1"></div>

              {/* 右侧FAQ内容 */}
              <div className="flex flex-col lg:col-span-2">
                <div className="flex items-center gap-5 mb-10">
                  <Image 
                    src="/common/faq.svg" 
                    alt="FAQ" 
                    width={40}
                    height={40}
                    className="w-10 h-10"
                    priority={false}
                  />
                  <h2 className="text-2xl font-bold text-gray-900">
                    {t('faq.title')}
                  </h2>
                </div>
                <div className="space-y-6 h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {faqQuestions.map((qa: FAQItem, index: number) => (
                    <div
                      key={index}
                      className="bg-gray-200/50 backdrop-blur-sm p-6 rounded-2xl border border-orange-400/30"
                    >
                      <h3 className="text-base font-semibold mb-4 text-gray-900">Q{index + 1}: {qa.q}</h3>
                      <p className="text-gray-700">{qa.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Friends Section - 友链区域 */}
        <section id="friends-section" className="py-14 sm:py-20 px-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 bg-gray-50/90 backdrop-blur-md relative">
            
          <div className="w-full max-w-[1260px] mx-auto relative px-4 sm:px-6">
            <div className="text-center mb-12 sm:mb-15">
                             <div className="flex items-center justify-center gap-5 mb-7">
                 <svg className="w-10 h-10 text-orange-300" fill="currentColor" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
                   <path d="M546.9184 665.4976a187.9552 187.9552 0 0 1-133.3248-55.1424 25.6 25.6 0 0 1 36.1984-36.1984 137.472 137.472 0 0 0 194.2016 0l186.1632-186.1632c53.5552-53.5552 53.5552-140.6464 0-194.2016s-140.6464-53.5552-194.2016 0L478.8736 350.8736a25.6 25.6 0 0 1-36.1984-36.1984l157.0816-157.0816c73.5232-73.5232 193.1264-73.5232 266.5984 0s73.5232 193.1264 0 266.5984l-186.1632 186.1632a187.9552 187.9552 0 0 1-133.3248 55.1424z" />
                   <path d="M239.7184 972.6976a187.9552 187.9552 0 0 1-133.3248-55.1424 188.672 188.672 0 0 1 0-266.5984l186.1632-186.1632a188.672 188.672 0 0 1 266.5984 0 25.6 25.6 0 0 1-36.1984 36.1984 137.472 137.472 0 0 0-194.2016 0l-186.1632 186.1632c-53.5552 53.5552-53.5552 140.6464 0 194.2016s140.6464 53.5552 194.2016 0l157.0816-157.0816a25.6 25.6 0 0 1 36.1984 36.1984l-157.0816 157.0816a187.9552 187.9552 0 0 1-133.3248 55.1424z" />
                 </svg>
                 <h2 className="text-2xl font-bold text-gray-900 animate-fadeInUp">{tFriends('title')}</h2>
               </div>
               <p className="text-lg text-gray-700 animate-fadeInUp animation-delay-200">{tFriends('subtitle')}</p>
               <p className="text-base text-gray-600 mt-4 animate-fadeInUp animation-delay-300">{tFriends('description')}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {/* LoongXia 友链 */}
              <div className="group animate-fadeInUp animation-delay-400">
                <Link
                  href="https://loongxia.cn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-gray-200/50 backdrop-blur-sm p-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 border border-orange-400/30 hover:border-orange-400/50"
                >
                                     <div className="flex items-center gap-4 mb-4">
                     <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden">
                       <Image
                         src="/images/LoongXia.jpg"
                         alt="LoongXia Logo"
                         width={48}
                         height={48}
                         className="w-full h-full object-cover"
                         priority={false}
                       />
                     </div>
                    <div>
                                             <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-800 transition-colors">{tFriends('loongxia.name')}</h3>
                       <p className="text-sm text-gray-600">{tFriends('loongxia.url')}</p>
                     </div>
                   </div>
                   <p className="text-gray-700 text-sm leading-relaxed">
                     {tFriends('loongxia.description')}
                   </p>
                   <div className="mt-4 flex items-center text-orange-700 text-sm group-hover:text-orange-600 transition-colors">
                     <span>{tFriends('visitSite')}</span>
                    <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                </Link>
              </div>

              {/* 曼波配音生成器 友链 */}
              <div className="group animate-fadeInUp animation-delay-500">
                <Link
                  href="https://tools.dayun.cool/manbo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-gray-200/50 backdrop-blur-sm p-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 border border-orange-400/30 hover:border-orange-400/50"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden">
                      <Image
                        src="/images/manbo.webp"
                        alt="曼波配音生成器 Logo"
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                        priority={false}
                      />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-800 transition-colors">{tFriends('manbo.name')}</h3>
                      <p className="text-sm text-gray-600">{tFriends('manbo.url')}</p>
                    </div>
                  </div>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    {tFriends('manbo.description')}
                  </p>
                  <div className="mt-4 flex items-center text-orange-700 text-sm group-hover:text-orange-600 transition-colors">
                    <span>{tFriends('visitSite')}</span>
                    <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                </Link>
              </div>

              {/* AI空间站 友链 */}
              <div className="group animate-fadeInUp animation-delay-600">
                <Link
                  href="https://ai-kjz.cn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-gray-200/50 backdrop-blur-sm p-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 border border-orange-400/30 hover:border-orange-400/50"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-gradient-to-br from-orange-100 to-amber-50">
                      <svg className="w-7 h-7 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-800 transition-colors">{tFriends('aikjz.name')}</h3>
                      <p className="text-sm text-gray-600">{tFriends('aikjz.url')}</p>
                    </div>
                  </div>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    {tFriends('aikjz.description')}
                  </p>
                  <div className="mt-4 flex items-center text-orange-700 text-sm group-hover:text-orange-600 transition-colors">
                    <span>{tFriends('visitSite')}</span>
                    <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Footer Section - 改进响应式设计 */}
        <section className="py-12 sm:py-18 px-5 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 bg-gradient-to-br from-gray-50/80 via-gray-100/80 to-gray-50/80 backdrop-blur-md relative">
            
          <div className="w-full max-w-[1260px] mx-auto relative px-4 sm:px-6">
            <div className="text-center">
              <p className="text-gray-700 text-sm mb-6 animate-fadeInUp">
                {t('suanleme.title')}
              </p>
              <div className="flex justify-center items-center gap-10 animate-fadeInUp animation-delay-200">
                <Link
                  href="https://suanli.cn/"
                  target="_blank"
                  className="opacity-70 hover:opacity-100 transition-opacity transform hover:scale-105 duration-300"
                >
                  <Image
                    src="https://web-assets.suanli.cn/website/cdn/logo.png"
                    alt={t('suanleme.gongji')}
                    width={150}
                    height={25}
                    priority={false}
                  />
                </Link>
                <Link
                  href="https://suanleme.cn"
                  target="_blank"
                  className="opacity-70 hover:opacity-100 transition-opacity transform hover:scale-105 duration-300"
                >
                  <Image
                    src="https://suanleme.cn/logo.svg"
                    alt={t('suanleme.suanleme')}
                    width={120}
                    height={40}
                    className="h-10"
                    priority={false}
                  />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
