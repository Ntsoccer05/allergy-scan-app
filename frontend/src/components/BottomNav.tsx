'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

type NavItem = {
  href: string
  labelKey: 'nav.scan' | 'nav.history' | 'nav.map' | 'nav.settings'
  icon: string
}

// /onboarding パスではボトムナビを非表示にする
const HIDDEN_PATHS: string[] = ['/onboarding']

const NAV_ITEMS: NavItem[] = [
  { href: '/scan', labelKey: 'nav.scan', icon: '📷' },
  { href: '/history', labelKey: 'nav.history', icon: '🕐' },
  { href: '/map', labelKey: 'nav.map', icon: '🗺️' },
  { href: '/settings', labelKey: 'nav.settings', icon: '⚙️' },
]

export const BottomNav = () => {
  const pathname = usePathname()
  const t = useTranslations('common')

  if (HIDDEN_PATHS.includes(pathname)) {
    return null
  }

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-gray-200
        flex items-center justify-around max-w-120 mx-auto w-full"
      aria-label={t('nav.label')}
    >
      {NAV_ITEMS.map(({ href, labelKey, icon }) => {
        const isActive = pathname === href || (href === '/scan' && pathname === '/')
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg
              text-xs transition-colors
              ${isActive ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="text-xl" aria-hidden="true">{icon}</span>
            <span>{t(labelKey)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
