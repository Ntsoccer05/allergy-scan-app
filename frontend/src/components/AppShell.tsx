'use client'

import { usePathname } from 'next/navigation'

// オンボーディングではサイドバーを表示しないため、コンテンツをシフトしない
const SIDEBAR_EXCLUDED_PATHS = ['/onboarding']

type AppShellProps = {
  children: React.ReactNode
}

export const AppShell = ({ children }: AppShellProps) => {
  const pathname = usePathname()
  const hasSidebar = !SIDEBAR_EXCLUDED_PATHS.some((p) => pathname.startsWith(p))

  return (
    <div className={`flex-1 flex flex-col min-w-0 ${hasSidebar ? 'lg:pl-56' : ''}`}>
      {children}
    </div>
  )
}
