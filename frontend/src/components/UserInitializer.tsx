'use client'

import { useEffect } from 'react'
import { initUser } from '@/lib/api/users.api'

/**
 * アプリ起動時に POST /users/init を呼び出す Client Component。
 * layout.tsx が Server Component のため、useEffect を使うために分離している。
 */
export const UserInitializer = () => {
  useEffect(() => {
    initUser().catch(() => {
      // Cookie 発行失敗はサイレントに扱う（アプリは動作継続する）
    })
  }, [])

  return null
}
