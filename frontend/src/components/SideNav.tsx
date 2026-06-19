'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

type NavItem = {
  href: string
  labelKey: 'nav.scan' | 'nav.history' | 'nav.map' | 'nav.settings'
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { href: '/scan', labelKey: 'nav.scan', icon: '📷' },
  { href: '/history', labelKey: 'nav.history', icon: '🕐' },
  { href: '/map', labelKey: 'nav.map', icon: '🗺️' },
  { href: '/settings', labelKey: 'nav.settings', icon: '⚙️' },
]

const HIDDEN_PATHS = ['/onboarding']

export const SideNav = () => {
  const pathname = usePathname()
  const t = useTranslations('common')

  if (HIDDEN_PATHS.some((p) => pathname.startsWith(p))) return null

  return (
    <nav
      className="hidden lg:flex flex-col fixed top-0 left-0 h-full w-56 bg-white border-r border-gray-200 z-40"
      aria-label={t('nav.label')}
    >
      <div className="px-5 py-5 border-b border-gray-100">
        <p className="text-sm font-bold text-gray-800">🔍 アレルギースキャン</p>
      </div>
      <div className="flex flex-col p-3 gap-1 flex-1">
        {NAV_ITEMS.map(({ href, labelKey, icon }) => {
          const isActive = pathname === href || (href === '/scan' && pathname === '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
                ${isActive
                  ? 'bg-blue-50 text-blue-600 font-semibold'
                  : 'text-gray-600 hover:bg-gray-100'
                }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="text-lg" aria-hidden="true">{icon}</span>
              <span>{t(labelKey)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
