'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const KEY_SEPARATOR = '\u001f'
const DEFAULT_ROOT_MARGIN = '360px 0px'

export function useVisibleMediaKeys(keys: string[], rootMargin = DEFAULT_ROOT_MARGIN) {
  const elementMapRef = useRef(new Map<string, HTMLElement>())
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const keySignature = keys.filter(Boolean).join(KEY_SEPARATOR)

  const registerElement = useCallback(
    (key: string) => (element: HTMLElement | null) => {
      if (!key) return

      if (element) {
        element.dataset.mediaVisibilityKey = key
        elementMapRef.current.set(key, element)
      } else {
        elementMapRef.current.delete(key)
      }
    },
    []
  )

  useEffect(() => {
    const currentKeys = Array.from(
      new Set(keySignature ? keySignature.split(KEY_SEPARATOR).filter(Boolean) : [])
    )
    const currentKeySet = new Set(currentKeys)

    setVisibleKeys((prev) => {
      const next = new Set<string>()
      prev.forEach((key) => {
        if (currentKeySet.has(key)) next.add(key)
      })
      return next.size === prev.size ? prev : next
    })

    if (currentKeys.length === 0) return

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setVisibleKeys(new Set(currentKeys))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleKeys((prev) => {
          let changed = false
          const next = new Set(prev)

          entries.forEach((entry) => {
            if (!entry.isIntersecting && entry.intersectionRatio <= 0) return

            const key = (entry.target as HTMLElement).dataset.mediaVisibilityKey
            if (!key) return

            if (!next.has(key)) {
              next.add(key)
              changed = true
            }
            observer.unobserve(entry.target)
          })

          return changed ? next : prev
        })
      },
      { rootMargin, threshold: 0.01 }
    )

    elementMapRef.current.forEach((element, key) => {
      if (currentKeySet.has(key)) {
        observer.observe(element)
      }
    })

    return () => observer.disconnect()
  }, [keySignature, rootMargin])

  return { visibleKeys, registerElement }
}
