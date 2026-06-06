'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useSettings } from '@/hooks/useSettings'
import { useAuthContext } from '@/providers/AuthProvider'
import { issueBackupCode } from '@/lib/api/backup-code'
import { createClient } from '@/lib/supabase/client'
import { ReservationTextSection } from './ReservationTextSection'
import type { AllergenGroup, AllergenItem } from './settings.types'
import type { IssueBackupCodeResponse } from '@/lib/api/backup-code'

/** Android 判定: navigator.vibrate の存在で判定（呼び出しは行わない） */
const isAndroid = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

export const VIBRATION_STORAGE_KEY = 'vibration_enabled'

type TranslateFn = (key: string, values?: Record<string, string | number>) => string

type AllergenToggleRowProps = {
  item: AllergenItem
  enabled: boolean
  onToggle: () => void
}

const AllergenToggleRow = ({ item, enabled, onToggle }: AllergenToggleRowProps) => (
  <li className="py-3 border-b border-gray-100 last:border-0">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {item.emoji && (
          <span className="text-lg" aria-hidden="true">
            {item.emoji}
          </span>
        )}
        <span className="text-sm font-medium text-gray-800">
          {item.display_name}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={item.display_name}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          ${enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5
            ${enabled ? 'translate-x-5' : 'translate-x-1'}`}
        />
      </button>
    </div>
  </li>
)

type AllergenSectionProps = {
  group: AllergenGroup
  allergies: Record<string, { enabled: boolean; partialAlert: boolean }>
  onToggleAllergen: (name: string) => void
  onToggleCaution: (name: string) => void
  t: TranslateFn
}

/** localStorage に保存するアコーディオン状態のキー（recommended カテゴリのみ） */
const ACCORDION_STORAGE_KEY = 'allergen_accordion_recommended'

const AllergenSection = ({
  group,
  allergies,
  onToggleAllergen,
  onToggleCaution,
  t,
}: AllergenSectionProps) => {
  const isRecommended = group.category === 'recommended'

  // recommended はデフォルト展開。localStorage で状態を永続化する。
  const [isExpanded, setIsExpanded] = useState(() => {
    if (!isRecommended) return true
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem(ACCORDION_STORAGE_KEY)
    return stored === null ? true : stored === 'true'
  })

  const handleToggle = () => {
    setIsExpanded((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        localStorage.setItem(ACCORDION_STORAGE_KEY, String(next))
      }
      return next
    })
  }

  return (
    <section className="mb-4">
      {isRecommended ? (
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={isExpanded}
          className="w-full flex items-center justify-between mb-2
            bg-gray-100 border border-gray-200 rounded-lg px-3 py-2
            cursor-pointer hover:bg-gray-200 transition-colors
            focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <h2 className="text-sm font-semibold text-gray-600">
            {t(`allergens.category.${group.category}`)}
          </h2>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      ) : (
        <div className="mb-2 px-0.5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            {t(`allergens.category.${group.category}`)}
          </h2>
        </div>
      )}

      {isExpanded && (
        <ul className="bg-white rounded-xl shadow-sm divide-y divide-gray-100 overflow-hidden">
          {group.items.map((item) => {
            const setting = allergies[item.name] ?? {
              enabled: false,
              partialAlert: false,
            }
            const isAllergy =
              group.category === 'mandatory' || group.category === 'recommended'
            return (
              <AllergenToggleRow
                key={item.name}
                item={item}
                enabled={setting.enabled}
                onToggle={() =>
                  isAllergy
                    ? onToggleAllergen(item.name)
                    : onToggleCaution(item.name)
                }
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const t = useTranslations('settings') as TranslateFn
  const { user } = useAuthContext()
  const isEmailProvider =
    user?.app_metadata?.provider === 'email' ||
    (user?.identities?.some((identity: { provider: string }) => identity.provider === 'email') ??
      false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [vibrationEnabled, setVibrationEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem(VIBRATION_STORAGE_KEY)
    return stored === null ? true : stored === 'true'
  })

  const handleVibrationToggle = () => {
    setVibrationEnabled((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        localStorage.setItem(VIBRATION_STORAGE_KEY, String(next))
      }
      return next
    })
  }

  const [issuedCode, setIssuedCode] = useState<IssueBackupCodeResponse | null>(null)
  const [isIssuing, setIsIssuing] = useState(false)
  const [issueError, setIssueError] = useState<string | null>(null)
  const [showReissueConfirm, setShowReissueConfirm] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsChangingPassword(true)
    setPasswordError(null)
    setPasswordSuccess(false)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setPasswordError(t('error.passwordChangeFailed'))
      } else {
        setPasswordSuccess(true)
        setNewPassword('')
      }
    } finally {
      setIsChangingPassword(false)
    }
  }

  const handleIssueBackupCode = async () => {
    setIsIssuing(true)
    setIssueError(null)
    try {
      const result = await issueBackupCode()
      setIssuedCode(result)
    } catch {
      setIssueError(t('backup_code.error.issueFailed'))
    } finally {
      setIsIssuing(false)
    }
  }

  const handleReissueConfirm = async () => {
    setShowReissueConfirm(false)
    await handleIssueBackupCode()
  }

  const formatExpiresAt = (isoString: string): string => {
    return new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const {
    allergenGroups,
    allergies,
    locale,
    userSettings,
    isLoading,
    isSaving,
    error,
    handleToggleAllergen,
    handleToggleCaution,
    handleLocaleChange,
    handleDeleteUser,
  } = useSettings()

  const onDeleteConfirm = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await handleDeleteUser()
      router.push('/onboarding')
    } catch {
      setDeleteError(t('error.deleteFailed'))
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <main className="flex justify-center items-center min-h-screen">
        <p className="text-gray-500 text-sm">{t('loading')}</p>
      </main>
    )
  }

  return (
    <main className="flex flex-col min-h-screen max-w-120 lg:max-w-4xl mx-auto px-4 pb-20 lg:pb-8 pt-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">{t('title')}</h1>

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200"
        >
          {t(error)}
        </div>
      )}

      {isSaving && (
        <p className="text-xs text-gray-400 mb-2 text-right">{t('saving')}</p>
      )}

      {/* アレルギー設定セクション: PC は 2 カラム（mandatory | recommended + others） */}
      <section className="mb-8">
        <h2 className="text-base font-bold text-gray-800 mb-4">
          {t('allergens.title')}
        </h2>
        <div className="lg:grid lg:grid-cols-2 lg:gap-6">
          {allergenGroups.map((group) => (
            <AllergenSection
              key={group.category}
              group={group}
              allergies={allergies}
              onToggleAllergen={handleToggleAllergen}
              onToggleCaution={handleToggleCaution}
              t={t}
            />
          ))}
        </div>
      </section>

      {/* サブスクリプション情報 */}
      {userSettings?.subscription && (
        <section className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 mb-8">
          <h2 className="text-base font-bold text-gray-800 mb-2">{t('plan')}</h2>
          <p className="text-sm text-gray-700">{userSettings.subscription.plan_name}</p>
          <p className="text-xs text-gray-500 mt-1">
            {t('dailyLimit', { limit: userSettings.subscription.daily_scan_limit })}
          </p>
        </section>
      )}

      {/* お店予約用テキスト */}
      <ReservationTextSection
        key={
          allergenGroups
            .flatMap((g) => g.items)
            .filter((i) => allergies[i.name]?.enabled)
            .map((i) => i.name)
            .join(',') + locale
        }
        allergies={allergies}
        allergenGroups={allergenGroups}
        locale={locale}
        t={t}
      />

      {/* 言語・バイブレーション: PC は横並び */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6">
        {/* 言語設定 */}
        <section className="mb-8">
          <h2 className="text-base font-bold text-gray-800 mb-4">
            {t('language.title')}
          </h2>
          <div className="bg-white rounded-xl shadow-sm p-4 flex gap-3">
            {(['ja', 'en'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => handleLocaleChange(lang)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                  ${locale === lang
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {t(`language.${lang}`)}
              </button>
            ))}
          </div>
        </section>

        {/* バイブレーション設定（Android のみ表示） */}
        {isAndroid() && (
          <section className="mb-8">
            <h2 className="text-base font-bold text-gray-800 mb-4">
              {t('vibration.title')}
            </h2>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">{t('vibration.description')}</p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={vibrationEnabled}
                  aria-label={t('vibration.title')}
                  onClick={handleVibrationToggle}
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    ${vibrationEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5
                      ${vibrationEnabled ? 'translate-x-5' : 'translate-x-1'}`}
                  />
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* バックアップ・アカウント: PC は横並び */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6">
        {/* バックアップコード */}
        <section className="mb-8">
          <h2 className="text-base font-bold text-gray-800 mb-4">
            {t('backup_code.title')}
          </h2>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500 mb-3">
              {t('backup_code.description')}
            </p>
            {issueError && (
              <p className="text-sm text-red-600 mb-3">{issueError}</p>
            )}
            <button
              type="button"
              onClick={handleIssueBackupCode}
              disabled={isIssuing}
              className="w-full py-2.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium
                border border-blue-200 hover:bg-blue-100 transition-colors
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                disabled:opacity-50"
            >
              {isIssuing ? t('loading') : t('backup_code.issueButton')}
            </button>
          </div>
        </section>

        {/* パスワード変更（メールプロバイダーのみ） */}
        {isEmailProvider && (
          <section className="mb-8">
            <h2 className="text-base font-bold text-gray-800 mb-4">
              {t('changePassword.title')}
            </h2>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('changePassword.newPasswordPlaceholder')}
                  minLength={6}
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {passwordError && (
                  <p className="text-sm text-red-600">{passwordError}</p>
                )}
                {passwordSuccess && (
                  <p className="text-sm text-green-600">{t('changePassword.success')}</p>
                )}
                <button
                  type="submit"
                  disabled={isChangingPassword || newPassword.length < 6}
                  className="w-full py-2.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium
                    border border-blue-200 hover:bg-blue-100 transition-colors
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    disabled:opacity-50"
                >
                  {isChangingPassword ? t('loading') : t('changePassword.button')}
                </button>
              </form>
            </div>
          </section>
        )}

        {/* アカウント・データリセット */}
        <section className="mb-8">
          <h2 className="text-base font-bold text-gray-800 mb-4">
            {t('account.title')}
          </h2>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500 mb-3">
              {t('account.deleteDataDescription')}
            </p>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-2.5 rounded-lg bg-red-50 text-red-600 text-sm font-medium
                border border-red-200 hover:bg-red-100 transition-colors
                focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              {t('account.deleteData')}
            </button>
          </div>
        </section>
      </div>

      {/* バックアップコード表示モーダル */}
      {issuedCode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="backup-code-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIssuedCode(null)}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3
              id="backup-code-dialog-title"
              className="text-base font-bold text-gray-900 mb-4"
            >
              {t('backup_code.modal.title')}
            </h3>

            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-1">{t('backup_code.modal.codeLabel')}</p>
              <p className="text-2xl font-mono font-bold text-gray-900 tracking-widest text-center py-3 bg-gray-50 rounded-lg border border-gray-200">
                {issuedCode.code}
              </p>
            </div>

            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-1">{t('backup_code.modal.expiresLabel')}</p>
              <p className="text-sm text-gray-700">{formatExpiresAt(issuedCode.expires_at)}</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5">
              <p className="text-xs text-amber-800">{t('backup_code.modal.warning')}</p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowReissueConfirm(true)}
                className="w-full py-2.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium
                  hover:bg-gray-200 transition-colors
                  focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
              >
                {t('backup_code.modal.reissueButton')}
              </button>
              <button
                type="button"
                onClick={() => setIssuedCode(null)}
                className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium
                  hover:bg-blue-700 transition-colors
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {t('backup_code.modal.closeButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 再発行確認ダイアログ */}
      {showReissueConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reissue-dialog-title"
          className="fixed inset-0 z-60 flex items-center justify-center px-4"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowReissueConfirm(false)}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3
              id="reissue-dialog-title"
              className="text-base font-bold text-gray-900 mb-3"
            >
              {t('backup_code.modal.reissueConfirmTitle')}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {t('backup_code.modal.reissueConfirmMessage')}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowReissueConfirm(false)}
                className="flex-1 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium
                  hover:bg-gray-200 transition-colors"
              >
                {t('backup_code.modal.reissueConfirmCancel')}
              </button>
              <button
                type="button"
                onClick={handleReissueConfirm}
                disabled={isIssuing}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium
                  hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isIssuing ? t('loading') : t('backup_code.modal.reissueConfirmOk')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認ダイアログ */}
      {showDeleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowDeleteConfirm(false)}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3
              id="delete-dialog-title"
              className="text-base font-bold text-gray-900 mb-3"
            >
              {t('account.deleteConfirmTitle')}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {t('account.deleteConfirmMessage')}
            </p>

            {deleteError && (
              <p className="text-sm text-red-600 mb-4">{deleteError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium
                  hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {t('account.deleteConfirmCancel')}
              </button>
              <button
                type="button"
                onClick={onDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium
                  hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isDeleting ? t('loading') : t('account.deleteConfirmOk')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
