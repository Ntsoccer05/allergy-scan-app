'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type {
  AllergenGroup,
  AllergySettings,
} from '@/app/settings/settings.types'
import { getAllergens } from '@/lib/api/allergens.api'
import { updateUser } from '@/lib/api/users.api'
import { toggleAllergen, toggleCaution, togglePartial } from '@/lib/allergen.utils'

/** localStorage のオンボーディング完了フラグキー */
export const ONBOARDING_DONE_KEY = 'onboarding_done'

/** オンボーディングのステップ数 */
const TOTAL_STEPS = 4

type UseOnboardingReturn = {
  step: number
  allergenGroups: AllergenGroup[]
  selectedAllergies: AllergySettings
  isLoading: boolean
  error: string | null
  /** 画面2: 1品目以上 enabled なら true */
  canProceedStep2: boolean
  /** 次のステップへ進む */
  goNext: () => void
  /** 前のステップへ戻る（step 1 では何もしない） */
  goBack: () => void
  handleToggleAllergen: (name: string) => void
  handleToggleCaution: (name: string) => void
  handleTogglePartial: (name: string) => void
  /** 画面4: [同意してはじめる] ボタンから呼ぶ唯一の完了関数 */
  completeOnboarding: () => Promise<void>
}

export const useOnboarding = (): UseOnboardingReturn => {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [allergenGroups, setAllergenGroups] = useState<AllergenGroup[]>([])
  const [selectedAllergies, setSelectedAllergies] = useState<AllergySettings>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // GET /allergens の二重呼び出し防止（React StrictMode 対策）
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    let isMounted = true

    const initialize = async () => {
      try {
        // POST /users/init は layout.tsx の UserInitializer が全ページ共通で担う。
        // ここで呼ぶと /onboarding アクセス時に二重発行になるため委譲する。
        const groups = await getAllergens()
        if (!isMounted) return
        // mandatory / recommended カテゴリーのみ表示対象
        const onboardingGroups = groups.filter(
          (g) => g.category === 'mandatory' || g.category === 'recommended',
        )
        setAllergenGroups(onboardingGroups)
      } catch {
        if (!isMounted) return
        setError('initFailed')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void initialize()

    return () => {
      isMounted = false
    }
  }, [])

  const canProceedStep2 = useMemo(
    () => Object.values(selectedAllergies).some((s) => s.enabled),
    [selectedAllergies],
  )

  const goNext = useCallback(() => {
    setStep((prev) => Math.min(prev + 1, TOTAL_STEPS))
  }, [])

  const goBack = useCallback(() => {
    setStep((prev) => Math.max(prev - 1, 1))
  }, [])

  const handleToggleAllergen = useCallback((name: string) => {
    setSelectedAllergies((prev) => toggleAllergen(prev, name))
  }, [])

  const handleToggleCaution = useCallback((name: string) => {
    setSelectedAllergies((prev) => toggleCaution(prev, name))
  }, [])

  const handleTogglePartial = useCallback((name: string) => {
    setSelectedAllergies((prev) => togglePartial(prev, name))
  }, [])

  /**
   * ⚠️ 安全設計: オンボーディング完了は[同意してはじめる]ボタンからのみ呼び出す。
   * PUT /users/me 成功後に localStorage へフラグをセットしてから /scan へ遷移する。
   */
  const completeOnboarding = useCallback(async () => {
    setError(null)
    try {
      await updateUser({ allergies: selectedAllergies, locale: 'ja' })
      localStorage.setItem(ONBOARDING_DONE_KEY, 'true')
      router.replace('/scan')
    } catch {
      setError('saveFailed')
    }
  }, [selectedAllergies, router])

  return {
    step,
    allergenGroups,
    selectedAllergies,
    isLoading,
    error,
    canProceedStep2,
    goNext,
    goBack,
    handleToggleAllergen,
    handleToggleCaution,
    handleTogglePartial,
    completeOnboarding,
  }
}
