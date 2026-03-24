'use client'


import { createScopedT } from '@/lib/strings'
export default function Footer() {
  const t = createScopedT('footer')
  const webVersion = process.env.NEXT_PUBLIC_NEXT_PUBLIC_WEB_VERSION || ''

  return (
    <footer className="bg-gray-100/80 backdrop-blur-md border-t border-orange-400/20">
      <div className="container mx-auto px-8 py-6">
        <div className="text-center text-gray-700">
          {webVersion && <p className="mb-2">{webVersion}</p>}
          <p>{t('copyright')}</p>
          <p className="mt-2">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              京ICP备2023013220号-40
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
} 