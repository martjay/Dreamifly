export function getClientIP(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  const cfConnectingIP = request.headers.get('cf-connecting-ip')

  let ip: string | null = null

  if (forwarded) {
    ip = forwarded.split(',')[0].trim()
  } else if (realIP) {
    ip = realIP.trim()
  } else if (cfConnectingIP) {
    ip = cfConnectingIP.trim()
  }

  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1'
  }

  if (ip && ip.startsWith('::ffff:')) {
    ip = ip.substring(7)
  }

  return ip
}
