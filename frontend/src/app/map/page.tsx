'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner'
import { useMapLocations } from '@/hooks/useMapLocations'
import type { MapPinView } from '@/components/organisms/MapView'
import { buildGoogleMapsUrl } from './map.constants'
import type { JudgmentShort } from '@/app/scan/scan.types'
import type { LatLng, MapPin, PublicMapPin, TravelMode } from './map.types'

// maplibre-gl は SSR 不可のためクライアントサイドでのみ読み込む
const MapView = dynamic(
  () => import('@/components/organisms/MapView').then((m) => m.MapView),
  { ssr: false },
)

const JUDGMENT_EMOJI: Record<'ng' | 'partial' | 'ok', string> = {
  ng: '🔴',
  partial: '🟡',
  ok: '✅',
}

const JUDGMENT_PRIORITY: Record<JudgmentShort, number> = { ng: 0, partial: 1, ok: 2 }

const TRAVEL_MODES: { mode: TravelMode; labelKey: string }[] = [
  { mode: 'driving', labelKey: 'route.driving' },
  { mode: 'transit', labelKey: 'route.transit' },
  { mode: 'walking', labelKey: 'route.walking' },
  { mode: 'cycling', labelKey: 'route.cycling' },
]

// ResultCard と同じ最小・最大
const SHEET_MIN_HEIGHT = 64
const getSheetMaxHeight = (): number =>
  typeof window !== 'undefined' ? window.innerHeight - 64 : 700

/** ドラッグハンドル高さ（pt-2 pb-1 + バー）*/
const DRAG_H = 20
/** リスト: ヘッダー（店舗名 + 件数テキスト）*/
const LIST_HEADER_H = 52
/** リスト: 1行あたりの高さ（py-3=24 + h-12=48）*/
const LIST_ITEM_H = 72
/** 詳細: ヘッダー行（戻る/閉じるボタン行）*/
const DETAIL_HEADER_H = 44
/** 詳細: 商品情報行（h-16 サムネ + テキスト）*/
const DETAIL_PRODUCT_H = 88
/** 詳細: アレルゲンチップ行（1行分）*/
const DETAIL_CHIPS_H = 44
/** 詳細: pb-6 */
const DETAIL_BOTTOM_H = 24
/** 件数ベースで初期高さを計算（最大 340px）*/
const computeInitialHeight = (state: SheetState): number => {
  if (state.mode === 'list') {
    return Math.min(340, DRAG_H + LIST_HEADER_H + state.group.length * LIST_ITEM_H)
  }
  const pin = state.group[state.index]
  const hasChips = pin.source === 'mine' && pin.detected.length > 0
  return Math.min(
    340,
    DRAG_H + DETAIL_HEADER_H + DETAIL_PRODUCT_H + (hasChips ? DETAIL_CHIPS_H : 0) + DETAIL_BOTTOM_H,
  )
}

type PinSource = 'mine' | 'public'

type PagePin = MapPinView & {
  source: PinSource
  product_name: string | null
  thumbnail_url: string | null
  store_name: string | null
  scanned_at: string
  detected: string[]
  allergens: { contains: string[]; partial: string[] } | null
}

const toPagePin = (pin: MapPin | PublicMapPin, source: PinSource): PagePin => ({
  id: pin.id,
  lat: pin.lat,
  lng: pin.lng,
  judgment: pin.judgment,
  source,
  product_name: pin.product_name,
  thumbnail_url: pin.thumbnail_url,
  store_name: pin.store_name,
  scanned_at: pin.scanned_at,
  detected: 'detected' in pin ? pin.detected : [],
  allergens: 'allergens' in pin ? pin.allergens : null,
})

const locationKey = (lat: number, lng: number) =>
  `${lat.toFixed(6)}_${lng.toFixed(6)}`

type SheetState =
  | { mode: 'list'; group: PagePin[] }
  | { mode: 'detail'; group: PagePin[]; index: number }

