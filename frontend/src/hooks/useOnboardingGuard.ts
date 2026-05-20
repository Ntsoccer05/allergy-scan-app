'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ONBOARDING_DONE_KEY } from '@/hooks/useOnboarding'
import { getUser } from '@/lib/api/users.api'
import { getCached, setCached } from '@/lib/cache'
import type { UserProfile } from '@/app/settings/settings.types'

/** GET /users/me のクライアントキャッシュキー（useOnboardingGuard 内の重複呼び出し防止） */
const USER_ME_CACHE_KEY = 'user:me'

type GuardStatus = 'loading' | 'allowed' | 'redirect'

/**
 * オンボーディング完了チェックの2段階ガード。
 * 1. localStorage に 'true' がある場合は API 呼び出しなしで通過（高速パス）。
 * 2. localStorage に値がない場合は GET /users/me（またはキャッシュ）で onboarding_done を確認する。
 *    - true  → localStorage にセットして通過
 *    - false または API エラー → /onboarding へリダイレクト
 * 判定完了まで status: 'loading' を返しリダイレクトを保留する（画面フラッシュ防止）。
 */
export const useOnboardingGuard = (): GuardStatus => {
  const router = useRouter()
  // レイジー初期化: localStorage を初回レンダー時に確認し、'true' なら即 'allowed' を返す
  // useEffect 内での同期 setState を避けるためレイジー初期化パターンを使用する
  const [status, setStatus] = useState<GuardStatus>(() => {
    if (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(ONBOARDING_DONE_KEY) === 'true'
    ) {
      return 'allowed'
    }
    return 'loading'
  })

  useEffect(() => {
    // 高速パス: 既に 'allowed'（レイジー初期化済み）なら何もしない
    if (status === 'allowed') return

    // フォールバック: サーバー側の onboarding_done を確認する
    let isCancelled = false

    const checkServer = async () => {
      try {
        // クライアントキャッシュを利用して重複呼び出しを防ぐ
        let profile = getCached<UserProfile>(USER_ME_CACHE_KEY)
        if (!profile) {
          profile = await getUser()
          setCached<UserProfile>(USER_ME_CACHE_KEY, profile)
        }
        if (isCancelled) return

        if (profile.onboarding_done) {
          localStorage.setItem(ONBOARDING_DONE_KEY, 'true')
          setStatus('allowed')
        } else {
          setStatus('redirect')
          router.replace('/onboarding')
        }
      } catch {
        // API エラー時は安全側（/onboarding）に倒す
        if (!isCancelled) {
          setStatus('redirect')
          router.replace('/onboarding')
        }
      }
    }

    void checkServer()

    return () => {
      isCancelled = true
    }
  }, [router, status])

  return status
}
