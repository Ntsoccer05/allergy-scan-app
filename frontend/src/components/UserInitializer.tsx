'use client'

import { useEffect } from 'react'
import { initUser } from '@/lib/api/users.api'

const SESSION_KEY = 'user_init_done'

/**
 * アプリ起動時に POST /users/me/init を呼び出す Client Component。
 * layout.tsx が Server Component のため、useEffect を使うために分離している。
 *
 * sessionStorage でセッション内の重複呼び出しを防ぐ。
 * フラグをコール前に立てることで React StrictMode の二重 effect も防止する。
 */
export const UserInitializer = () => {
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return

    // StrictMode の二重 effect を防ぐため呼び出し前にフラグを立てる
    sessionStorage.setItem(SESSION_KEY, '1')

    initUser().catch(() => {
      // 失敗時はフラグを削除して次回ロード時に再試行できるようにする
      sessionStorage.removeItem(SESSION_KEY)
    })
  }, [])

  return null
}
