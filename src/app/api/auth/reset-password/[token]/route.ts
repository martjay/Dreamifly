import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  let callbackURL = request.nextUrl.searchParams.get('callbackURL') || '/reset-password'

  if (!callbackURL.startsWith('/')) {
    callbackURL = `/${callbackURL}`
  }

  const host =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://dreamifly.com').host

  const protocol =
    request.headers.get('x-forwarded-proto') || (request.url.startsWith('https') ? 'https' : 'http')

  const baseURL = `${protocol}://${host}`
  const redirectURL = new URL(callbackURL, baseURL)
  redirectURL.searchParams.set('token', token)

  return NextResponse.redirect(redirectURL)
}
