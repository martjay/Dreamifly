import { randomUUID } from 'crypto'
import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db'
import { mediaViewConsent } from '@/db/schema'

export async function getMediaViewConsentMap(userId: string, imageIds: string[]): Promise<Record<string, boolean>> {
  if (imageIds.length === 0) return {}

  const rows = await db
    .select({ imageId: mediaViewConsent.imageId })
    .from(mediaViewConsent)
    .where(
      and(
        eq(mediaViewConsent.userId, userId),
        inArray(mediaViewConsent.imageId, imageIds)
      )
    )

  return rows.reduce<Record<string, boolean>>((acc, row) => {
    acc[row.imageId] = true
    return acc
  }, {})
}

export async function hasMediaViewConsent(userId: string, imageId: string): Promise<boolean> {
  const rows = await db
    .select({ id: mediaViewConsent.id })
    .from(mediaViewConsent)
    .where(
      and(
        eq(mediaViewConsent.userId, userId),
        eq(mediaViewConsent.imageId, imageId)
      )
    )
    .limit(1)

  return rows.length > 0
}

export async function grantMediaViewConsent(userId: string, imageId: string): Promise<void> {
  const exists = await hasMediaViewConsent(userId, imageId)
  if (exists) return

  await db.insert(mediaViewConsent).values({
    id: randomUUID(),
    userId,
    imageId,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}
