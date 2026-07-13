import MD5 from 'crypto-js/md5'

const SERVER_TIME_STRING_TTL_MS = 30 * 1000

let cachedServerTimeString: string | null = null
let serverTimeStringFetchedAt = 0
let inflightTimeRequest: Promise<string> | null = null
let timeStringVersion = 0

function formatTimeString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}${month}${day}${hour}${minute}`
}

async function fetchServerTimeString(version: number): Promise<string> {
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
  const serverTimeString = data.timeString

  if (typeof serverTimeString !== 'string' || !/^\d{12}$/.test(serverTimeString)) {
    throw new Error('Invalid server time response')
  }

  if (version === timeStringVersion) {
    cachedServerTimeString = serverTimeString
    serverTimeStringFetchedAt = receivedAt
  }

  return serverTimeString
}

async function getServerTimeString(): Promise<string> {
  const now = Date.now()
  if (cachedServerTimeString !== null && now - serverTimeStringFetchedAt < SERVER_TIME_STRING_TTL_MS) {
    return cachedServerTimeString
  }

  if (!inflightTimeRequest) {
    const version = timeStringVersion
    const request = fetchServerTimeString(version)
    const trackedRequest = request.finally(() => {
      if (inflightTimeRequest === trackedRequest) {
        inflightTimeRequest = null
      }
    })
    inflightTimeRequest = trackedRequest
  }

  return inflightTimeRequest
}

export function resetServerTimeOffset(): void {
  timeStringVersion += 1
  cachedServerTimeString = null
  serverTimeStringFetchedAt = 0
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
    const serverTimeString = await getServerTimeString()
    return generateDynamicToken(serverTimeString)
  } catch (error) {
    console.warn('Failed to fetch server time, using local time as fallback:', error)
    // 降级方案：如果获取服务器时间失败，使用本地时间
    return generateDynamicToken()
  }
}

