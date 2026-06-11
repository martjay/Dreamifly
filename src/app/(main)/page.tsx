import { Suspense } from 'react'
import HomeClient from './HomeClient'
import type { Metadata } from 'next'
import { siteStrings } from '@/lib/strings'

export const metadata: Metadata = {
  title: siteStrings.title,
  description: siteStrings.description,
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeClient />
    </Suspense>
  )
}
