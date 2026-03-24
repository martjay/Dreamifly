import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '@/app/globals.css'
import { siteStrings } from '@/lib/strings'

const inter = Inter({ subsets: ['latin'] })

const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://dreamifly.com'
const twitterSite = process.env.NEXT_PUBLIC_TWITTER_SITE || '@Last_Lighter'

export const metadata: Metadata = {
  title: siteStrings.title,
  description: siteStrings.description,
  openGraph: {
    title: siteStrings.title,
    description: siteStrings.description,
    url: siteUrl,
    images: [
      {
        url: `${siteUrl}/images/dreamifly-logo.jpg`,
        width: 600,
        height: 600,
        alt: 'Dreamifly Logo',
      },
    ],
    type: 'website',
    locale: 'zh_CN',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteStrings.title,
    description: siteStrings.description,
    images: [`${siteUrl}/images/dreamifly-logo.jpg`],
    site: twitterSite,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="google-site-verification" content="F_mzKY9JDvflHFEEsBGIiItkpIhVwc0sBPqo_UI5VtQ" />
        <meta name="baidu-site-verification" content="codeva-KBWW4lhtr9" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
