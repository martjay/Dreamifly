import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { AvatarProvider } from '@/contexts/AvatarContext'
import { PointsProvider } from '@/contexts/PointsContext'
import VersionDisplay from '@/components/VersionDisplay'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { db } from '@/db'
import { user } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (session?.user) {
      const userId = session.user.id
      ;(async () => {
        try {
          await db
            .update(user)
            .set({
              lastLoginAt: sql`(now() at time zone 'UTC')`,
              updatedAt: sql`(now() at time zone 'UTC')`,
            })
            .where(eq(user.id, userId))
        } catch (error) {
          console.error('Failed to update last login time:', error)
        }
      })()
    }
  } catch (error) {
    console.error('Failed to get session for updating last login time:', error)
  }

  return (
    <PointsProvider>
      <AvatarProvider>
        <div className="min-h-screen flex flex-col">
          <Navbar />
          <main className="flex-grow">{children}</main>
          <Footer />
        </div>
        <VersionDisplay />
      </AvatarProvider>
    </PointsProvider>
  )
}
