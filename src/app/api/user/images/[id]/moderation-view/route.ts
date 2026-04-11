import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { db } from '@/db'
import { userGeneratedImages } from '@/db/schema'
import { auth } from '@/lib/auth'
import { grantMediaViewConsent, hasMediaViewConsent } from '@/utils/mediaViewConsent'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const rows = await db
      .select({
        id: userGeneratedImages.id,
        moderationLevel: userGeneratedImages.moderationLevel,
      })
      .from(userGeneratedImages)
      .where(
        and(
          eq(userGeneratedImages.id, id),
          eq(userGeneratedImages.userId, session.user.id)
        )
      )
      .limit(1)

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const media = rows[0]
    if (media.moderationLevel === 'high') {
      return NextResponse.json({ error: 'High risk media cannot be revealed' }, { status: 403 })
    }

    if (media.moderationLevel !== 'medium') {
      return NextResponse.json({ success: true, hasViewConsent: true })
    }

    const alreadyGranted = await hasMediaViewConsent(session.user.id, id)
    if (!alreadyGranted) {
      await grantMediaViewConsent(session.user.id, id)
    }

    return NextResponse.json({ success: true, hasViewConsent: true })
  } catch (error) {
    console.error('Error granting moderation view consent:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
