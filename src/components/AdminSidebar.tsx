'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { transferUrl } from '@/utils/locale'
import Image from 'next/image'
import { ComponentType, useState } from 'react'
import { BellRing } from 'lucide-react'

type IconProps = {
  className?: string
}

type NavItem = {
  label: string
  href: string
  icon: ComponentType<IconProps>
}

type NavGroup = {
  title: string
  items: NavItem[]
}

const UserIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
)

const ChartIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)

const PointsIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .672-3 1.5S10.343 11 12 11s3 .672 3 1.5S13.657 14 12 14m0-6c1.11 0 2.08.402 2.6 1M12 8V6m0 8v2m8-4a8 8 0 11-16 0 8 8 0 0116 0z" />
  </svg>
)

const TicketIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
  </svg>
)

const ShieldIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
)

const GlobeIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
  </svg>
)

const BanIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
  </svg>
)

const ImageIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const MailIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)

const EyeIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
)

const SettingsIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const NAV_GROUPS: NavGroup[] = [
  {
    title: '系统',
    items: [
      { label: '用户管理', href: '/admin', icon: UserIcon },
      { label: '数据统计', href: '/admin/analytics', icon: ChartIcon },
      { label: '预警设置', href: '/admin/alerts', icon: BellRing },
    ],
  },
  {
    title: '业务',
    items: [
      { label: '积分管理', href: '/admin/points', icon: PointsIcon },
      { label: 'CDK管理', href: '/admin/cdk', icon: TicketIcon },
      { label: '订阅数据', href: '/admin/subscriptions', icon: ShieldIcon },
      { label: '装饰管理', href: '/admin/decorations', icon: ImageIcon },
    ],
  },
  {
    title: '安全',
    items: [
      { label: '黑名单', href: '/admin/blacklist', icon: BanIcon },
      { label: '邮箱域名', href: '/admin/email-domains', icon: MailIcon },
    ],
  },
  {
    title: '工具',
    items: [
      { label: '爬虫分析', href: '/admin/crawler-analysis', icon: GlobeIcon },
      { label: '上帝之眼', href: '/admin/god-eye', icon: EyeIcon },
      { label: '设置', href: '/admin/settings', icon: SettingsIcon },
    ],
  },
]

export default function AdminSidebar() {
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const isActive = (path: string) => {
    const fullPath = transferUrl(path)
    if (path === '/admin') {
      return pathname === fullPath || pathname === fullPath + '/'
    }
    return pathname === fullPath || pathname?.startsWith(fullPath + '/')
  }

  const handleOverlayClick = () => {
    setIsMobileMenuOpen(false)
  }

  const handleMenuClick = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen)
  }

  const handleNavClick = () => {
    setIsMobileMenuOpen(false)
  }

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.href)
    const Icon = item.icon

    return (
      <Link
        key={item.href}
        href={transferUrl(item.href)}
        onClick={handleNavClick}
        className={`group relative flex h-12 items-center gap-3 rounded-[18px] border px-4 text-[15px] font-medium transition-colors ${
          active
            ? 'border-orange-100 bg-orange-50 text-orange-700 shadow-sm'
            : 'border-transparent text-gray-700 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        {active && <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-orange-500" />}
        <Icon
          className={`h-5 w-5 shrink-0 ${
            active ? 'text-orange-600' : 'text-gray-500 group-hover:text-gray-700'
          }`}
        />
        <span className="truncate">{item.label}</span>
      </Link>
    )
  }

  const renderBrand = () => (
    <Link href={transferUrl('/')} className="flex min-w-0 items-center justify-center gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-gray-50">
      <Image
        src="/images/dreamifly-logo.jpg"
        alt="Dreamifly Logo"
        width={34}
        height={34}
        className="rounded-xl border border-gray-200"
      />
      <span className="truncate text-base font-semibold text-gray-900">后台管理</span>
    </Link>
  )

  return (
    <>
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-md border-b border-gray-200 z-40 flex items-center justify-center px-4">
        <button
          onClick={handleMenuClick}
          className="absolute left-4 rounded-xl p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {renderBrand()}
      </div>

      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={handleOverlayClick}
        />
      )}

      <aside
        className={`fixed left-0 top-0 bottom-0 z-50 w-[280px] max-w-[82vw] border-r border-gray-200 bg-white transition-transform duration-300 lg:w-64 lg:max-w-none ${
          isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
        data-admin-sidebar="true"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-center border-b border-gray-200 px-4">
            {renderBrand()}
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-5" data-admin-sidebar="true">
            <div className="mx-auto w-full max-w-[226px]">
              {NAV_GROUPS.map((group, index) => (
                <div key={group.title} className={index === 0 ? '' : 'mt-5'}>
                  <div className="px-4 pb-2 text-xs font-semibold text-gray-400">{group.title}</div>
                  <div className="space-y-1.5">
                    {group.items.map(renderNavItem)}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          <div className="h-3 border-t border-gray-200" />
        </div>
      </aside>
    </>
  )
}
