'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type DropdownModelOption = {
  id: string
  name: string
  image?: string
  imageFallback?: string
  description?: string
  tags?: string[]
  isRecommended?: boolean
  isAvailable?: boolean
}

type ModelDropdownProps<T extends DropdownModelOption> = {
  value: string
  models: T[]
  loading?: boolean
  disabled?: boolean
  loadingText: string
  emptyText: string
  fallbackImage: string
  onChange: (value: string) => void
  canSelect?: (model: T) => boolean
  getDescription?: (model: T) => string
  getUnavailableText?: (model: T) => string | null
  renderTags?: (model: T) => ReactNode
  onFirstOpen?: (models: T[]) => void
}

export default function ModelDropdown<T extends DropdownModelOption>({
  value,
  models,
  loading = false,
  disabled = false,
  loadingText,
  emptyText,
  fallbackImage,
  onChange,
  canSelect = (model) => model.isAvailable !== false,
  getDescription = (model) => model.description || '',
  getUnavailableText = () => null,
  renderTags,
  onFirstOpen,
}: ModelDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedModel = models.find(model => model.id === value)
  const selectedImage = selectedModel?.image || fallbackImage
  const selectedImageFallback = selectedModel?.imageFallback || fallbackImage
  const selectedDisabled = Boolean(selectedModel && !canSelect(selectedModel))

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleToggle = () => {
    if (disabled) return
    if (!hasOpened) {
      setHasOpened(true)
      onFirstOpen?.(models)
    }
    setIsOpen(prev => !prev)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        className={`w-full bg-white/50 backdrop-blur-sm border border-orange-400/40 rounded-xl px-4 py-2.5 text-left text-gray-900 focus:ring-2 focus:ring-orange-400/50 focus:border-orange-400/50 shadow-inner transition-all duration-300 flex items-center justify-between ${
          disabled || selectedDisabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        disabled={disabled}
      >
        <div className="flex min-w-0 items-center space-x-3">
          <div className="w-10 h-6 rounded overflow-hidden flex-shrink-0 bg-gray-100">
            <img
              src={selectedImage}
              alt={selectedModel?.name || value}
              className="w-full h-full object-cover"
              onError={(event) => {
                const target = event.target as HTMLImageElement
                if (target.getAttribute('src') !== selectedImageFallback) {
                  target.src = selectedImageFallback
                }
              }}
            />
          </div>
          <div className="min-w-0">
            <span className="block truncate text-sm font-medium">{selectedModel?.name || value}</span>
          </div>
        </div>
        <svg
          className={`w-4 h-4 flex-shrink-0 text-gray-600 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {hasOpened && (
        <div className={`absolute z-10 w-full sm:w-96 mt-2 bg-white/95 backdrop-blur-xl rounded-xl border border-orange-400/40 shadow-xl max-h-80 overflow-y-auto custom-scrollbar ${
          isOpen ? '' : 'hidden'
        }`}>
          {loading ? (
            <div className="px-4 py-4 text-center text-gray-600">{loadingText}</div>
          ) : models.length === 0 ? (
            <div className="px-4 py-4 text-center text-gray-600">{emptyText}</div>
          ) : (
            models.map((modelOption) => {
              const optionSelectable = canSelect(modelOption)
              const description = getDescription(modelOption)
              const unavailableText = optionSelectable ? null : getUnavailableText(modelOption)

              return (
                <button
                  key={modelOption.id}
                  type="button"
                  onClick={() => {
                    if (!optionSelectable || disabled) return
                    onChange(modelOption.id)
                    setIsOpen(false)
                  }}
                  disabled={!optionSelectable || disabled}
                  className={`w-full px-4 py-4 text-left transition-colors duration-200 flex flex-col space-y-3 ${
                    value === modelOption.id ? 'bg-white/50' : ''
                  } ${
                    optionSelectable
                      ? 'hover:bg-gray-200 hover:shadow-sm transition-all'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-24 h-12 rounded overflow-hidden flex-shrink-0 bg-gray-100">
                      <img
                        src={modelOption.image || fallbackImage}
                        alt={modelOption.name}
                        className="w-full h-full object-cover"
                        onError={(event) => {
                          const target = event.target as HTMLImageElement
                          const fallback = modelOption.imageFallback || fallbackImage
                          if (target.getAttribute('src') !== fallback) {
                            target.src = fallback
                          }
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-gray-900 font-medium">{modelOption.name}</div>
                        {modelOption.isRecommended && (
                          <span className="inline-flex flex-shrink-0 items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-orange-600/30 to-red-600/30 text-orange-900 border border-orange-500/40">
                            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 6 8 6c0 0 .5-.5 2-2.5C10.5.5 11 0 11 0c0 0 .5 0 1.5 1C14 2 16 3.75 17 6c1 0 1.657-.343 1.657-.343A8 8 0 0121 12c0 2.707-1.34 5.106-3.343 6.657z"></path>
                            </svg>
                            推荐
                          </span>
                        )}
                      </div>
                      {renderTags && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {renderTags(modelOption)}
                        </div>
                      )}
                    </div>
                  </div>
                  {description && (
                    <div className="text-sm text-gray-600/80 line-clamp-2 pl-27">
                      {description}
                    </div>
                  )}
                  {unavailableText && (
                    <div className="text-sm text-red-500 pl-27">
                      {unavailableText}
                    </div>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
