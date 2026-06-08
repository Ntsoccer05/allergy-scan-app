'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuthContext } from '@/providers/AuthProvider'

type NavItem = { href: string; labelKey: 'nav.scan' | 'nav.history' | 'nav.settings'; icon: string }

const NAV_ITEMS: NavItem[] = [
  { href: '/scan',     labelKey: 'nav.scan',     icon: '📷' },
  { href: '/history',  labelKey: 'nav.history',  icon: '📋' },
  { href: '/settings', labelKey: 'nav.settings', icon: '⚙️' },
]

// These paths hide the nav entirely (e.g. onboarding, auth pages)
const HIDDEN_PATHS = ['/onboarding']

export const Navbar = () => {
  const t = useTranslations('common')
  const pathname = usePathname()
  const { user, signOut } = useAuthContext()

  if (HIDDEN_PATHS.some((p) => pathname.startsWith(p))) return null

  return (
    <>
      {/* PC: 左サイドナビ */}
      <aside
        className="hidden lg:flex flex-col fixed top-0 left-0 h-full w-56 bg-white border-r border-gray-200 z-40"
        aria-label={t('nav.label')}
      >
        <div className="px-5 py-5 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-800">🔍 アレルギースキャン</p>
        </div>
        <nav className="flex flex-col p-3 gap-1 flex-1">
          {NAV_ITEMS.map(({ href, labelKey, icon }) => {
            const isActive = pathname === href || (href === '/scan' && pathname === '/')
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
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
        </nav>
        <div className="p-4 border-t border-gray-100">
          {user?.email && (
            <p className="mb-2 text-xs text-gray-400 truncate">{user.email}</p>
          )}
          <button
            onClick={signOut}
            className="w-full text-left text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            {t('nav.signOut')}
          </button>
        </div>
      </aside>

      {/* SP/Tablet: ボトムナビ */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-gray-200 flex items-center justify-around max-w-120 mx-auto w-full z-40"
        aria-label={t('nav.label')}
      >
        {NAV_ITEMS.map(({ href, labelKey, icon }) => {
          const isActive = pathname === href || (href === '/scan' && pathname === '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg text-xs transition-colors ${
                isActive ? 'text-blue-600 font-semibold' : 'text-gray-500'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="text-xl" aria-hidden="true">{icon}</span>
              <span>{t(labelKey)}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
