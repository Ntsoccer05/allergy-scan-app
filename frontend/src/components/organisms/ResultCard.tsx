'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AllergenResult, DetectionType, HighlightItem, Judgment, ScanResult } from '@/app/scan/scan.types'
import type { PlaceCandidatesResponse } from '@/lib/api/places.api'
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
  /**
   * 商品名未入力でキャンセルする際に呼ばれる。
   * バックエンドが自動保存した履歴エントリを削除してリセットする。
   */
  onDiscard?: () => void
  /** スキャン時に取得した GPS 座標。null の場合 GPS 取得待ち */
  geolocation?: { lat: number; lng: number } | null
  /** 現在地の住所・施設候補を取得する（「場所を登録」ボタンタップ時のみ呼ぶ — 00320） */
  onFetchPlaceCandidates?: (query?: string) => Promise<PlaceCandidatesResponse | null>
  /** 選択した場所を履歴の location に登録する（place_id は施設選択時のみ、address は逆ジオコーディング住所、storeLat/storeLng は店舗座標） */
  onRegisterLocation?: (storeName: string, placeId?: string, address?: string, storeLat?: number, storeLng?: number) => void
  onPatchHistory?: (data: { product_name?: string | null; store_name?: string | null; memo?: string | null; thumbnail_url?: string | null }) => void
  onRetakeThumbnail?: () => void
  thumbnailUrl?: string | null
  /** 複数スキャン時のタブ切り替えバー（ResultCardQueue から注入） */
  tabBar?: React.ReactNode
}

/** 「場所を登録」UI の表示状態 */
type LocationUiState = 'idle' | 'loading' | 'select' | 'failed'

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

