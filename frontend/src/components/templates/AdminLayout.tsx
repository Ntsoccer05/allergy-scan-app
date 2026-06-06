import Link from 'next/link'
import type { ReactNode } from 'react'

const ADMIN_NAV = [
  { href: '/admin/stats', label: '統計' },
  { href: '/admin/users', label: 'ユーザー' },
]

export const AdminLayout = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-screen">
    <aside className="w-48 border-r bg-background p-4">
      <p className="mb-4 text-sm font-bold text-muted-foreground">管理者</p>
      <nav className="flex flex-col gap-1">
        {ADMIN_NAV.map(item => (
          <Link key={item.href} href={item.href} className="rounded px-3 py-2 text-sm hover:bg-accent">
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-8">
        <Link href="/scan" className="text-xs text-muted-foreground hover:text-foreground">
          ← アプリへ戻る
        </Link>
      </div>
    </aside>
    <main className="flex-1 p-6">{children}</main>
  </div>
)
