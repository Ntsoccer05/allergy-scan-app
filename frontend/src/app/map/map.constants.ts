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

/** 現在地取得のタイムアウト（ms）。 */
export const GEOLOCATION_TIMEOUT_MS = 5000

/** マップピンのクライアントキャッシュ stale 時間（ms）。 */
export const MAP_LOCATIONS_STALE_TIME_MS = 60 * 1000
