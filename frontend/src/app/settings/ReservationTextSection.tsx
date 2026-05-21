'use client'

import { useState } from 'react'
import { buildReservationText } from '@/lib/reservation-text.util'
import type { AllergenGroup, AllergySettings } from './settings.types'

/** コピー完了フラグが true になってから元に戻るまでの表示時間（ms） */
const COPY_FEEDBACK_DURATION_MS = 2000

type TranslateFn = (key: string) => string

export type ReservationTextSectionProps = {
  allergies: AllergySettings
  allergenGroups: AllergenGroup[]
  /** locale は format 文字列の変化を検知するために受け取る */
  locale: 'ja' | 'en'
  t: TranslateFn
}

/**
 * お店予約用テキストセクション。
 * `enabled: true` の品目が 0 件のときは null を返してセクション全体を非表示にする（R2）。
 */
export const ReservationTextSection = ({
  allergies,
  allergenGroups,
  t,
}: ReservationTextSectionProps) => {
  const enabledNames = allergenGroups
    .flatMap((group) => group.items)
    .filter((item) => allergies[item.name]?.enabled === true)
    .map((item) => item.display_name)

  const format = {
    prefix: t('reservationText.format.prefix'),
    suffix: t('reservationText.format.suffix'),
    separator: t('reservationText.format.separator'),
  }

  const generatedText = buildReservationText(enabledNames, format)

  // allergies または locale 変化時は親が key を変えてコンポーネントを再マウントする。
  // 再マウント時に useState の初期値が再評価されるため、textarea は自動的に新しい生成テキストに戻る。
  const [text, setText] = useState(generatedText)
  const [isCopied, setIsCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  if (enabledNames.length === 0) return null

  const handleCopy = async () => {
    setCopyError(null)
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        throw new Error('clipboard unavailable')
      }
      await navigator.clipboard.writeText(text)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), COPY_FEEDBACK_DURATION_MS)
    } catch {
      setCopyError(t('reservationText.copyError'))
    }
  }

  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-gray-800 mb-1">
        {t('reservationText.title')}
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        {t('reservationText.description')}
      </p>
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg p-3 pr-10
              resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => void handleCopy()}
            aria-label={isCopied ? t('reservationText.copiedButton') : t('reservationText.copyButton')}
            className={`absolute top-2 right-2 p-1.5 rounded-md transition-colors
              focus:outline-none focus:ring-2 focus:ring-blue-500
              ${isCopied
                ? 'text-green-600'
                : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
              }`}
          >
            {isCopied ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>
        {copyError && (
          <p className="text-xs text-red-600 mt-1">{copyError}</p>
        )}
      </div>
    </section>
  )
}
