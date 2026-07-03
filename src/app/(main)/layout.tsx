import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { AvatarProvider } from '@/contexts/AvatarContext'
import { PointsProvider } from '@/contexts/PointsContext'
import VersionDisplay from '@/components/VersionDisplay'

export default function MainLayout({ children }: { children: React.ReactNode }) {
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
