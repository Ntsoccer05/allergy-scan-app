'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { useAuthContext } from '@/providers/AuthProvider'

export const AdminLayout = ({ children }: { children: ReactNode }) => {
  const t = useTranslations('admin')
  const { user } = useAuthContext()

  // ミドルウェアで保護済みだが、クライアント側でも二重チェックする（defense-in-depth）
  const role = (user?.app_metadata as { role?: string } | undefined)?.role
  if (user !== null && role !== 'admin') {
    // isLoading 中は user === null のためフラッシュしない
    return null
  }

  const ADMIN_NAV = [
    { href: '/admin/stats', label: t('layout.nav.stats') },
    { href: '/admin/users', label: t('layout.nav.users') },
  ]

  return (
    <div className="flex min-h-screen">
      <aside className="w-48 border-r bg-background p-4">
        <p className="mb-4 text-sm font-bold text-muted-foreground">{t('layout.title')}</p>
        <nav className="flex flex-col gap-1">
          {ADMIN_NAV.map(item => (
            <Link key={item.href} href={item.href} className="rounded px-3 py-2 text-sm hover:bg-accent">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8">
          <Link href="/scan" className="text-xs text-muted-foreground hover:text-foreground">
            {t('layout.backToApp')}
          </Link>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
