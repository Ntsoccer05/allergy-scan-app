'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useOnboarding, ONBOARDING_DONE_KEY } from '@/hooks/useOnboarding'
import type { AllergenGroup, AllergySettings } from '@/app/settings/settings.types'

type TranslateFn = (key: string) => string

// ──────────────────────────────────────────────
// 画面1: ようこそ
// ──────────────────────────────────────────────
type Step1Props = {
  t: TranslateFn
  onStart: () => void
}

const Step1 = ({ t, onStart }: Step1Props) => (
  <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-8">
    <div className="flex flex-col items-center gap-4">
      <span className="text-7xl" aria-hidden="true">🔍</span>
      <h1 className="text-2xl font-bold text-gray-900">{t('step1.title')}</h1>
      <p className="text-sm text-gray-600 leading-relaxed">{t('step1.description')}</p>
    </div>
    <div className="w-full flex flex-col gap-3">
      <button
        type="button"
        onClick={onStart}
        className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-semibold text-base
          shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        {t('step1.start')}
      </button>
      <Link
        href="/onboarding/restore"
        className="text-sm text-blue-600 hover:underline text-center py-2"
      >
        {t('step1.restore')}
      </Link>
    </div>
  </div>
)

// ──────────────────────────────────────────────
// 画面2: アレルゲン選択
// ──────────────────────────────────────────────
type AllergenToggleItemProps = {
  name: string
  displayName: string
  emoji: string | null
  enabled: boolean
  onToggle: () => void
}

