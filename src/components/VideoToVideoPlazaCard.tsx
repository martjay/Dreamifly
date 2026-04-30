'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { transferUrl } from '@/utils/locale'

interface VideoToVideoPlazaCardProps {
  name: string
  description?: string
  videoSrc: string
  thumbnailSrc: string
  modelId?: string
  tags?: string[]
}

function getTagClassName(tag: string, index: number): string {
  if (tag === '支持音频') return 'bg-emerald-100 text-emerald-700'
  if (tag === '支持中文') return 'bg-pink-100 text-pink-700'
  return index === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'
}

export default function VideoToVideoPlazaCard({
  name,
  videoSrc,
  thumbnailSrc,
  modelId = 'Wan2.2-I2V-Lightning',
  tags = ['图生视频', '支持中文'],
}: VideoToVideoPlazaCardProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // 组件挂载时自动播放视频
  useEffect(() => {
    if (videoRef.current && isVideoLoaded) {
      videoRef.current.play().catch(() => {
        // 静音播放失败时不处理
      })
    }
  }, [isVideoLoaded])

  return (
    <div className="relative group">
      <Link
        href={transferUrl(`/create?tab=video&model=${encodeURIComponent(modelId)}`)}
        className="block"
      >
        {/* 视频卡片 */}
        <div className="relative aspect-square rounded-2xl overflow-hidden shadow-xl border border-orange-400/30 mb-3">
          <div className="relative w-full h-full group-hover:scale-110 transition-transform duration-700 ease-out">
            {/* 视频元素 */}
            <video
              ref={videoRef}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                isVideoLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              src={videoSrc}
              muted
              loop
              autoPlay
              playsInline
              preload="auto"
              onLoadedData={() => setIsVideoLoaded(true)}
            />

            {/* 缩略图作为加载占位符 */}
            {!isVideoLoaded && (
              <div className="absolute inset-0 bg-gray-200 animate-pulse">
                <img
                  src={thumbnailSrc}
                  alt={name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

          </div>

        </div>

        {/* 底部标题区域 */}
        <div className="px-1">
          {/* 特征标签 - 位于标题上方 */}
          <div className="flex gap-1 flex-wrap mb-1.5">
            {tags.map((tag, index) => (
              <span
                key={tag}
                className={`px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium rounded whitespace-nowrap ${getTagClassName(tag, index)}`}
              >
                {tag}
              </span>
            ))}
          </div>
          <h3 className="text-base font-semibold text-gray-900 line-clamp-1">
            {name}
          </h3>
        </div>
      </Link>
    </div>
  )
}
