'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AllergenResult, Confidence, HighlightItem } from '@/app/scan/scan.types'
import { DETECTION_DISPLAY, HIGHLIGHT_CLASS, splitByHighlights } from '@/lib/allergen.utils'

const LABEL_SECTION_KEYWORDS = [
  '原材料名', 'アレルギー物質', '栄養成分', '保存方法',
  '賞味期限', '製造者', '販売者', '内容量', '名称', '原産国',
]

export const formatRawText = (text: string): string => {
  let result = text
  for (const kw of LABEL_SECTION_KEYWORDS) {
    result = result.replace(new RegExp(`([^\n])(${kw})`, 'g'), '$1\n$2')
  }
  return result
}

/** highlights[] を使って raw_text をハイライト表示するコンポーネント（XSS 防止: React コンポーネント配列で安全に実装） */
export const HighlightedText = ({
  rawText,
  highlights,
}: {
  rawText: string
  highlights: HighlightItem[]
}) => {
  const parts = splitByHighlights(formatRawText(rawText), highlights)
  return (
    <p className="mt-2 text-sm lg:text-base text-gray-600 bg-gray-50 rounded p-3 whitespace-pre-wrap leading-relaxed">
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
 * 1アレルギーの判定行コンポーネント。
 * detection_type: 'contains' → 🔴 NG、'partial' → 🟡 注意、'may_contain' → 🟠 注意喚起
 * ⚠️ 安全設計: may_contain は製造ラインのコンタミ。contains（NG）と混同禁止
 */
const AllergenRow = ({ item }: { item: AllergenResult }) => {
  const displayLabel = DETECTION_DISPLAY[item.detection_type]
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2 text-sm lg:text-base font-medium">
        <span>{displayLabel}</span>
        <span className="text-gray-800">{item.allergen}</span>
      </div>
      {item.detected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.detected.map((d) => (
            <span
              key={d}
              className="text-xs sm:text-sm bg-white border border-gray-200 rounded px-2 py-0.5 text-gray-700"
            >
              {d}
            </span>
          ))}
        </div>
      )}
      {item.reason && (
        <p className="text-xs sm:text-sm text-gray-500">{item.reason}</p>
      )}
    </div>
  )
}

/**
 * 同一 detection_type の複数アレルギーをまとめて1カードで表示するコンポーネント。
 * contains（🔴）: アレルゲンごとに行を分けて検出成分を表示。
 * partial（🟡）/ may_contain（🟠）: アレルゲン名を連結し検出成分を統合表示。
 */
const GroupedAllergenRow = ({
  items,
  detectionType,
}: {
  items: AllergenResult[]
  detectionType: 'contains' | 'partial' | 'may_contain'
}) => {
  const displayLabel = DETECTION_DISPLAY[detectionType]

  if (detectionType === 'contains') {
    return (
      <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 space-y-2">
        <div className="flex items-center gap-2 text-sm lg:text-base font-medium">
          <span>{displayLabel}</span>
        </div>
        {items.map((item) => (
          <div key={item.allergen}>
            <span className="text-sm lg:text-base text-gray-800 font-medium">{item.allergen}</span>
            {item.detected.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {item.detected.map((d) => (
                  <span
                    key={d}
                    className="text-xs sm:text-sm bg-white border border-gray-200 rounded px-2 py-0.5 text-gray-700"
                  >
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  const allergenNames = items.map((item) => item.allergen).join('・')
  const allDetected = [...new Set(items.flatMap((item) => item.detected))]

  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2 text-sm lg:text-base font-medium flex-wrap">
        <span>{displayLabel}</span>
        <span className="text-gray-800">{allergenNames}</span>
      </div>
      {allDetected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {allDetected.map((d) => (
            <span
              key={d}
              className="text-xs sm:text-sm bg-white border border-gray-200 rounded px-2 py-0.5 text-gray-700"
            >
              {d}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

type ScanResultBodyProps = {
  results: AllergenResult[]
  highlights: HighlightItem[]
  rawText: string | null
  judgment: 'ng' | 'partial' | 'ok'
  /** OCR の信頼度（ResultCard のみ使用。TodayScansSheet では省略） */
  confidence?: Confidence | null
}

/**
 * OCR スキャン結果のアレルゲン判定表示 + 信頼度警告 + 原材料テキストハイライト。
 * ResultCard と TodayScansSheet で共有する。
 * ⚠️ 安全設計: 免責表示（caution / ngDisclaimer）は呼び出し元が責任を持って表示すること。
 */
export const ScanResultBody = ({
  results,
  highlights,
  rawText,
  judgment,
  confidence,
}: ScanResultBodyProps) => {
  const [rawTextOpen, setRawTextOpen] = useState(true)
  const t = useTranslations('scan.result')

  const containsItems = results.filter(
    (r) => r.judgment !== 'なし' && r.detection_type === 'contains',
  )
  const partialItems = results.filter(
    (r) => r.judgment !== 'なし' && r.detection_type === 'partial',
  )
  const mayContainItems = results.filter(
    (r) => r.judgment !== 'なし' && r.detection_type === 'may_contain',
  )
  const hasNgSection = containsItems.length > 0 || partialItems.length > 0

  return (
    <>
      {results.length === 0 ? (
        <p className="text-sm lg:text-base text-gray-500">{t('noAllergenSetting')}</p>
      ) : (
        <div className="space-y-4" aria-label={t('allergenListLabel')}>
          {judgment === 'ok' && (
            <p className="text-sm lg:text-base font-medium text-green-700">{t('overallOk')}</p>
          )}
          {hasNgSection && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-red-700 border-b border-red-100 pb-1">
                {t('sectionNg')}
              </p>
              {containsItems.length > 1 ? (
                <GroupedAllergenRow items={containsItems} detectionType="contains" />
              ) : (
                containsItems.map((item) => (
                  <AllergenRow key={item.allergen} item={item} />
                ))
              )}
              {partialItems.length > 0 && (
                <GroupedAllergenRow items={partialItems} detectionType="partial" />
              )}
            </div>
          )}
          {mayContainItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-orange-600 border-b border-orange-100 pb-1">
                {t('sectionMayContain')}
              </p>
              <GroupedAllergenRow items={mayContainItems} detectionType="may_contain" />
            </div>
          )}
        </div>
      )}

      {confidence === 'low' && (
        <p className="text-sm lg:text-base text-red-700 bg-red-50 rounded p-3 font-medium">
          {t('confidenceLow')}
        </p>
      )}
      {confidence === 'medium' && (
        <p className="text-sm lg:text-base text-amber-600 bg-amber-50 rounded p-3">
          {t('confidenceMedium')}
        </p>
      )}

      {rawText != null && (
        <div>
          <button
            type="button"
            onClick={() => setRawTextOpen((v) => !v)}
            className="text-sm lg:text-base text-blue-600 underline text-left"
            aria-expanded={rawTextOpen}
          >
            {rawTextOpen ? t('rawTextCollapse') : t('rawTextExpand')}
          </button>
          {rawTextOpen && (
            <HighlightedText rawText={rawText} highlights={highlights} />
          )}
          {/* アクセシビリティ: 展開前でも DOM 内に存在させる（スクリーンリーダー対応） */}
          <span className="sr-only">{rawText}</span>
        </div>
      )}
    </>
  )
}
