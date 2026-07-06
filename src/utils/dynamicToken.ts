import MD5 from 'crypto-js/md5'

const SERVER_TIME_OFFSET_TTL_MS = 30 * 1000

let serverTimeOffsetMs: number | null = null
let serverTimeOffsetFetchedAt = 0
let inflightTimeRequest: Promise<number> | null = null
let offsetVersion = 0

function formatTimeString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}${month}${day}${hour}${minute}`
}

async function fetchServerTimeOffset(version: number): Promise<number> {
  const response = await fetch('/api/time', {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch server time')
  }

  const data = await response.json()
  const receivedAt = Date.now()
  const serverTimestamp = Number(data.timestamp)

  if (!Number.isFinite(serverTimestamp)) {
    throw new Error('Invalid server time response')
  }

  const offset = serverTimestamp - receivedAt
  if (version === offsetVersion) {
    serverTimeOffsetMs = offset
    serverTimeOffsetFetchedAt = receivedAt
  }

  return offset
}

async function getServerTimeOffset(): Promise<number> {
  const now = Date.now()
  if (serverTimeOffsetMs !== null && now - serverTimeOffsetFetchedAt < SERVER_TIME_OFFSET_TTL_MS) {
    return serverTimeOffsetMs
  }

  if (!inflightTimeRequest) {
    const version = offsetVersion
    let request: Promise<number>
    request = fetchServerTimeOffset(version).finally(() => {
      if (inflightTimeRequest === request) {
        inflightTimeRequest = null
      }
    })
    inflightTimeRequest = request
  }

  return inflightTimeRequest
}

export function resetServerTimeOffset(): void {
  offsetVersion += 1
  serverTimeOffsetMs = null
  serverTimeOffsetFetchedAt = 0
  inflightTimeRequest = null
}

/**
 * 生成动态API token
 * 使用格式: MD5(NEXT_PUBLIC_API_KEY + YYYYMMDDHHmm)
 * @param serverTimeString 服务器时间字符串（格式：YYYYMMDDHHmm），如果未提供则使用本地时间（降级方案）
 * @returns 动态生成的token字符串
 */
export function generateDynamicToken(serverTimeString?: string): string {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY
  if (!apiKey) {
    throw new Error('NEXT_PUBLIC_API_KEY is not defined')
  }

  let salt: string
  
  if (serverTimeString) {
    // 使用服务器时间
    salt = serverTimeString
  } else {
    // 降级方案：使用本地时间（如果获取服务器时间失败）
    salt = formatTimeString(new Date())
  }
  
  // 生成MD5哈希: MD5(密钥 + 盐值)
  const token = MD5(apiKey + salt).toString()
  
  return token
}

/**
 * 获取服务器时间并生成动态token
 * @returns 动态生成的token字符串
 */
export async function generateDynamicTokenWithServerTime(): Promise<string> {
  try {
    const offset = await getServerTimeOffset()
    const serverTime = new Date(Date.now() + offset)
    return generateDynamicToken(formatTimeString(serverTime))
  } catch (error) {
    console.warn('Failed to fetch server time, using local time as fallback:', error)
    // 降级方案：如果获取服务器时间失败，使用本地时间
    return generateDynamicToken()
  }
}

