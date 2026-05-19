'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AllergenResult, HighlightItem, Judgment, ScanResult } from '@/app/scan/scan.types'
import {
  deriveOcrJudgment,
  DETECTION_DISPLAY,
  HIGHLIGHT_CLASS,
  splitByHighlights,
} from '@/lib/allergen.utils'

type ResultCardProps = {
  result: ScanResult
  onClose: () => void
}

/** Android 判定（navigator.userAgent チェック）。iOS では navigator.vibrate を呼ばない */
const isAndroid = (): boolean =>
  typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)

const vibrateIfAndroid = (pattern: number | number[]): void => {
  if (isAndroid() && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern)
  }
}

const JUDGMENT_EMOJI: Record<Judgment, string> = {
  '含む': '🔴',
  '一部含む': '🟡',
  'なし': '✅',
  '判定不能': '⚠️',
}

/** OCR 結果から overall judgment を導出 */
const deriveJudgment = (result: ScanResult): Judgment | null => {
  if (result.type === 'ocr') return deriveOcrJudgment(result.data.results)
  if (result.type === 'barcode' && result.data.found) {
    const j = result.data.judgment
    if (j === 'ng') return '含む'
    if (j === 'partial') return '一部含む'
    if (j === 'ok') return 'なし'
  }
  return null
}

/** NG 判定かどうか（「含む」または「一部含む」） */
const isNgJudgment = (judgment: Judgment | null): boolean =>
  judgment === '含む' || judgment === '一部含む'

const buildShareText = (result: ScanResult): string => {
  const name =
    result.type === 'barcode'
      ? (result.data.product_name ?? '商品')
      : '商品'
  return encodeURIComponent(
    `【アレルギーチェック済み✅】\n${name}\nアレルギーチェックアプリで確認しました`,
  )
}

/** highlights[] を使って raw_text をハイライト表示するコンポーネント（XSS 防止: React コンポーネント配列で安全に実装） */
const HighlightedText = ({
  rawText,
  highlights,
}: {
  rawText: string
  highlights: HighlightItem[]
}) => {
  const parts = splitByHighlights(rawText, highlights)
  return (
    <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-2 whitespace-pre-wrap">
      {parts.map((part, i) =>
        part.highlight ? (
          <mark key={i} className={HIGHLIGHT_CLASS[part.judgment]}>
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  )
}

/**
 * 1アレルゲンの判定行コンポーネント。
 * detection_type: 'contains' → 🔴 NG、'partial' → 🟡 注意、'may_contain' → 🟠 注意喚起
 * ⚠️ 安全設計: may_contain は製造ラインのコンタミ。contains（NG）と混同禁止
 */
const AllergenRow = ({ item }: { item: AllergenResult }) => {
  const displayLabel = DETECTION_DISPLAY[item.detection_type]
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 space-y-1">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span>{displayLabel}</span>
        <span className="text-gray-800">{item.allergen}</span>
      </div>
      {item.detected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.detected.map((d) => (
            <span
              key={d}
              className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-700"
            >
              {d}
            </span>
          ))}
        </div>
      )}
      {item.reason && (
        <p className="text-xs text-gray-500">{item.reason}</p>
      )}
    </div>
  )
}

