'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner'
import { useMapLocations } from '@/hooks/useMapLocations'
import type { MapPinView } from '@/components/organisms/MapView'
import { GEOLOCATION_TIMEOUT_MS } from './map.constants'
import type { MapPin, PublicMapPin } from './map.types'

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

/** ピンの出所（mine は detected チップを表示する）。 */
type PinSource = 'mine' | 'public'

/** ページ内部で扱うピン（mine / public を統合した表示用モデル）。 */
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

  // 現在地が取れたら center に使う。失敗時は null のまま（ピン全体ビュー）
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        // 現在地が取れない場合はピン全体ビューのまま（エラー表示はしない）
      },
      { timeout: GEOLOCATION_TIMEOUT_MS },
    )
  }, [])

  const pins = useMemo<PagePin[]>(() => {
    if (!data) return []
    return [
      ...(showMine ? data.mine.map((pin) => toPagePin(pin, 'mine')) : []),
      ...(showPublic ? data.public.map((pin) => toPagePin(pin, 'public')) : []),
    ]
  }, [data, showMine, showPublic])

  // MapView からは MapPinView が返るため、id から PagePin を引き直す
  const pinIndex = useMemo(() => {
    const index = new Map<string, PagePin>()
    pins.forEach((pin) => index.set(pin.id, pin))
    return index
  }, [pins])

  const handlePinClick = (pin: MapPinView) => {
    setSelectedPin(pinIndex.get(pin.id) ?? null)
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
        <MapView center={center} pins={pins} onPinClick={handlePinClick} />
      </div>

      {/* ヘッダー + 表示切替トグル */}
      <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-4 pointer-events-none">
        <h1 className="text-xl font-bold text-gray-900 mb-2 drop-shadow-sm">
          {t('title')}
        </h1>
        <div className="flex gap-2 pointer-events-auto">
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
        </div>
      </div>

      {/* 読み込み・エラー・空状態 */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <LoadingSpinner />
        </div>
      )}
      {isError && (
        <p className="absolute top-24 left-4 right-4 z-10 text-center text-sm text-red-600 bg-white/90 rounded-xl py-3 shadow">
          {t('error')}
        </p>
      )}
      {!isLoading && !isError && pins.length === 0 && (
        <p className="absolute top-24 left-4 right-4 z-10 text-center text-sm text-gray-500 bg-white/90 rounded-xl py-3 shadow">
          {t('empty')}
        </p>
      )}

      {/* ピン詳細カード（画面下部・HistoryCard の見た目に寄せる） */}
      {selectedPin && (
        <div className="absolute bottom-4 left-4 right-4 z-10">
          <div className="relative bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 space-y-2">
            <button
              type="button"
              onClick={() => setSelectedPin(null)}
              className="absolute top-2 right-2 flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
              aria-label={t('card.close')}
            >
              ✕
            </button>

            <div className="flex items-start gap-3">
              {selectedPin.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedPin.thumbnail_url}
                  alt={selectedPin.product_name ?? ''}
                  className="h-16 w-16 rounded object-cover shrink-0"
                />
              ) : (
                <div className="h-16 w-16 rounded bg-gray-100 shrink-0" />
              )}

              <div className="flex-1 min-w-0 space-y-1 pr-9">
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

                <time
                  className="block text-xs text-gray-400"
                  dateTime={selectedPin.scanned_at}
                >
                  {formattedDate}
                </time>
              </div>
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
          </div>
        </div>
      )}
    </main>
  )
}