export const ResultCard = ({
  result,
  onReset,
  onDiscard,
  geolocation = null,
  onFetchPlaceCandidates,
  onRegisterLocation,
  onPatchHistory,
  onRetakeThumbnail,
  thumbnailUrl,
  tabBar,
}: ResultCardProps) => {
  // アコーディオンはデフォルト展開
  const [rawTextOpen, setRawTextOpen] = useState(true)
  const [thumbnailExpanded, setThumbnailExpanded] = useState(false)
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
  // 商品名未入力での破棄確認ダイアログ
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [editAddress, setEditAddress] = useState('')
  const [editMemo, setEditMemo] = useState('')
  // 商品名がなければ常に開いて入力を促す
  const [productInfoOpen, setProductInfoOpen] = useState(true)


  // 「場所を登録」UI（Rules of Hooks: early return より前に宣言）
  const [locationUiState, setLocationUiState] = useState<LocationUiState>('idle')
  const [placeCandidates, setPlaceCandidates] = useState<PlaceCandidatesResponse | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  // 保存フィードバック: フィールド保存後に「✓ 保存しました」を短時間表示する
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showSaved = (): void => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('saved')
    saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
  }

  useEffect(() => {
    setPanelHeight(getDefaultHeight())
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // 検索クエリで候補をフィルタリング（13,000件の全候補を毎回走査しないよう useMemo でキャッシュ）
  const filteredCandidates = useMemo(() => {
    if (!placeCandidates) return []
    const q = searchQuery.trim().toLowerCase()
    if (q === '') return placeCandidates.candidates
    return placeCandidates.candidates.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.address?.toLowerCase().includes(q) ?? false),
    )
  }, [placeCandidates, searchQuery])

  /** 場所候補を取得する（ボタンタップ / デバウンス検索から呼ばれる） */
  const handleFetchCandidates = async (q?: string): Promise<void> => {
    if (!onFetchPlaceCandidates) return
    setLocationUiState('loading')
    const data = await onFetchPlaceCandidates(q)
    if (!data) { setLocationUiState('idle'); return }
    setPlaceCandidates(data)
    if (data.candidates.length > 0 || data.address !== null) {
      setLocationUiState('select')
    } else {
      setLocationUiState('failed')
    }
  }

  /** 検索入力変更時: フロントエンドで部分一致フィルタリング（追加 API 呼び出し不要） */
  const handleSearchQueryChange = (value: string): void => {
    setSearchQuery(value)
    setShowDropdown(true)
  }

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

  /** 場所選択時: 店舗名・住所を編集フィールドに反映し、履歴の location を更新する */
  const handleSelectLocation = (storeName: string, placeId?: string, address?: string, storeLat?: number, storeLng?: number): void => {
    setEditStoreName(storeName)
    if (address) setEditAddress(address)
    setLocationUiState('idle')
    setShowDropdown(false)
    setSearchQuery('')
    onRegisterLocation?.(storeName, placeId, address || editAddress || undefined, storeLat, storeLng)
    showSaved()
  }

  /** 住所のみで登録: store_name は空文字、address フィールドに住所を保存 */
  const handleSelectAddressOnly = (address: string): void => {
    setEditAddress(address)
    setLocationUiState('idle')
    setShowDropdown(false)
    setSearchQuery('')
    onRegisterLocation?.('', undefined, address)
    showSaved()
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
        {tabBar}
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
          <p className="text-base lg:text-lg font-bold text-amber-700">{t('lowConfidenceTitle')}</p>
          <p className="text-sm lg:text-base text-gray-600">{t('lowConfidenceMessage')}</p>
          {result.raw_text ? (
            <p className="text-sm lg:text-base text-gray-700 bg-gray-50 rounded p-3 whitespace-pre-wrap leading-relaxed">
              {formatRawText(result.raw_text)}
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
        {tabBar}
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

  // ⚠️ 安全設計: バーコード判定（JAN キャッシュ = 他ユーザーの OCR 結果や OFF データ）でも
  // raw_text があれば表示し、本人が読み取り内容を検証できるようにする
  const raw_text =
    result.type === 'ocr'
      ? result.data.raw_text
      : result.type === 'barcode'
        ? (result.data.raw_text ?? undefined)
        : undefined
  const highlights =
    result.type === 'ocr' ? result.data.highlights : []

  const barcodeDected =
    result.type === 'barcode' ? (result.data.detected ?? []) : []

  const itemUrl =
    (result.type === 'barcode' && result.data.item_url) ||
    (result.type === 'ocr' && result.data.item_url) ||
    null

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
      {/* ドラッグハンドル */}
      <div
        onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
        onMouseDown={(e) => handleDragStart(e.clientY)}
        className="flex justify-center pt-2 pb-1 cursor-ns-resize touch-none select-none shrink-0"
      >
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      {/* タブバー（複数スキャン時に ResultCardQueue から注入） */}
      {tabBar}

      {/* 判定サマリ */}
      {result.type === 'ocr' && result.data.results.length > 0 ? (
        // OCR: アレルギーごとの個別判定をコンパクトに並べる（detection_type 基準で絵文字を決定）
        <div className="px-4 pb-2 flex flex-wrap gap-x-4 gap-y-1 shrink-0">
          {[...result.data.results]
            .sort((a, b) => {
              // contains(🔴) > partial(🟡) > may_contain(🟠) > 判定不能(⚠️) > なし(✅)
              const detectionOrder: Record<DetectionType, number> = { contains: 0, partial: 1, may_contain: 2 }
              const getOrder = (r: typeof a): number => {
                if (r.judgment === 'なし') return 4
                if (r.judgment === '判定不能') return 3
                return detectionOrder[r.detection_type] ?? 2
              }
              return getOrder(a) - getOrder(b)
            })
            .map((r) => {
              const emoji =
                r.judgment === 'なし' ? '✅' :
                r.judgment === '判定不能' ? '⚠️' :
                r.detection_type === 'contains' ? '🔴' :
                r.detection_type === 'partial' ? '🟡' :
                '🟠'
              return (
                <span key={r.allergen} className="flex items-center gap-1 text-sm font-semibold">
                  <span>{emoji}</span>
                  <span className="text-gray-800">{r.allergen}</span>
                </span>
              )
            })}
        </div>
      ) : judgment !== null ? (
        // バーコード: 全体判定を1行表示
        <div className="px-4 pb-2 flex items-center gap-2 text-lg font-bold shrink-0">
          <span>{JUDGMENT_EMOJI[judgment]}</span>
          <span>{judgmentLabel[judgment]}</span>
        </div>
      ) : null}

      {/* スクロール可能なコンテンツ（overflow-hidden により高さでクリップ） */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
        {/* 商品情報アコーディオン（商品名・店舗名・備考） */}
        <div className={`border rounded-lg ${editProductName.trim() === '' ? 'border-orange-300' : 'border-gray-200'}`}>
          <button
            type="button"
            onClick={() => setProductInfoOpen((prev) => !prev)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-700"
            aria-expanded={productInfoOpen}
          >
            <span className="flex items-center gap-2">
              {t('productInfo.title')}
              {saveStatus === 'saved' && (
                <span className="text-xs font-normal text-green-600 transition-opacity duration-300">
                  {t('productInfo.saved')}
                </span>
              )}
              {saveStatus === 'idle' && editProductName.trim() === '' && (
                <span className="text-xs font-normal text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                  {t('productInfo.required')}
                </span>
              )}
            </span>
            <span className={`text-gray-400 transition-transform duration-150 inline-block ${productInfoOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {productInfoOpen && (
            <div className="px-3 pb-3 space-y-3 border-t border-gray-100">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">
                  {t('productInfo.productName')}
                  <span className="ml-1 text-orange-500">*</span>
                </label>
                <input
                  type="text"
                  value={editProductName}
                  onChange={(e) => { setEditProductName(e.target.value); setShowDiscardConfirm(false) }}
                  onBlur={() => { onPatchHistory?.({ product_name: editProductName.trim() || null }); showSaved() }}
                  placeholder={t('productInfo.productNamePlaceholder')}
                  className={`w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:border-blue-400 ${editProductName.trim() === '' ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}
                  autoFocus={productNameFromOcr === null}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">{t('productInfo.storeName')}</label>
                <input
                  type="text"
                  value={editStoreName}
                  onChange={(e) => setEditStoreName(e.target.value)}
                  onBlur={() => { onPatchHistory?.({ store_name: editStoreName.trim() || null }); showSaved() }}
                  placeholder={t('productInfo.storeNamePlaceholder')}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* 店舗情報を登録 UI（商品情報アコーディオン内に統合） */}
              {onFetchPlaceCandidates && onRegisterLocation && (
                <div className="space-y-1.5">
                  {locationUiState === 'idle' && (
                    <button
                      type="button"
                      onClick={() => { void handleFetchCandidates() }}
                      className="text-sm text-blue-600 underline text-left"
                    >
                      {t('registerLocation.button')}
                    </button>
                  )}

                  {locationUiState !== 'idle' && (
                    <>
                      <div className="relative">
                        <div className="relative">
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchQueryChange(e.target.value)}
                            onFocus={() => setShowDropdown(true)}
                            onBlur={() => { setTimeout(() => setShowDropdown(false), 200) }}
                            placeholder={t('registerLocation.searchPlaceholder')}
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus
                            className="w-full px-2 py-1.5 pr-7 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                          />
                          {locationUiState === 'loading' && (
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 text-xs animate-pulse">
                              ⏳
                            </span>
                          )}
                          {locationUiState === 'select' && searchQuery.length > 0 && (
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { setSearchQuery(''); setShowDropdown(true) }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-base leading-none"
                              aria-label="クリア"
                            >
                              ×
                            </button>
                          )}
                        </div>

                        {showDropdown && locationUiState === 'select' && placeCandidates && (
                          <div className="absolute left-0 right-0 top-full z-50 mt-0.5 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                            <div className="max-h-52 overflow-y-auto">
                              {filteredCandidates.slice(0, 100).map((candidate) => (
                                <button
                                  key={candidate.placeId}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleSelectLocation(candidate.name, candidate.placeId, candidate.address, candidate.lat, candidate.lng)}
                                  className="w-full border-b border-gray-100 px-3 py-2.5 text-left last:border-0 hover:bg-blue-50 active:bg-blue-100"
                                >
                                  <span className="block text-sm text-gray-800">{candidate.name}</span>
                                  {candidate.address && (
                                    <span className="block text-xs text-gray-500 mt-0.5">{candidate.address}</span>
                                  )}
                                  {candidate.distanceKm !== undefined && (
                                    <span className="text-xs text-gray-400">{candidate.distanceKm.toFixed(1)}km</span>
                                  )}
                                </button>
                              ))}

                              {filteredCandidates.length === 0 && !placeCandidates.cacheLoading && (
                                <p className="px-3 py-2.5 text-sm text-gray-400">{t('registerLocation.noCandidates')}</p>
                              )}

                              {placeCandidates.address !== null && (
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleSelectAddressOnly(placeCandidates.address!)}
                                  className="w-full border-t border-gray-100 bg-gray-50 px-3 py-2.5 text-left text-sm text-gray-600 hover:bg-gray-100"
                                >
                                  {t('registerLocation.addressOnly', { address: placeCandidates.address })}
                                </button>
                              )}
                            </div>

                            {placeCandidates.cacheLoading && (
                              <div className="border-t border-blue-100 bg-blue-50 px-3 py-1.5">
                                <p className="text-xs italic text-blue-500">{t('registerLocation.cacheLoading')}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {locationUiState === 'loading' && (
                        <p className="text-xs text-gray-400">{t('registerLocation.loading')}</p>
                      )}
                      {locationUiState === 'failed' && (
                        <p className="text-xs text-gray-500">{t('registerLocation.failed')}</p>
                      )}

                      <button
                        type="button"
                        onClick={() => { setLocationUiState('idle'); setSearchQuery(''); setShowDropdown(false) }}
                        className="text-xs text-gray-400 underline"
                      >
                        {t('registerLocation.cancel')}
                      </button>
                    </>
                  )}
                </div>
              )}

              {editAddress && (
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">{t('productInfo.address')}</label>
                  <input
                    type="text"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    onBlur={() => {
                      if (editAddress.trim()) {
                        onRegisterLocation?.(editStoreName, undefined, editAddress.trim())
                        showSaved()
                      }
                    }}
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                  />
                </div>
              )}
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

        {/* OCR: 全アレルギー判定結果（NG 個別 / 注意まとめ / 注意喚起まとめ に分割） */}
        {result.type === 'ocr' && (
          <>
            {result.data.results.length === 0 ? (
              <p className="text-sm lg:text-base text-gray-500">{t('noAllergenSetting')}</p>
            ) : (() => {
              // contains（🔴 NG）: 個別表示
              const containsItems = result.data.results.filter(
                r => r.judgment !== 'なし' && r.detection_type === 'contains'
              )
              // partial（🟡 注意）: まとめて1行表示
              const partialItems = result.data.results.filter(
                r => r.judgment !== 'なし' && r.detection_type === 'partial'
              )
              // may_contain（🟠 注意喚起）: まとめて1行表示
              const mayContainItems = result.data.results.filter(
                r => r.judgment !== 'なし' && r.detection_type === 'may_contain'
              )
              const hasNgSection = containsItems.length > 0 || partialItems.length > 0
              return (
                <div className="space-y-4" aria-label={t('allergenListLabel')}>
                  {judgment === 'なし' && (
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
            onBlur={() => { onPatchHistory?.({ memo: editMemo.trim() || null }); showSaved() }}
            placeholder={t('productInfo.memoPlaceholder')}
            rows={2}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-400 resize-none"
          />
        </div>

        {/* サムネイル表示 + 再撮影ボタン */}
        {onRetakeThumbnail && (
          <div className="flex items-center gap-3">
            {thumbnailUrl ? (
              <button
                type="button"
                onClick={() => setThumbnailExpanded(true)}
                aria-label={t('productInfo.thumbnailExpand')}
                className="shrink-0 rounded overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl}
                  alt=""
                  className="h-16 w-16 object-cover"
                />
              </button>
            ) : (
              <div className="h-16 w-16 rounded bg-gray-100 shrink-0" />
            )}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">{t('productInfo.thumbnail')}</span>
              <button
                type="button"
                onClick={onRetakeThumbnail}
                className="text-sm text-blue-600 hover:text-blue-800 text-left"
              >
                {t('productInfo.retakeThumbnail')}
              </button>
            </div>
          </div>
        )}

        {/* サムネイル拡大ライトボックス */}
        {thumbnailExpanded && thumbnailUrl && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('productInfo.thumbnailExpand')}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={() => setThumbnailExpanded(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailUrl}
              alt=""
              className="max-w-full max-h-full object-contain rounded"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={() => setThumbnailExpanded(false)}
              aria-label={t('productInfo.thumbnailClose')}
              className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white text-xl hover:bg-white/30 transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* 楽天購入リンク（楽天 DB 由来の JAN キャッシュヒット時のみ表示） */}
        {itemUrl && (
          <a
            href={itemUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center py-2 px-4 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            {t('rakutenBuy')}
          </a>
        )}

        {/* ⚠️ 安全設計: 全判定で常時表示（省略禁止）。NG 時は ngDisclaimer のみ（2重表示を避ける） */}
        {isNg ? (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
            <p className="text-sm lg:text-base text-red-800">
              {t('ngDisclaimer')}
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
            <p className="text-sm lg:text-base text-amber-800 font-medium">
              {t('caution')}
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

        {/* 商品名未入力の即時警告（「もう一度スキャンする」押下前から常時表示） */}
        {editProductName.trim() === '' && !showDiscardConfirm && (
          <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2.5">
            <p className="text-sm text-orange-800">{t('productInfo.noNameWarning')}</p>
          </div>
        )}

        {/* 閉じる / 破棄確認 */}
        {showDiscardConfirm ? (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-3 space-y-2">
            <p className="text-sm text-orange-800">{t('productInfo.discardConfirm')}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  vibrateIfAndroid(30)
                  onDiscard ? onDiscard() : onReset()
                }}
                className="flex-1 py-2 rounded-lg border border-orange-300 text-sm text-orange-700 bg-white"
              >
                {t('productInfo.discardAndReturn')}
              </button>
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="flex-1 py-2 rounded-lg bg-blue-600 text-sm text-white font-medium"
              >
                {t('productInfo.enterProductName')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              vibrateIfAndroid(30)
              if (editProductName.trim() === '') {
                setShowDiscardConfirm(true)
                setProductInfoOpen(true)
              } else {
                onReset()
              }
            }}
            className="w-full py-2.5 rounded-lg border border-gray-300 text-sm lg:text-base text-gray-600"
          >
            {t('scanAgain')}
          </button>
        )}
      </div>
    </div>
  )
}
