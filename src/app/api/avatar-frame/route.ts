import { NextRequest, NextResponse } from 'next/server'
import { getUserAvatarFrame } from '@/utils/avatarFrame'

const AVATAR_FRAME_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
}

export async function GET(request: NextRequest) {
  try {
    const frameIdParam = request.nextUrl.searchParams.get('frameId')

    if (!frameIdParam) {
      return NextResponse.json({ frameUrl: null }, { headers: AVATAR_FRAME_CACHE_HEADERS })
    }

    const frameId = parseInt(frameIdParam, 10)

    if (Number.isNaN(frameId)) {
      return NextResponse.json({ frameUrl: null }, { headers: AVATAR_FRAME_CACHE_HEADERS })
    }

    const frameUrl = await getUserAvatarFrame(frameId)
    return NextResponse.json({ frameUrl }, { headers: AVATAR_FRAME_CACHE_HEADERS })
  } catch (error) {
    console.error('Error in avatar-frame API:', error)
    return NextResponse.json({ frameUrl: null }, { headers: AVATAR_FRAME_CACHE_HEADERS })
  }
}
