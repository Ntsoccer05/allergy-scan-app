'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner'
import { useMapLocations } from '@/hooks/useMapLocations'
import type { MapPinView } from '@/components/organisms/MapView'
import { buildGoogleMapsUrl } from './map.constants'
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

/**
 * Google Maps と同じ順序。SVGファイルは public/icons/maps/{mode}.svg に置く。
 * CSS mask-image で色を制御するため、img タグは使わない（fill="currentColor" 相当）。
 */
const TRAVEL_MODES: { mode: TravelMode; labelKey: string }[] = [
  { mode: 'driving', labelKey: 'route.driving' },
  { mode: 'transit', labelKey: 'route.transit' },
  { mode: 'walking', labelKey: 'route.walking' },
  { mode: 'cycling', labelKey: 'route.cycling' },
]

type PinSource = 'mine' | 'public'

type PagePin = MapPinView & {
  source: PinSource
  product_name: string | null
  thumbnail_url: string | null
  store_name: string | null
  scanned_at: string
  detected: string[]
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
})

export default function MapPage() {
  const t = useTranslations('map')
  const { data, isLoading, isError } = useMapLocations()

  const [showMine, setShowMine] = useState(true)
  const [showPublic, setShowPublic] = useState(true)
  const [selectedPin, setSelectedPin] = useState<PagePin | null>(null)
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [showPoi, setShowPoi] = useState(true)
  const [selectedTravelMode, setSelectedTravelMode] = useState<TravelMode | null>(null)

  const pins = useMemo<PagePin[]>(() => {
    if (!data) return []
    return [
      ...(showMine ? data.mine.map((pin) => toPagePin(pin, 'mine')) : []),
      ...(showPublic ? data.public.map((pin) => toPagePin(pin, 'public')) : []),
    ]
  }, [data, showMine, showPublic])

  const pinIndex = useMemo(() => {
    const index = new Map<string, PagePin>()
    pins.forEach((pin) => index.set(pin.id, pin))
    return index
  }, [pins])

  const handlePinClick = (pin: MapPinView) => {
    setSelectedTravelMode(null)
    setSelectedPin(pinIndex.get(pin.id) ?? null)
  }

  const handleCloseCard = () => {
    setSelectedPin(null)
    setSelectedTravelMode(null)
  }

  const handleRouteMode = (mode: TravelMode) => {
    if (!selectedPin || !userLocation) return
    setSelectedTravelMode(mode)
    const url = buildGoogleMapsUrl(userLocation, { lat: selectedPin.lat, lng: selectedPin.lng }, mode)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const formattedDate = selectedPin
    ? new Date(selectedPin.scanned_at).toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <main className="relative h-[calc(100dvh-3.5rem)] lg:h-dvh">
      {/* 地図本体 */}
      <div className="absolute inset-0">
        <MapView
          pins={pins}
          onPinClick={handlePinClick}
          onGeolocate={(lat, lng) => setUserLocation({ lat, lng })}
          routeLine={null}
          showPoi={showPoi}
        />
      </div>

      {/* 上部バー: ピン切替 + POI トグル */}
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

          {/* POI 表示切替（Google Maps のレイヤーボタンに相当） */}
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

      {/* 読み込み・エラー */}
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

      {/* ピン詳細 + 経路操作ボトムシート */}
      {selectedPin && (
        <div className="absolute bottom-4 left-4 right-4 z-10 animate-in slide-in-from-bottom-4 duration-200">
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            {/* ドラッグハンドル（Google Maps ライク） */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="px-4 pb-4 space-y-3">
              {/* ピン情報 */}
              <div className="flex items-start gap-3">
                {selectedPin.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedPin.thumbnail_url}
                    alt={selectedPin.product_name ?? ''}
                    className="h-16 w-16 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-lg bg-gray-100 shrink-0" />
                )}

                <div className="flex-1 min-w-0 space-y-1 pr-8">
                  <div className="flex items-center gap-2 font-semibold text-base">
                    <span>{JUDGMENT_EMOJI[selectedPin.judgment]}</span>
                    {selectedPin.source === 'public' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-normal bg-green-100 text-green-700">
                        {t('card.publicBadge')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 truncate">
                    {selectedPin.product_name ?? t('card.unnamed')}
                  </p>
                  {selectedPin.store_name && (
                    <p className="text-xs text-gray-500 truncate">
                      {t('storeName', { store: selectedPin.store_name })}
                    </p>
                  )}
                  <time className="block text-xs text-gray-400" dateTime={selectedPin.scanned_at}>
                    {formattedDate}
                  </time>
                </div>

                <button
                  type="button"
                  onClick={handleCloseCard}
                  className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
                  aria-label={t('card.close')}
                >
                  ✕
                </button>
              </div>

              {selectedPin.source === 'mine' && selectedPin.detected.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {selectedPin.detected.map((allergen) => (
                    <li
                      key={allergen}
                      className="text-sm font-medium bg-red-50 text-red-700 rounded-full px-3 py-1"
                    >
                      {allergen}
                    </li>
                  ))}
                </ul>
              )}

              {/* 交通手段セレクター（Google Maps と同じ Material Design SVG アイコン横並び・テキストなし） */}
              {userLocation && (
                <div className="border-t border-gray-100 pt-3">
                  <div className="flex justify-around">
                    {TRAVEL_MODES.map(({ mode, labelKey }) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleRouteMode(mode)}
                        // aria-label でテキストを保持してスクリーンリーダー対応（表示はアイコンのみ）
                        aria-label={t(labelKey)}
                        className={`flex items-center justify-center p-3 rounded-xl transition-colors disabled:opacity-50 ${
                          selectedTravelMode === mode
                            ? 'bg-blue-50'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        {/*
                          SVGファイルは public/icons/maps/{mode}.svg。
                          img タグだと CSS で色が変えられないため CSS mask-image を使う。
                          background-color が SVG の形でマスクされ、選択状態で青・非選択でグレーになる。
                        */}
                        <span
                          aria-hidden="true"
                          className={`block w-6 h-6 ${
                            selectedTravelMode === mode ? 'bg-blue-600' : 'bg-gray-400'
                          }`}
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
          </div>
        </div>
      )}
    </main>
  )
}
