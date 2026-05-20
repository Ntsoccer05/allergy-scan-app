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

  const handleRegenerate = () => {
    setText(generatedText)
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
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg p-3
            resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {copyError && (
          <p className="text-xs text-red-600 mt-1">{copyError}</p>
        )}
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={handleRegenerate}
            className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium
              hover:bg-gray-200 transition-colors
              focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          >
            {t('reservationText.regenerateButton')}
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              ${
                isCopied
                  ? 'bg-green-600 text-white'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
          >
            {isCopied ? t('reservationText.copiedButton') : t('reservationText.copyButton')}
          </button>
        </div>
      </div>
    </section>
  )
}