export default function MapPage() {
  const t = useTranslations('map')
  const { data, isLoading, isError } = useMapLocations()

  const [showMine, setShowMine] = useState(true)
  const [showPublic, setShowPublic] = useState(true)
  const [sheetState, setSheetState] = useState<SheetState | null>(null)
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [showPoi, setShowPoi] = useState(true)
  const [selectedTravelMode, setSelectedTravelMode] = useState<TravelMode | null>(null)

  // ── ドラッグリサイズ（ResultCard と同じパターン）──────────────
  const [panelHeight, setPanelHeight] = useState<number | null>(null)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(0)

  // シートが開く・モードが変わるたびに件数ベースの初期高さにリセット
  // useLayoutEffect でペイント前に確定させてちらつきを防ぐ
  useLayoutEffect(() => {
    if (sheetState) {
      setPanelHeight(computeInitialHeight(sheetState))
    } else {
      setPanelHeight(null)
    }
  // sheetState?.mode が変わるたびに再計算（detail の index 変化は再計算不要）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetState?.mode])

  const handleDragStart = (clientY: number): void => {
    dragStartY.current = clientY
    dragStartHeight.current = panelHeight ?? SHEET_MIN_HEIGHT

    const onMouseMove = (e: MouseEvent): void => {
      const delta = dragStartY.current - e.clientY
      setPanelHeight(
        Math.max(SHEET_MIN_HEIGHT, Math.min(getSheetMaxHeight(), dragStartHeight.current + delta)),
      )
    }
    const onTouchMove = (e: TouchEvent): void => {
      const currentY = e.touches[0]?.clientY ?? dragStartY.current
      const delta = dragStartY.current - currentY
      setPanelHeight(
        Math.max(SHEET_MIN_HEIGHT, Math.min(getSheetMaxHeight(), dragStartHeight.current + delta)),
      )
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
  // ─────────────────────────────────────────────────────────────

  const pins = useMemo<PagePin[]>(() => {
    if (!data) return []
    return [
      ...(showMine ? data.mine.map((pin) => toPagePin(pin, 'mine')) : []),
      ...(showPublic ? data.public.map((pin) => toPagePin(pin, 'public')) : []),
    ]
  }, [data, showMine, showPublic])

  const locationGroups = useMemo(() => {
    const groups = new Map<string, PagePin[]>()
    pins.forEach((pin) => {
      const key = locationKey(pin.lat, pin.lng)
      const group = groups.get(key) ?? []
      group.push(pin)
      groups.set(key, group)
    })
    return groups
  }, [pins])

  const groupedPins = useMemo<MapPinView[]>(() => {
    return Array.from(locationGroups.entries()).map(([key, group]) => {
      const worstPin = group.reduce((worst, pin) =>
        JUDGMENT_PRIORITY[pin.judgment] < JUDGMENT_PRIORITY[worst.judgment] ? pin : worst,
      )
      return {
        id: `group_${key}`,
        lat: group[0].lat,
        lng: group[0].lng,
        judgment: worstPin.judgment,
      }
    })
  }, [locationGroups])

  const groupById = useMemo(() => {
    const map = new Map<string, PagePin[]>()
    groupedPins.forEach((gpin) => {
      const key = gpin.id.replace(/^group_/, '')
      map.set(gpin.id, locationGroups.get(key) ?? [])
    })
    return map
  }, [groupedPins, locationGroups])

  const handlePinClick = (pin: MapPinView) => {
    setSelectedTravelMode(null)
    const group = groupById.get(pin.id) ?? []
    if (group.length === 0) return
    setSheetState(
      group.length === 1
        ? { mode: 'detail', group, index: 0 }
        : { mode: 'list', group },
    )
  }

  const handleCloseSheet = () => {
    setSheetState(null)
    setSelectedTravelMode(null)
  }

  const handleSelectListItem = (index: number) => {
    if (sheetState?.mode !== 'list') return
    setSelectedTravelMode(null)
    setSheetState({ mode: 'detail', group: sheetState.group, index })
  }

  const handleBackToList = () => {
    if (sheetState?.mode !== 'detail') return
    setSelectedTravelMode(null)
    setSheetState({ mode: 'list', group: sheetState.group })
  }

  const handleRouteMode = (mode: TravelMode) => {
    if (sheetState?.mode !== 'detail' || !userLocation) return
    const pin = sheetState.group[sheetState.index]
    setSelectedTravelMode(mode)
    const url = buildGoogleMapsUrl(userLocation, { lat: pin.lat, lng: pin.lng }, mode)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const detailPin =
    sheetState?.mode === 'detail' ? sheetState.group[sheetState.index] : null

  const formattedDate = (scannedAt: string) =>
    new Date(scannedAt).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

  const panelStyle = {
    height: panelHeight !== null ? `${panelHeight}px` : undefined,
  }

  return (
    <main className="relative h-[calc(100dvh-3.5rem)] lg:h-dvh">
      {/* 地図本体 */}
      <div className="absolute inset-0">
        <MapView
          pins={groupedPins}
          onPinClick={handlePinClick}
          onGeolocate={(lat, lng) => setUserLocation({ lat, lng })}
          routeLine={null}
          showPoi={showPoi}
        />
      </div>

      {/* 上部バー */}
      <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-4 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => setShowMine((prev) => !prev)}
            aria-pressed={showMine}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium shadow transition-colors ${
              showMine ? 'bg-blue-600 text-white' : 'bg-white text-gray-500'
            }`}
          >
            {t('toggle.mine')}
          </button>
          <button
            type="button"
            onClick={() => setShowPublic((prev) => !prev)}
            aria-pressed={showPublic}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium shadow transition-colors ${
              showPublic ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500'
            }`}
          >
            {t('toggle.public')}
          </button>
          <button
            type="button"
            onClick={() => setShowPoi((prev) => !prev)}
            aria-pressed={showPoi}
            className={`ml-auto shrink-0 px-3 py-1.5 rounded-full text-sm font-medium shadow transition-colors ${
              showPoi ? 'bg-white text-gray-700' : 'bg-gray-200 text-gray-400'
            }`}
          >
            {t('poi.toggle')}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <LoadingSpinner />
        </div>
      )}
      {isError && (
        <p className="absolute top-20 left-4 right-4 z-10 text-center text-sm text-red-600 bg-white/90 rounded-xl py-3 shadow">
          {t('error')}
        </p>
      )}

      {/* ボトムシート（ResultCard と同じ: bottom-0 left-0 right-0 / rounded-t-2xl） */}
      {sheetState && (
        <div
          style={panelStyle}
          className="absolute bottom-0 left-0 right-0 z-10 bg-white rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* ドラッグハンドル */}
          <div
            onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
            onMouseDown={(e) => handleDragStart(e.clientY)}
            className="flex justify-center pt-2 pb-1 cursor-ns-resize touch-none select-none shrink-0"
          >
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* スクロール可能なコンテンツ */}
          <div className="flex-1 overflow-y-auto">

            {/* ===== リスト表示 ===== */}
            {sheetState.mode === 'list' && (
              <>
                <div className="flex items-center gap-2 px-4 pt-1 pb-2">
                  <div className="flex-1 min-w-0">
                    {sheetState.group[0].store_name && (
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {t('storeName', { store: sheetState.group[0].store_name })}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">
                      {t('card.items', { count: sheetState.group.length })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseSheet}
                    aria-label={t('card.close')}
                    className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <ul className="divide-y divide-gray-100">
                  {sheetState.group.map((pin, index) => (
                    <li key={pin.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectListItem(index)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                      >
                        {pin.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={pin.thumbnail_url}
                            alt={pin.product_name ?? ''}
                            className="h-12 w-12 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-gray-100 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base leading-none">{JUDGMENT_EMOJI[pin.judgment]}</span>
                            {pin.source === 'public' && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                                {t('card.publicBadge')}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {pin.product_name ?? t('card.unnamed')}
                          </p>
                          <time className="block text-xs text-gray-400" dateTime={pin.scanned_at}>
                            {formattedDate(pin.scanned_at)}
                          </time>
                        </div>
                        <span className="text-gray-300 text-lg shrink-0">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* ===== 詳細表示 ===== */}
            {sheetState.mode === 'detail' && detailPin && (
              <div className="px-4 pb-6 space-y-3">
                <div className="flex items-center justify-between pt-1">
                  {sheetState.group.length > 1 ? (
                    <button
                      type="button"
                      onClick={handleBackToList}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      ‹ {t('card.backToList')}
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={handleCloseSheet}
                    aria-label={t('card.close')}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex items-start gap-3">
                  {detailPin.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={detailPin.thumbnail_url}
                      alt={detailPin.product_name ?? ''}
                      className="h-16 w-16 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-gray-100 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-base">
                      <span>{JUDGMENT_EMOJI[detailPin.judgment]}</span>
                      {detailPin.source === 'public' && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-normal bg-green-100 text-green-700">
                          {t('card.publicBadge')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 truncate">
                      {detailPin.product_name ?? t('card.unnamed')}
                    </p>
                    {detailPin.store_name && (
                      <p className="text-xs text-gray-500 truncate">
                        {t('storeName', { store: detailPin.store_name })}
                      </p>
                    )}
                    <time className="block text-xs text-gray-400" dateTime={detailPin.scanned_at}>
                      {formattedDate(detailPin.scanned_at)}
                    </time>
                  </div>
                </div>

                {detailPin.source === 'mine' && detailPin.detected.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {detailPin.detected.map((allergen) => {
                      const isNg = detailPin.allergens?.contains.includes(allergen) ?? true
                      const isPartial = !isNg && (detailPin.allergens?.partial.includes(allergen) ?? false)
                      const chipClass = isNg
                        ? 'bg-red-50 text-red-700'
                        : isPartial
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-gray-50 text-gray-700'
                      const chipEmoji = isNg ? '🔴' : isPartial ? '🟡' : ''
                      return (
                        <li
                          key={allergen}
                          className={`text-sm font-medium rounded-full px-3 py-1 ${chipClass}`}
                        >
                          {chipEmoji}{allergen}
                        </li>
                      )
                    })}
                  </ul>
                )}

                {userLocation && (
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex justify-around">
                      {TRAVEL_MODES.map(({ mode, labelKey }) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => handleRouteMode(mode)}
                          aria-label={t(labelKey)}
                          className={`flex items-center justify-center p-3 rounded-xl transition-colors ${
                            selectedTravelMode === mode ? 'bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`block w-6 h-6 ${selectedTravelMode === mode ? 'bg-blue-600' : 'bg-gray-400'}`}
                            style={{
                              maskImage: `url(/icons/maps/${mode}.svg)`,
                              maskSize: 'contain',
                              maskRepeat: 'no-repeat',
                              maskPosition: 'center',
                              WebkitMaskImage: `url(/icons/maps/${mode}.svg)`,
                              WebkitMaskSize: 'contain',
                              WebkitMaskRepeat: 'no-repeat',
                              WebkitMaskPosition: 'center',
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </main>
  )
}
