'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AllergenGroup, AllergySettings, UserProfile } from '@/app/settings/settings.types'
import { DEBOUNCE_WAIT_MS } from '@/app/settings/settings.constants'
import { getAllergens } from '@/lib/api/allergens.api'
import { getUser, resetUserData, updateUser } from '@/lib/api/users.api'
import { toggleAllergen, toggleCaution, togglePartial } from '@/lib/allergen.utils'

type UseSettingsReturn = {
  allergenGroups: AllergenGroup[]
  allergies: AllergySettings
  locale: 'ja' | 'en'
  userSettings: UserProfile | null
  isLoading: boolean
  isSaving: boolean
  error: string | null
  handleToggleAllergen: (name: string) => void
  handleToggleCaution: (name: string) => void
  handleTogglePartial: (name: string) => void
  handleLocaleChange: (locale: 'ja' | 'en') => void
  handleResetData: () => Promise<void>
}

/**
 * window.location へのアクセスをラップする（テスト時にモック可能にする）
 * @internal
 */
export const _locationHelpers = {
  getProtocol: () => location.protocol,
  reload: () => window.location.reload(),
}

export const useSettings = (): UseSettingsReturn => {
  const [allergenGroups, setAllergenGroups] = useState<AllergenGroup[]>([])
  const [allergies, setAllergies] = useState<AllergySettings>({})
  const [locale, setLocale] = useState<'ja' | 'en'>('ja')
  const [userSettings, setUserSettings] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // debounce 用タイマー ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // ロールバック用: 保存前の allergies を保持する ref
  const prevAllergiesRef = useRef<AllergySettings>({})

  useEffect(() => {
    let isMounted = true

    const initialize = async () => {
      try {
        const [groups, user] = await Promise.all([getAllergens(), getUser()])
        if (!isMounted) return
        setAllergenGroups(groups)
        setAllergies(user.allergies)
        setLocale(user.locale)
        setUserSettings(user)
      } catch {
        if (!isMounted) return
        setError('error.loadFailed')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void initialize()

    return () => {
      isMounted = false
    }
  }, [])

  /**
   * アレルギー設定を即時保存する（debounce 300ms）。
   * 保存失敗時はロールバックする。
   */
  const scheduleSave = useCallback((nextAllergies: AllergySettings) => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(async () => {
      setIsSaving(true)
      try {
        await updateUser({ allergies: nextAllergies })
      } catch {
        // ⚠️ 安全設計: 保存失敗時は UI を元の状態に戻す（誤った設定で運用させない）
        setAllergies(prevAllergiesRef.current)
        setError('error.saveFailed')
      } finally {
        setIsSaving(false)
      }
    }, DEBOUNCE_WAIT_MS)
  }, [])

  const handleToggleAllergen = useCallback(
    (name: string) => {
      setAllergies((prev) => {
        prevAllergiesRef.current = prev
        const next = toggleAllergen(prev, name)
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  const handleToggleCaution = useCallback(
    (name: string) => {
      setAllergies((prev) => {
        prevAllergiesRef.current = prev
        const next = toggleCaution(prev, name)
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  const handleTogglePartial = useCallback(
    (name: string) => {
      setAllergies((prev) => {
        prevAllergiesRef.current = prev
        const next = togglePartial(prev, name)
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  const handleLocaleChange = useCallback(
    async (nextLocale: 'ja' | 'en') => {
      const prevLocale = locale
      setLocale(nextLocale)
      try {
        await updateUser({ locale: nextLocale })
        // Cookie をセットして SSR の locale を更新する（middleware 不使用のためリロード必須）
        const secure = _locationHelpers.getProtocol() === 'https:' ? '; Secure' : ''
        document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`
        _locationHelpers.reload()
      } catch {
        setLocale(prevLocale)
        setError('error.localeChangeFailed')
      }
    },
    [locale],
  )

  const handleResetData = useCallback(async (): Promise<void> => {
    try {
      await resetUserData()
    } catch (e) {
      setError('error.deleteFailed')
      throw e
    }
  }, [])

  return {
    allergenGroups,
    allergies,
    locale,
    userSettings,
    isLoading,
    isSaving,
    error,
    handleToggleAllergen,
    handleToggleCaution,
    handleTogglePartial,
    handleLocaleChange,
    handleResetData,
  }
}

/** useSettings の戻り値型（外部から参照したい場合向け） */
export type { UseSettingsReturn }
