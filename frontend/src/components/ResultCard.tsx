'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AllergenResult, HighlightItem, Judgment, ScanResult, StoreCandidate } from '@/app/scan/scan.types'
import {
  deriveOcrJudgment,
  DETECTION_DISPLAY,
  HIGHLIGHT_CLASS,
  splitByHighlights,
} from '@/lib/allergen.utils'
import { VIBRATE_SHARE_MS } from '@/app/scan/scan.constants'
import { VIBRATION_STORAGE_KEY } from '@/app/settings/page'

type ResultCardProps = {
  result: ScanResult
  onClose: () => void
  storeCandidates?: StoreCandidate[]
  onStoreSelect?: (candidate: StoreCandidate | null) => void
}

/** Android 判定（navigator.userAgent チェック）。iOS では navigator.vibrate を呼ばない */
const isAndroid = (): boolean =>
  typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)

const vibrateIfAndroid = (pattern: number | number[]): void => {
  if (!isAndroid() || typeof navigator.vibrate !== 'function') return
  const enabled = typeof localStorage !== 'undefined'
    ? localStorage.getItem(VIBRATION_STORAGE_KEY) !== 'false'
    : true
  if (enabled) navigator.vibrate(pattern)
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

/** Web Share API のサポート有無を判定する */
const supportsWebShare = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function'

/** 食品ラベルの定型セクション見出し前に改行を挿入して読みやすくする */
const LABEL_SECTION_KEYWORDS = [
  '原材料名', 'アレルギー物質', '栄養成分', '保存方法',
  '賞味期限', '製造者', '販売者', '内容量', '名称', '原産国',
]
const formatRawText = (text: string): string => {
  let result = text
  for (const kw of LABEL_SECTION_KEYWORDS) {
    result = result.replace(new RegExp(`([^\n])(${kw})`, 'g'), '$1\n$2')
  }
  return result
}

/** highlights[] を使って raw_text をハイライト表示するコンポーネント（XSS 防止: React コンポーネント配列で安全に実装） */
const HighlightedText = ({
  rawText,
  highlights,
}: {
  rawText: string
  highlights: HighlightItem[]
}) => {
  const parts = splitByHighlights(formatRawText(rawText), highlights)
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
 * 1アレルギーの判定行コンポーネント。
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

export const ResultCard = ({
  result,
  onClose,
  storeCandidates = [],
  onStoreSelect,
}: ResultCardProps) => {
  const [rawTextOpen, setRawTextOpen] = useState(true)
  const t = useTranslations('result')

  /**
   * Web Share API に渡す共有コンテンツを構築する。
   * ⚠️ navigator.share は HTTPS 環境でのみ動作する（localhost 開発時は非対応の場合がある）
   */
  const buildShareContent = (): { title: string; text: string } => {
    const title = t('share.title')
    const name =
      result.type === 'barcode'
        ? (result.data.product_name ?? t('share.defaultProductName'))
        : t('share.defaultProductName')
    return {
      title,
      text: t('share.text', { name, title }),
    }
  }

  /** judgment 値から表示ラベルへのマッピング（t() はコンポーネント内で呼ぶ必要がある） */
  const judgmentLabel: Record<Judgment, string> = {
    '含む': t('judgment.contains'),
    '一部含む': t('judgment.partial'),
    'なし': t('judgment.none'),
    '判定不能': t('judgment.unknown'),
  }

  // low_confidence は専用 UI を返す
  if (result.type === 'low_confidence') {
    return (
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl"
        role="region"
        aria-label={t('regionLabel')}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="px-4 pb-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-base font-bold text-amber-700">{t('lowConfidenceTitle')}</p>
          <p className="text-sm text-gray-600">{t('lowConfidenceMessage')}</p>
          {result.raw_text ? (
            <p className="text-xs text-gray-700 bg-gray-50 rounded p-2 whitespace-pre-wrap">
              {result.raw_text}
            </p>
          ) : null}
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <p className="text-xs text-amber-800 font-medium">{t('caution')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 rounded-lg border border-gray-300 text-sm text-gray-600"
          >
            {t('scanAgain')}
          </button>
        </div>
      </div>
    )
  }

  // confidence: low かつ raw_text が空 = テキスト読み取り完全失敗。✅なし表示は誤解を招くため専用 UI を返す
  const isUnreadable =
    result.type === 'ocr' && result.data.confidence === 'low' && !result.data.raw_text

  if (isUnreadable) {
    return (
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl"
        role="region"
        aria-label={t('regionLabel')}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="px-4 pb-6 space-y-4">
          <p className="text-base font-bold text-red-700">{t('unreadableTitle')}</p>
          <p className="text-sm text-gray-600">{t('unreadableMessage')}</p>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <p className="text-xs text-amber-800 font-medium">{t('caution')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 rounded-lg border border-gray-300 text-sm text-gray-600"
          >
            {t('scanAgain')}
          </button>
        </div>
      </div>
    )
  }

  const judgment = deriveJudgment(result)
  const isNg = isNgJudgment(judgment)
  const canShare = judgment === 'なし'
  const supportsShare = supportsWebShare()

  const raw_text =
    result.type === 'ocr' ? result.data.raw_text : undefined
  const highlights =
    result.type === 'ocr' ? result.data.highlights : []

  // バーコードスキャン時は detected を直接使う
  const barcodeDected =
    result.type === 'barcode' ? (result.data.detected ?? []) : []

  const productName =
    result.type === 'barcode'
      ? result.data.product_name
      : result.type === 'ocr'
        ? (result.data.product_name ?? null)
        : undefined

  const ocrPrice =
    result.type === 'ocr' && result.data.price_confidence === 'high'
      ? (result.data.price_with_tax ?? result.data.price)
      : null

  const handleShare = async (): Promise<void> => {
    if (typeof navigator.share !== 'function') return
    vibrateIfAndroid(VIBRATE_SHARE_MS)
    const shareContent = buildShareContent()
    try {
      await navigator.share(shareContent)
    } catch (err) {
      // ユーザーによるキャンセル（AbortError）は無視する
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Web Share API error:', err)
      }
    }
  }

  return (
    <div
      className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl
        translate-y-0 transition-transform duration-300"
      role="region"
      aria-label={t('regionLabel')}
    >
      {/* ドラッグハンドル */}
      <div className="flex justify-center pt-2 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      <div className="px-4 pb-6 space-y-4 max-h-[70vh] overflow-y-auto">
        {/* 商品名 */}
        {productName && (
          <p className="text-base font-semibold text-gray-800">
            <span className="text-xs font-normal text-gray-500 mr-1">{t('productNameLabel')}</span>
            {productName}
          </p>
        )}

        {/* 価格（price_confidence === 'high' のときのみ表示 — coding_rules.md §価格表示ルール） */}
        {ocrPrice !== null && (
          <p className="text-sm text-gray-700">
            <span className="text-xs font-normal text-gray-500 mr-1">{t('priceLabel')}</span>
            {t('priceValue', { price: ocrPrice })}
          </p>
        )}

        {/* 判定サマリ */}
        {judgment !== null && (
          <div className="flex items-center gap-2 text-lg font-bold">
            <span>{JUDGMENT_EMOJI[judgment]}</span>
            <span>{judgmentLabel[judgment]}</span>
          </div>
        )}

        {/* OCR: 全アレルギー判定結果（NG・注意 / 注意喚起 をセクション分割） */}
        {result.type === 'ocr' && (
          <>
            {result.data.results.length === 0 ? (
              <p className="text-sm text-gray-500">{t('noAllergenSetting')}</p>
            ) : (() => {
              // judgment === 'なし' はノイズになるため非表示。含む/一部含む/判定不能のみ表示する
              const ngItems = result.data.results.filter(
                r => r.judgment !== 'なし' && r.detection_type !== 'may_contain'
              )
              const mayContainItems = result.data.results.filter(
                r => r.judgment !== 'なし' && r.detection_type === 'may_contain'
              )
              return (
                <div className="space-y-4" aria-label={t('allergenListLabel')}>
                  {judgment === 'なし' && (
                    <p className="text-sm font-medium text-green-700">{t('overallOk')}</p>
                  )}
                  {ngItems.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-red-700 border-b border-red-100 pb-1">
                        {t('sectionNg')}
                      </p>
                      {ngItems.map((item) => (
                        <AllergenRow key={item.allergen} item={item} />
                      ))}
                    </div>
                  )}
                  {mayContainItems.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-orange-600 border-b border-orange-100 pb-1">
                        {t('sectionMayContain')}
                      </p>
                      {mayContainItems.map((item) => (
                        <AllergenRow key={item.allergen} item={item} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* 信頼度警告 */}
            {result.data.confidence === 'low' && (
              <p className="text-xs text-red-700 bg-red-50 rounded p-2 font-medium">
                {t('confidenceLow')}
              </p>
            )}
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

        {/* SNS 共有ボタン（OK 判定 + Web Share API 対応環境のみ表示 — anti_patterns.md #4 遵守） */}
        {canShare && supportsShare && (
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg
              bg-black text-white text-sm font-medium"
          >
            {t('share.button')}
          </button>
        )}

        {/* 店舗選択 UI（storeCandidates が 2 件以上のときのみ表示） */}
        {storeCandidates.length >= 2 && onStoreSelect && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">{t('selectStore')}</p>
            {storeCandidates.map((candidate) => (
              <button
                key={candidate.placeId}
                type="button"
                onClick={() => onStoreSelect(candidate)}
                className="w-full py-2 px-3 rounded-lg border border-blue-200 bg-blue-50
                  text-sm text-blue-800 text-left"
              >
                {candidate.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onStoreSelect(null)}
              className="w-full py-2 rounded-lg border border-gray-200 text-sm text-gray-500"
            >
              {t('storeUnknown')}
            </button>
          </div>
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
