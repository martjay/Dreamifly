export type NormalizedModelUsageError = {
  errorCode: string
  errorStage: string
  errorStatusCode: number | null
  errorMessage: string
  errorDetail: string | null
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause as { message?: string; code?: string } | undefined
    return [error.message, cause?.message, cause?.code].filter(Boolean).join(' ')
  }

  if (typeof error === 'string') return error

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function extractStatusCode(text: string): number | null {
  const match = text.match(/(?:\(|\b)([1-5]\d{2})(?:\)|\b)/)
  if (!match) return null

  const statusCode = Number(match[1])
  return Number.isFinite(statusCode) ? statusCode : null
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

export function normalizeModelUsageError(error: unknown, fallbackStage = 'generation'): NormalizedModelUsageError {
  const detail = truncate(getErrorText(error).replace(/\s+/g, ' ').trim(), 1000)
  const lowerDetail = detail.toLowerCase()
  let statusCode = extractStatusCode(detail)
  let errorCode = 'model_generation_failed'
  let errorStage = fallbackStage
  let errorMessage = '模型生成失败'

  if (
    lowerDetail.includes('no healthy upstream') ||
    lowerDetail.includes('service unavailable') ||
    lowerDetail.includes('服务不可用')
  ) {
    statusCode = statusCode ?? 503
    errorCode = 'upstream_unavailable'
    errorStage = 'request'
    errorMessage = '上游服务不可用'
  } else if (
    lowerDetail.includes('headers timeout') ||
    lowerDetail.includes('timeout') ||
    lowerDetail.includes('timed out') ||
    lowerDetail.includes('aborterror')
  ) {
    statusCode = statusCode ?? 504
    errorCode = 'upstream_timeout'
    errorStage = 'request'
    errorMessage = '上游服务响应超时'
  } else if (
    lowerDetail.includes('fetch failed') ||
    lowerDetail.includes('econnreset') ||
    lowerDetail.includes('econnrefused') ||
    lowerDetail.includes('und_err_connect_timeout') ||
    lowerDetail.includes('无法连接')
  ) {
    statusCode = statusCode ?? 503
    errorCode = 'upstream_connection_failed'
    errorStage = 'request'
    errorMessage = '无法连接上游服务'
  } else if (lowerDetail.includes('缺少images数据') || lowerDetail.includes('missing image data')) {
    errorCode = 'empty_result'
    errorStage = 'response_parse'
    errorMessage = '上游服务未返回图片'
  } else if (lowerDetail.includes('无法解析') || lowerDetail.includes('invalid response')) {
    errorCode = 'response_parse_failed'
    errorStage = 'response_parse'
    errorMessage = '上游服务返回内容解析失败'
  } else if (statusCode === 404) {
    errorCode = 'upstream_endpoint_not_found'
    errorStage = 'request'
    errorMessage = '上游服务地址不存在'
  } else if (statusCode === 429) {
    errorCode = 'upstream_rate_limited'
    errorStage = 'request'
    errorMessage = '上游服务请求过多或限流'
  } else if (statusCode === 401 || statusCode === 403) {
    errorCode = 'upstream_auth_failed'
    errorStage = 'request'
    errorMessage = '上游服务鉴权失败'
  } else if (statusCode === 400) {
    errorCode = 'upstream_bad_request'
    errorStage = 'request'
    errorMessage = '上游服务拒绝了请求参数'
  } else if (statusCode && statusCode >= 500) {
    errorCode = 'upstream_server_error'
    errorStage = 'request'
    errorMessage = '上游服务内部错误'
  }

  return {
    errorCode,
    errorStage,
    errorStatusCode: statusCode,
    errorMessage,
    errorDetail: detail || null,
  }
}
