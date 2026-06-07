'use client'

import { useEffect, useRef, useState } from 'react'
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
  onReset: () => void
  storeCandidates?: StoreCandidate[]
  onStoreSelect?: (candidate: StoreCandidate | null) => void
  onPatchHistory?: (data: { product_name?: string | null; store_name?: string | null; memo?: string | null; thumbnail_url?: string | null }) => void
  onRetakeThumbnail?: () => void
}

const MIN_HEIGHT = 64
const getDefaultHeight = (): number =>
  typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.55) : 400
const getMaxHeight = (): number =>
  typeof window !== 'undefined' ? window.innerHeight - 64 : 700

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

export const ResultCard = ({
  result,
  onReset,
  storeCandidates = [],
  onStoreSelect,
  onPatchHistory,
  onRetakeThumbnail,
}: ResultCardProps) => {
  // アコーディオンはデフォルト展開
  const [rawTextOpen, setRawTextOpen] = useState(true)
  const t = useTranslations('scan.result')

  // 自由変形ドラッグリサイズ（Rules of Hooks: early return より前に宣言）
  const [panelHeight, setPanelHeight] = useState<number | null>(null)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(0)

  // 商品情報アコーディオン（Rules of Hooks: early return より前に宣言）
  const productNameFromOcr =
    result.type === 'barcode' ? (result.data.product_name ?? null) :
    result.type === 'ocr' ? (result.data.product_name ?? null) : null
  const [editProductName, setEditProductName] = useState(productNameFromOcr ?? '')
  const [editStoreName, setEditStoreName] = useState('')
  const [editMemo, setEditMemo] = useState('')
  const [productInfoOpen, setProductInfoOpen] = useState(productNameFromOcr !== null)

  useEffect(() => {
    setPanelHeight(getDefaultHeight())
  }, [])

  const handleDragStart = (clientY: number): void => {
    dragStartY.current = clientY
    dragStartHeight.current = panelHeight ?? getDefaultHeight()

    const onMouseMove = (e: MouseEvent): void => {
      const delta = dragStartY.current - e.clientY
      setPanelHeight(Math.max(MIN_HEIGHT, Math.min(getMaxHeight(), dragStartHeight.current + delta)))
    }
    const onTouchMove = (e: TouchEvent): void => {
      const currentY = e.touches[0]?.clientY ?? dragStartY.current
      const delta = dragStartY.current - currentY
      setPanelHeight(Math.max(MIN_HEIGHT, Math.min(getMaxHeight(), dragStartHeight.current + delta)))
    }
    const onEnd = (): void => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('touchmove', onTouchMove)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('touchmove', onTouchMove)
    window.addEventListener('mouseup', onEnd, { once: true })
    window.addEventListener('touchend', onEnd, { once: true })
  }

  /** 店舗選択時: 店舗名を編集フィールドに反映してアコーディオンを開く */
  const handleStoreSelect = (candidate: StoreCandidate | null): void => {
    if (candidate) {
      setEditStoreName(candidate.name)
      setProductInfoOpen(true)
    }
    onStoreSelect?.(candidate)
  }

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

  // ドラッグハンドル用 style / class（早期 return があるため共通化）
  const judgment = deriveJudgment(result)
  const panelStyle = { height: panelHeight !== null ? `${panelHeight}px` : '55vh' }
  const panelClass = 'absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl flex flex-col overflow-hidden'
  const dragHandleClass = 'flex justify-center pt-2 pb-1 cursor-ns-resize touch-none select-none shrink-0'

  // low_confidence は専用 UI を返す
  if (result.type === 'low_confidence') {
    return (
      <div
        style={panelStyle}
        className={panelClass}
        role="region"
        aria-label={t('regionLabel')}
      >
        <div
          onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
          onMouseDown={(e) => handleDragStart(e.clientY)}
          className={dragHandleClass}
        >
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
          <p className="text-base lg:text-lg font-bold text-amber-700">{t('lowConfidenceTitle')}</p>
          <p className="text-sm lg:text-base text-gray-600">{t('lowConfidenceMessage')}</p>
          {result.raw_text ? (
            <p className="text-sm lg:text-base text-gray-700 bg-gray-50 rounded p-3 whitespace-pre-wrap leading-relaxed">
              {result.raw_text}
            </p>
          ) : null}
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
            <p className="text-sm lg:text-base text-amber-800 font-medium">{t('caution')}</p>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="w-full py-2.5 rounded-lg border border-gray-300 text-sm lg:text-base text-gray-600"
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
        style={panelStyle}
        className={panelClass}
        role="region"
        aria-label={t('regionLabel')}
      >
        <div
          onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
          onMouseDown={(e) => handleDragStart(e.clientY)}
          className={dragHandleClass}
        >
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
          <p className="text-base lg:text-lg font-bold text-red-700">{t('unreadableTitle')}</p>
          <p className="text-sm lg:text-base text-gray-600">{t('unreadableMessage')}</p>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
            <p className="text-sm lg:text-base text-amber-800 font-medium">{t('caution')}</p>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="w-full py-2.5 rounded-lg border border-gray-300 text-sm lg:text-base text-gray-600"
          >
            {t('scanAgain')}
          </button>
        </div>
      </div>
    )
  }

  const isNg = isNgJudgment(judgment)
  const canShare = judgment === 'なし'
  const supportsShare = supportsWebShare()

  const raw_text =
    result.type === 'ocr' ? result.data.raw_text : undefined
  const highlights =
    result.type === 'ocr' ? result.data.highlights : []

  const barcodeDected =
    result.type === 'barcode' ? (result.data.detected ?? []) : []

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
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Web Share API error:', err)
      }
    }
  }

  return (
    <div
      style={panelStyle}
      className={panelClass}
      role="region"
      aria-label={t('regionLabel')}
    >
      {/* 常時表示ヘッダー: ドラッグハンドル + 判定サマリ */}
      <div
        onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
        onMouseDown={(e) => handleDragStart(e.clientY)}
        className="shrink-0 cursor-ns-resize touch-none select-none"
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        {judgment !== null && (
          <div className="px-4 pb-2 flex items-center gap-2 text-lg font-bold">
            <span>{JUDGMENT_EMOJI[judgment]}</span>
            <span>{judgmentLabel[judgment]}</span>
          </div>
        )}
      </div>

      {/* スクロール可能なコンテンツ（overflow-hidden により高さでクリップ） */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
        {/* 商品情報アコーディオン（商品名・店舗名・備考） */}
        <div className="border border-gray-200 rounded-lg">
          <button
            type="button"
            onClick={() => setProductInfoOpen((prev) => !prev)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-700"
            aria-expanded={productInfoOpen}
          >
            <span>{t('productInfo.title')}</span>
            <span className={`text-gray-400 transition-transform duration-150 inline-block ${productInfoOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {productInfoOpen && (
            <div className="px-3 pb-3 space-y-3 border-t border-gray-100">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">{t('productInfo.productName')}</label>
                <input
                  type="text"
                  value={editProductName}
                  onChange={(e) => setEditProductName(e.target.value)}
                  onBlur={() => onPatchHistory?.({ product_name: editProductName.trim() || null })}
                  placeholder={t('productInfo.productNamePlaceholder')}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">{t('productInfo.storeName')}</label>
                <input
                  type="text"
                  value={editStoreName}
                  onChange={(e) => setEditStoreName(e.target.value)}
                  onBlur={() => onPatchHistory?.({ store_name: editStoreName.trim() || null })}
                  placeholder={t('productInfo.storeNamePlaceholder')}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* 価格（price_confidence === 'high' のときのみ表示 — coding_rules.md §価格表示ルール） */}
        {ocrPrice !== null && (
          <p className="text-sm lg:text-base text-gray-700">
            <span className="text-xs sm:text-sm font-normal text-gray-500 mr-1">{t('priceLabel')}</span>
            {t('priceValue', { price: ocrPrice })}
          </p>
        )}

        {/* OCR: 全アレルギー判定結果（NG・注意 / 注意喚起 をセクション分割） */}
        {result.type === 'ocr' && (
          <>
            {result.data.results.length === 0 ? (
              <p className="text-sm lg:text-base text-gray-500">{t('noAllergenSetting')}</p>
            ) : (() => {
              const ngItems = result.data.results.filter(
                r => r.judgment !== 'なし' && r.detection_type !== 'may_contain'
              )
              const mayContainItems = result.data.results.filter(
                r => r.judgment !== 'なし' && r.detection_type === 'may_contain'
              )
              return (
                <div className="space-y-4" aria-label={t('allergenListLabel')}>
                  {judgment === 'なし' && (
                    <p className="text-sm lg:text-base font-medium text-green-700">{t('overallOk')}</p>
                  )}
                  {ngItems.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-red-700 border-b border-red-100 pb-1">
                        {t('sectionNg')}
                      </p>
                      {ngItems.map((item) => (
                        <AllergenRow key={item.allergen} item={item} />
                      ))}
                    </div>
                  )}
                  {mayContainItems.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-orange-600 border-b border-orange-100 pb-1">
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
              <p className="text-sm lg:text-base text-red-700 bg-red-50 rounded p-3 font-medium">
                {t('confidenceLow')}
              </p>
            )}
            {result.data.confidence === 'medium' && (
              <p className="text-sm lg:text-base text-amber-600 bg-amber-50 rounded p-3">
                {t('confidenceMedium')}
              </p>
            )}
          </>
        )}

        {/* バーコードスキャン: detected 一覧 */}
        {result.type === 'barcode' && barcodeDected.length > 0 && (
          <div className="space-y-1.5">
            {barcodeDected.map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm lg:text-base">
                <span>🔴</span>
                <span className="text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        )}

        {/* raw_text 展開表示（implementation_rules.md §2: 省略禁止）*/}
        {raw_text !== undefined && (
          <div>
            <button
              type="button"
              onClick={() => setRawTextOpen((prev) => !prev)}
              className="text-sm lg:text-base text-blue-600 underline text-left"
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

        {/* 備考欄（原材料の下・免責表示の上） */}
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">{t('productInfo.memo')}</label>
          <textarea
            value={editMemo}
            onChange={(e) => setEditMemo(e.target.value)}
            onBlur={() => onPatchHistory?.({ memo: editMemo.trim() || null })}
            placeholder={t('productInfo.memoPlaceholder')}
            rows={2}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 resize-none"
          />
        </div>

        {/* サムネイル再撮影ボタン */}
        {onRetakeThumbnail && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{t('productInfo.thumbnail')}</span>
            <button
              type="button"
              onClick={onRetakeThumbnail}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {t('productInfo.retakeThumbnail')}
            </button>
          </div>
        )}

        {/* ⚠️ 安全設計: 全判定で常時表示（省略禁止） */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
          <p className="text-sm lg:text-base text-amber-800 font-medium">
            {t('caution')}
          </p>
        </div>

        {/* ⚠️ 安全設計: NG 判定時は追加免責表示（省略禁止） */}
        {isNg && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
            <p className="text-sm lg:text-base text-red-800">
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
        {storeCandidates.length >= 2 && (
          <div className="space-y-2">
            <p className="text-sm lg:text-base font-medium text-gray-700">{t('selectStore')}</p>
            {storeCandidates.map((candidate) => (
              <button
                key={candidate.placeId}
                type="button"
                onClick={() => handleStoreSelect(candidate)}
                className="w-full py-2.5 px-3 rounded-lg border border-blue-200 bg-blue-50
                  text-sm lg:text-base text-blue-800 text-left"
              >
                {candidate.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleStoreSelect(null)}
              className="w-full py-2.5 rounded-lg border border-gray-200 text-sm lg:text-base text-gray-500"
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
            onReset()
          }}
          className="w-full py-2.5 rounded-lg border border-gray-300 text-sm lg:text-base text-gray-600"
        >
          {t('scanAgain')}
        </button>
      </div>
    </div>
  )
}
