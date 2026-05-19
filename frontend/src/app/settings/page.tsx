'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useSettings } from '@/hooks/useSettings'
import { useOnboardingGuard } from '@/hooks/useOnboardingGuard'
import { issueBackupCode } from '@/lib/api/backup-code'
import type { AllergenGroup, AllergenItem } from './settings.types'
import type { IssueBackupCodeResponse } from '@/lib/api/backup-code'

/** Android 判定: navigator.vibrate の存在で判定（呼び出しは行わない） */
const isAndroid = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

type TranslateFn = (key: string) => string

type AllergenToggleRowProps = {
  item: AllergenItem
  enabled: boolean
  partialAlert: boolean
  judgmentType: 'allergy' | 'caution'
  onToggle: () => void
  onTogglePartial: () => void
  t: TranslateFn
}

const AllergenToggleRow = ({
  item,
  enabled,
  partialAlert,
  judgmentType,
  onToggle,
  onTogglePartial,
  t,
}: AllergenToggleRowProps) => (
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

    {/* partialAlert は allergy カテゴリーかつ enabled のときのみ表示 */}
    {judgmentType === 'allergy' && enabled && (
      <div className="flex items-center justify-between mt-2 pl-8">
        <span className="text-xs text-gray-500">
          {t('allergens.partialAlertDescription')}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={partialAlert}
          aria-label={t('allergens.partialAlert')}
          onClick={onTogglePartial}
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            ${partialAlert ? 'bg-blue-500' : 'bg-gray-300'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5
              ${partialAlert ? 'translate-x-4' : 'translate-x-1'}`}
          />
        </button>
      </div>
    )}
  </li>
)

type AllergenSectionProps = {
  group: AllergenGroup
  allergies: Record<string, { enabled: boolean; partialAlert: boolean }>
  onToggleAllergen: (name: string) => void
  onToggleCaution: (name: string) => void
  onTogglePartial: (name: string) => void
  t: TranslateFn
}

const AllergenSection = ({
  group,
  allergies,
  onToggleAllergen,
  onToggleCaution,
  onTogglePartial,
  t,
}: AllergenSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const isRecommended = group.category === 'recommended'
  const visibleItems: AllergenItem[] = isRecommended && !isExpanded ? [] : group.items

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {t(`allergens.category.${group.category}`)}
      </h2>
      <ul className="bg-white rounded-xl shadow-sm divide-y divide-gray-100 overflow-hidden">
        {visibleItems.map((item) => {
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
              partialAlert={setting.partialAlert}
              judgmentType={isAllergy ? 'allergy' : 'caution'}
              onToggle={() =>
                isAllergy
                  ? onToggleAllergen(item.name)
                  : onToggleCaution(item.name)
              }
              onTogglePartial={() => onTogglePartial(item.name)}
              t={t}
            />
          )
        })}
      </ul>

      {isRecommended && (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="mt-2 w-full text-sm text-blue-600 py-2 hover:underline focus:outline-none"
        >
          {isExpanded
            ? t('allergens.showLess')
            : t('allergens.showMore')}
        </button>
      )}
    </section>
  )
}

export default function SettingsPage() {
  useOnboardingGuard()
  const router = useRouter()
  // テンプレートリテラルキー（動的カテゴリー名等）を型安全に扱うためキャストする
  const t = useTranslations('settings') as TranslateFn
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // バックアップコード関連ステート
  const [issuedCode, setIssuedCode] = useState<IssueBackupCodeResponse | null>(null)
  const [isIssuing, setIsIssuing] = useState(false)
  const [issueError, setIssueError] = useState<string | null>(null)
  const [showReissueConfirm, setShowReissueConfirm] = useState(false)

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
    isLoading,
    isSaving,
    error,
    handleToggleAllergen,
    handleToggleCaution,
    handleTogglePartial,
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
    <main className="flex flex-col min-h-screen max-w-[480px] mx-auto px-4 pb-20 pt-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">{t('title')}</h1>

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200"
        >
          {error}
        </div>
      )}

      {isSaving && (
        <p className="text-xs text-gray-400 mb-2 text-right">{t('saving')}</p>
      )}

      {/* アレルゲン設定セクション */}
      <section className="mb-8">
        <h2 className="text-base font-bold text-gray-800 mb-4">
          {t('allergens.title')}
        </h2>
        {allergenGroups.map((group) => (
          <AllergenSection
            key={group.category}
            group={group}
            allergies={allergies}
            onToggleAllergen={handleToggleAllergen}
            onToggleCaution={handleToggleCaution}
            onTogglePartial={handleTogglePartial}
            t={t}
          />
        ))}
      </section>

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
            <p className="text-sm text-gray-600">{t('vibration.description')}</p>
          </div>
        </section>
      )}

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
          className="fixed inset-0 z-[60] flex items-center justify-center px-4"
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
          {/* オーバーレイ */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowDeleteConfirm(false)}
            aria-hidden="true"
          />
          {/* ダイアログ本体 */}
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
