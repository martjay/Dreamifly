'use client'

import { useEffect, useRef, useState } from 'react'

interface ModerationMosaicPreviewProps {
  src: string
  alt: string
  className?: string
  tileCount?: number
}

export default function ModerationMosaicPreview({
  src,
  alt,
  className = '',
  tileCount = 18,
}: ModerationMosaicPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [imageReady, setImageReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !src) {
      return
    }

    setImageReady(false)

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const image = new window.Image()
    image.decoding = 'async'

    image.onload = () => {
      const width = canvas.clientWidth || canvas.offsetWidth
      const height = canvas.clientHeight || canvas.offsetHeight

      if (!width || !height) {
        return
      }

      canvas.width = width
      canvas.height = height

      context.clearRect(0, 0, width, height)

      const scale = Math.min(width / image.width, height / image.height)
      const drawWidth = image.width * scale
      const drawHeight = image.height * scale
      const offsetX = (width - drawWidth) / 2
      const offsetY = (height - drawHeight) / 2

      const shortSide = Math.max(8, Math.min(tileCount, Math.round(Math.min(drawWidth, drawHeight) / 16)))
      const sampleWidth = Math.max(10, Math.round((drawWidth / drawHeight) * shortSide))
      const sampleHeight = Math.max(10, Math.round((drawHeight / drawWidth) * shortSide))

      const offscreen = document.createElement('canvas')
      offscreen.width = sampleWidth
      offscreen.height = sampleHeight

      const offscreenContext = offscreen.getContext('2d')
      if (!offscreenContext) {
        return
      }

      offscreenContext.imageSmoothingEnabled = true
      offscreenContext.filter = 'blur(0.6px) saturate(0.9) brightness(0.9)'
      offscreenContext.drawImage(image, 0, 0, sampleWidth, sampleHeight)

      context.imageSmoothingEnabled = false
      context.drawImage(offscreen, offsetX, offsetY, drawWidth, drawHeight)

      context.fillStyle = 'rgba(15, 23, 42, 0.16)'
      context.fillRect(offsetX, offsetY, drawWidth, drawHeight)

      for (let x = offsetX; x < offsetX + drawWidth; x += drawWidth / sampleWidth) {
        context.fillStyle = 'rgba(255, 255, 255, 0.05)'
        context.fillRect(x, offsetY, 1, drawHeight)
      }

      for (let y = offsetY; y < offsetY + drawHeight; y += drawHeight / sampleHeight) {
        context.fillStyle = 'rgba(15, 23, 42, 0.06)'
        context.fillRect(offsetX, y, drawWidth, 1)
      }

      setImageReady(true)
    }

    image.onerror = () => {
      setImageReady(false)
    }

    image.src = src
  }, [src, tileCount])

  return (
    <div className={`relative w-full h-full ${className}`}>
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 w-full h-full object-contain opacity-0 pointer-events-none"
        aria-hidden="true"
      />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full ${imageReady ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
        aria-label={alt}
      />
      {!imageReady && (
        <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-sm" />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(15,23,42,0.16)_100%)]" />
    </div>
  )
}