export const ResultCard = ({ result, onClose }: ResultCardProps) => {
  const [rawTextOpen, setRawTextOpen] = useState(false)
  const t = useTranslations('result')

  /** judgment 値から表示ラベルへのマッピング（t() はコンポーネント内で呼ぶ必要がある） */
  const judgmentLabel: Record<Judgment, string> = {
    '含む': t('judgment.contains'),
    '一部含む': t('judgment.partial'),
    'なし': t('judgment.none'),
    '判定不能': t('judgment.unknown'),
  }

  const judgment = deriveJudgment(result)
  const isNg = isNgJudgment(judgment)
  const canShare = judgment === 'なし'

  const raw_text =
    result.type === 'ocr' ? result.data.raw_text : undefined
  const highlights =
    result.type === 'ocr' ? result.data.highlights : []

  // バーコードスキャン時は detected を直接使う
  const barcodeDected =
    result.type === 'barcode' ? (result.data.detected ?? []) : []

  const productName =
    result.type === 'barcode' ? result.data.product_name : undefined

  const shareUrl = `https://twitter.com/intent/tweet?text=${buildShareText(result)}`

  return (
    <div
      className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl
        translate-y-0 transition-transform duration-300"
      role="region"
      aria-label="スキャン結果"
    >
      {/* ドラッグハンドル */}
      <div className="flex justify-center pt-2 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      <div className="px-4 pb-6 space-y-4 max-h-[70vh] overflow-y-auto">
        {/* 商品名 */}
        {productName && (
          <p className="text-base font-semibold text-gray-800">{productName}</p>
        )}

        {/* 判定サマリ */}
        {judgment !== null && (
          <div className="flex items-center gap-2 text-lg font-bold">
            <span>{JUDGMENT_EMOJI[judgment]}</span>
            <span>{judgmentLabel[judgment]}</span>
          </div>
        )}

        {/* OCR: 全アレルゲン判定結果（results[] 全件表示） */}
        {result.type === 'ocr' && (
          <>
            {result.data.results.length === 0 ? (
              <p className="text-sm text-gray-500">{t('noAllergenSetting')}</p>
            ) : (
              <div
                className="space-y-2"
                aria-label={t('allergenListLabel')}
              >
                {/* 全アレルゲンが「なし」の場合は問題なし表示 */}
                {judgment === 'なし' && (
                  <p className="text-sm font-medium text-green-700">{t('overallOk')}</p>
                )}
                {result.data.results.map((item) => (
                  <AllergenRow key={item.allergen} item={item} />
                ))}
              </div>
            )}

            {/* 信頼度 medium 警告 */}
            {result.data.confidence === 'medium' && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded p-2">
                {t('confidenceMedium')}
              </p>
            )}
          </>
        )}

        {/* バーコードスキャン: detected 一覧 */}
        {result.type === 'barcode' && barcodeDected.length > 0 && (
          <div className="space-y-1">
            {barcodeDected.map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm">
                <span>🔴</span>
                <span className="text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        )}

        {/* raw_text 展開表示（implementation_rules.md §2: 省略禁止） */}
        {raw_text !== undefined && (
          <div>
            <button
              type="button"
              onClick={() => setRawTextOpen((prev) => !prev)}
              className="text-sm text-blue-600 underline text-left"
              aria-expanded={rawTextOpen}
            >
              {rawTextOpen ? t('rawTextCollapse') : t('rawTextExpand')}
            </button>
            {rawTextOpen && (
              <HighlightedText rawText={raw_text} highlights={highlights} />
            )}
            {/* アクセシビリティ: 展開前でも DOM 内に存在させる（スクリーンリーダー対応） */}
            <span className="sr-only">{raw_text}</span>
          </div>
        )}

        {/* ⚠️ 安全設計: 全判定で常時表示（省略禁止） */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <p className="text-xs text-amber-800 font-medium">
            {t('caution')}
          </p>
        </div>

        {/* ⚠️ 安全設計: NG 判定時は追加免責表示（省略禁止） */}
        {isNg && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-xs text-red-800">
              {t('ngDisclaimer')}
            </p>
          </div>
        )}

        {/* SNS 共有ボタン（OK 判定のみ表示 — anti_patterns.md #4 遵守） */}
        {canShare && (
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg
              bg-black text-white text-sm font-medium"
            onClick={() => vibrateIfAndroid(50)}
          >
            {t('shareOnX')}
          </a>
        )}

        {/* 閉じるボタン */}
        <button
          type="button"
          onClick={() => {
            vibrateIfAndroid(30)
            onClose()
          }}
          className="w-full py-2 rounded-lg border border-gray-300 text-sm text-gray-600"
        >
          {t('scanAgain')}
        </button>
      </div>
    </div>
  )
}
