'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ONBOARDING_DONE_KEY } from '@/hooks/useOnboarding'

/**
 * オンボーディング完了チェックのクライアントサイドガード。
 * localStorage.onboarding_done が 'true' でない場合 /onboarding へリダイレクトする。
 * scan / history / settings の各ページで呼び出す（DRY）。
 */
export const useOnboardingGuard = () => {
  const router = useRouter()
  useEffect(() => {
    if (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(ONBOARDING_DONE_KEY) !== 'true'
    ) {
      router.replace('/onboarding')
    }
  }, [router])
}
