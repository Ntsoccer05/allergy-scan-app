import type { JudgmentShort } from '@/app/scan/scan.types'

/** マップタイルのスタイル URL（OpenFreeMap Liberty・無料）。 */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

/** ピンも現在地もない場合のフォールバック表示（日本全体）。 */
export const JAPAN_FALLBACK_CENTER = { lat: 38, lng: 137 } as const
export const JAPAN_FALLBACK_ZOOM = 4.5

/** ピン1件 or 現在地へ移動するときのズームレベル。 */
export const PIN_FOCUS_ZOOM = 14

/** fitBounds 時の余白（px）と最大ズーム。 */
export const FIT_BOUNDS_PADDING_PX = 48
export const FIT_BOUNDS_MAX_ZOOM = 15

/** 判定別のピン色（ng=赤 / partial=黄 / ok=緑）。 */
export const PIN_COLORS: Record<JudgmentShort, string> = {
  ng: '#dc2626',
  partial: '#eab308',
  ok: '#16a34a',
} as const

/** マップピンのクライアントキャッシュ stale 時間（ms）。 */
export const MAP_LOCATIONS_STALE_TIME_MS = 60 * 1000

/** 経路ラインの色（Google Maps 青）。 */
export const ROUTE_LINE_COLOR = '#1a73e8'

/** 経路ラインの太さ（px）。 */
export const ROUTE_LINE_WIDTH = 5

/**
 * POI レイヤーの検出パターン。
 * OpenFreeMap Liberty スタイルの layer.id をこのパターンでフィルタリングする。
 */
export const POI_LAYER_PATTERNS = ['poi', 'restaurant', 'parking', 'shop', 'tourism', 'amenity'] as const

import type { TravelMode } from './map.types'

/** Google Maps の travelmode パラメータへのマッピング（cycling は Google Maps では bicycling）。 */
const GOOGLE_MAPS_TRAVEL_MODE: Record<TravelMode, string> = {
  driving: 'driving',
  transit: 'transit',
  walking: 'walking',
  cycling: 'bicycling',
}

/** 全移動手段で Google Maps へ誘導する URL を生成する。 */
export const buildGoogleMapsUrl = (
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: TravelMode,
): string =>
  `https://www.google.com/maps/dir/?api=1` +
  `&origin=${from.lat},${from.lng}` +
  `&destination=${to.lat},${to.lng}` +
  `&travelmode=${GOOGLE_MAPS_TRAVEL_MODE[mode]}`
