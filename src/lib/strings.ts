import zh from '@/messages/zh.json'

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc && typeof acc === 'object' && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

export function t(path: string, params?: Record<string, string | number>): string {
  const value = getByPath(zh, path)
  if (typeof value !== 'string') {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[strings] missing or non-string: ${path}`)
    }
    return path
  }
  if (!params) return value
  return Object.entries(params).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    value
  )
}

export function createScopedT(namespace: string) {
  return (key: string, params?: Record<string, string | number>) =>
    t(`${namespace}.${key}`, params)
}

export function msg<T = unknown>(path: string): T {
  return getByPath(zh, path) as T
}

export const siteStrings = zh.site