const AllergenToggleItem = ({
  name,
  displayName,
  emoji,
  enabled,
  onToggle,
}: AllergenToggleItemProps) => (
  <li className="py-3 border-b border-gray-100 last:border-0">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {emoji && (
          <span className="text-lg" aria-hidden="true">{emoji}</span>
        )}
        <span className="text-sm font-medium text-gray-800">{displayName}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={displayName}
        data-testid={`toggle-${name}`}
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

type Step2Props = {
  t: TranslateFn
  allergenGroups: AllergenGroup[]
  selectedAllergies: AllergySettings
  canProceed: boolean
  onToggleAllergen: (name: string) => void
  onToggleCaution: (name: string) => void
  onNext: () => void
}

const Step2 = ({
  t,
  allergenGroups,
  selectedAllergies,
  canProceed,
  onToggleAllergen,
  onToggleCaution,
  onNext,
}: Step2Props) => {
  // recommended カテゴリーの展開状態はコンポーネント内部で管理
  // (サブコンポーネントに切り出してもよいが今回はインラインで実装)
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-xl font-bold text-gray-900 mb-2">{t('step2.title')}</h1>
        <p className="text-sm text-gray-600">{t('step2.description')}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6">
        {allergenGroups.map((group) => {
          const isMandatory = group.category === 'mandatory'
          return (
            <section key={group.category} className="mb-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {t(`step2.category.${group.category}`)}
              </h2>
              <ul className="bg-white rounded-xl shadow-sm divide-y divide-gray-100 overflow-hidden">
                {group.items.map((item) => {
                  const setting = selectedAllergies[item.name] ?? {
                    enabled: false,
                    partialAlert: false,
                  }
                  return (
                    <AllergenToggleItem
                      key={item.name}
                      name={item.name}
                      displayName={item.display_name}
                      emoji={item.emoji}
                      enabled={setting.enabled}
                      onToggle={() =>
                        isMandatory
                          ? onToggleAllergen(item.name)
                          : onToggleCaution(item.name)
                      }
                    />
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      <div className="px-6 pb-8 pt-4">
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-semibold text-base
            shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
        >
          {t('step2.next')}
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// 画面3: 一部含む警告設定
// ──────────────────────────────────────────────
type Step3Props = {
  t: TranslateFn
  allergenGroups: AllergenGroup[]
  selectedAllergies: AllergySettings
  onTogglePartial: (name: string) => void
  onNext: () => void
  onBack: () => void
}

const Step3 = ({
  t,
  allergenGroups,
  selectedAllergies,
  onTogglePartial,
  onNext,
  onBack,
}: Step3Props) => {
  // 画面2で enabled にした mandatory/recommended 品目のみ表示
  const enabledItems = allergenGroups.flatMap((g) =>
    g.items.filter((item) => selectedAllergies[item.name]?.enabled),
  )

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4">
        <button
          type="button"
          onClick={onBack}
          className="text-blue-600 text-sm mb-4 hover:underline focus:outline-none"
          aria-label={t('back')}
        >
          {t('back')}
        </button>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{t('step3.title')}</h1>
        <p className="text-sm text-gray-600">{t('step3.description')}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6">
        <ul className="bg-white rounded-xl shadow-sm divide-y divide-gray-100 overflow-hidden">
          {enabledItems.map((item) => {
            const setting = selectedAllergies[item.name] ?? {
              enabled: false,
              partialAlert: false,
            }
            return (
              <li key={item.name} className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {item.emoji && (
                      <span className="text-lg" aria-hidden="true">{item.emoji}</span>
                    )}
                    <span className="text-sm font-medium text-gray-800">
                      {item.display_name}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={setting.partialAlert}
                    aria-label={`${item.display_name} - ${t('step3.partialAlertLabel')}`}
                    data-testid={`partial-${item.name}`}
                    onClick={() => onTogglePartial(item.name)}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                      ${setting.partialAlert ? 'bg-blue-500' : 'bg-gray-300'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5
                        ${setting.partialAlert ? 'translate-x-4' : 'translate-x-1'}`}
                    />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1 pl-8">
                  {t('step3.partialAlertDescription')}
                </p>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="px-6 pb-8 pt-4">
        <button
          type="button"
          onClick={onNext}
          className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-semibold text-base
            shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {t('step3.next')}
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// 画面4: 免責同意
// ──────────────────────────────────────────────
type Step4Props = {
  t: TranslateFn
  onAgree: () => Promise<void>
  onBack: () => void
  isLoading: boolean
  error: string | null
}

const Step4 = ({ t, onAgree, onBack, isLoading, error }: Step4Props) => (
  <div className="flex flex-col h-full">
    <div className="px-6 pt-6 pb-4">
      <button
        type="button"
        onClick={onBack}
        className="text-blue-600 text-sm mb-4 hover:underline focus:outline-none"
        aria-label={t('back')}
      >
        {t('back')}
      </button>
      <h1 className="text-xl font-bold text-gray-900 mb-4">{t('step4.title')}</h1>
    </div>

    <div className="flex-1 overflow-y-auto px-6">
      {/* ⚠️ 安全設計: implementation_rules.md §3 免責UI - 省略不可 */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
        <p className="text-sm text-amber-800 leading-relaxed">{t('step4.disclaimer')}</p>
      </div>

      <ul className="space-y-3">
        {(['important1', 'important2', 'important3'] as const).map((key) => (
          <li key={key} className="flex items-start gap-2">
            <span className="text-amber-500 mt-0.5" aria-hidden="true">⚠️</span>
            <span className="text-sm text-gray-700">{t(`step4.${key}`)}</span>
          </li>
        ))}
      </ul>

      {error && (
        <div
          role="alert"
          className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200"
        >
          {t(`error.${error}`)}
        </div>
      )}
    </div>

    <div className="px-6 pb-8 pt-4">
      {/* ⚠️ 安全設計: R8 - このボタン以外にオンボーディング完了への経路を設けない */}
      <button
        type="button"
        onClick={onAgree}
        disabled={isLoading}
        className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-semibold text-base
          shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading ? t('loading') : t('step4.agree')}
      </button>
    </div>
  </div>
)

// ──────────────────────────────────────────────
// メインページコンポーネント
// ──────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  // テンプレートリテラルキー（動的ステップキー等）を型安全に扱うためキャストする
  const t = useTranslations('onboarding') as TranslateFn

  const {
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
  } = useOnboarding()

  // クライアントサイドガード: onboarding_done === 'true' なら /scan へリダイレクト
  // Next.js middleware は Edge Runtime で localStorage を参照できないためここで実装
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      if (localStorage.getItem(ONBOARDING_DONE_KEY) === 'true') {
        router.replace('/scan')
      }
    }
  }, [router])

  if (isLoading) {
    return (
      <main className="flex justify-center items-center min-h-screen">
        <p className="text-gray-500 text-sm">{t('loading')}</p>
      </main>
    )
  }

  return (
    <main className="flex flex-col min-h-screen max-w-[480px] mx-auto bg-gray-50">
      {/* プログレスインジケーター */}
      <div className="flex gap-1.5 px-6 pt-4" aria-hidden="true">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              s <= step ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col">
        {step === 1 && <Step1 t={t} onStart={goNext} />}

        {step === 2 && (
          <Step2
            t={t}
            allergenGroups={allergenGroups}
            selectedAllergies={selectedAllergies}
            canProceed={canProceedStep2}
            onToggleAllergen={handleToggleAllergen}
            onToggleCaution={handleToggleCaution}
            onNext={goNext}
          />
        )}

        {step === 3 && (
          <Step3
            t={t}
            allergenGroups={allergenGroups}
            selectedAllergies={selectedAllergies}
            onTogglePartial={handleTogglePartial}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {step === 4 && (
          <Step4
            t={t}
            onAgree={completeOnboarding}
            onBack={goBack}
            isLoading={isLoading}
            error={error}
          />
        )}
      </div>
    </main>
  )
}
