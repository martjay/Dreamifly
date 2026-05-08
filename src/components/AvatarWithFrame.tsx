'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

const avatarFrameUrlCache = new Map<number, string | null>()
const avatarFrameRequestCache = new Map<number, Promise<string | null>>()

async function getAvatarFrameUrl(avatarFrameId: number): Promise<string | null> {
  if (avatarFrameUrlCache.has(avatarFrameId)) {
    return avatarFrameUrlCache.get(avatarFrameId) ?? null
  }

  const cachedRequest = avatarFrameRequestCache.get(avatarFrameId)
  if (cachedRequest) {
    return cachedRequest
  }

  const request = fetch(`/api/avatar-frame?frameId=${avatarFrameId}`)
    .then(async (response) => {
      if (!response.ok) return null

      const data = await response.json()
      const frameUrl =
        typeof data.frameUrl === 'string' && data.frameUrl.trim() !== ''
          ? data.frameUrl
          : null

      avatarFrameUrlCache.set(avatarFrameId, frameUrl)
      return frameUrl
    })
    .catch((error) => {
      console.error('Error fetching avatar frame:', error)
      return null
    })
    .finally(() => {
      avatarFrameRequestCache.delete(avatarFrameId)
    })

  avatarFrameRequestCache.set(avatarFrameId, request)
  return request
}

interface AvatarWithFrameProps {
  avatar: string
  avatarFrameId?: number | null
  size?: number
  className?: string
  alt?: string
}

export default function AvatarWithFrame({
  avatar,
  avatarFrameId,
  size = 40,
  className = '',
  alt = 'Avatar'
}: AvatarWithFrameProps) {
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [hasFrame, setHasFrame] = useState<boolean>(false)

  useEffect(() => {
    let isCancelled = false

    const fetchFrame = async () => {
      if (avatarFrameId === null || avatarFrameId === undefined) {
        setFrameUrl(null)
        setHasFrame(false)
        return
      }

      const nextFrameUrl = await getAvatarFrameUrl(avatarFrameId)
      if (isCancelled) return

      setFrameUrl(nextFrameUrl)
      setHasFrame(Boolean(nextFrameUrl))
    }

    fetchFrame()

    return () => {
      isCancelled = true
    }
  }, [avatarFrameId])

  const borderClasses: string[] = []
  const otherClasses: string[] = []

  className.split(' ').forEach(cls => {
    if (
      cls.match(/^border(-\d+)?$/) ||
      cls.match(/^border-(orange|amber)-\d+/) ||
      cls.match(/^border-(orange|amber)-\d+\/[\d.]+$/)
    ) {
      borderClasses.push(cls)
    } else if (cls.trim()) {
      otherClasses.push(cls)
    }
  })

  const containerClassName = otherClasses.join(' ').trim()
  const avatarBorderClassName = borderClasses.join(' ').trim()

  if (!hasFrame) {
    return (
      <div className={containerClassName ? `inline-block ${containerClassName}` : 'inline-block'}>
        <Image
          src={avatar}
          alt={alt}
          width={size}
          height={size}
          className={`rounded-full object-cover ${avatarBorderClassName}`}
          unoptimized={avatar.startsWith('http')}
          onError={(e) => {
            const target = e.target as HTMLImageElement
            if (!target.src.includes('default-avatar.svg')) {
              target.src = '/images/default-avatar.svg'
            }
          }}
        />
      </div>
    )
  }

  return (
    <div
      className={containerClassName ? `relative inline-block ${containerClassName}` : 'relative inline-block'}
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <Image
          src={avatar}
          alt={alt}
          width={size * 0.85}
          height={size * 0.85}
          className="rounded-full object-cover"
          unoptimized={avatar.startsWith('http')}
          onError={(e) => {
            const target = e.target as HTMLImageElement
            if (!target.src.includes('default-avatar.svg')) {
              target.src = '/images/default-avatar.svg'
            }
          }}
        />
      </div>

      {frameUrl && (
        <Image
          src={frameUrl}
          alt="Avatar Frame"
          width={size}
          height={size}
          className="absolute inset-0 object-contain pointer-events-none"
          unoptimized={frameUrl.startsWith('http')}
          onError={() => {
            setFrameUrl(null)
            setHasFrame(false)
          }}
        />
      )}
    </div>
  )
}
