import type { JudgmentShort } from '@/app/scan/scan.types'

/** GET /history/locations の自分のピン1件（raw_text・detected を含む）。 */
export type MapPin = {
  id: string
  product_name: string | null
  judgment: JudgmentShort
  detected: string[]
  allergens: { contains: string[]; partial: string[] } | null
  thumbnail_url: string | null
  store_name: string | null
  lat: number
  lng: number
  scanned_at: string
  raw_text: string | null
}

/** GET /history/locations の公開ピン1件（個人情報を含まない）。 */
export type PublicMapPin = Omit<MapPin, 'detected' | 'raw_text'>

/** GET /history/locations のレスポンス型。 */
export type MapLocationsResponse = {
  mine: MapPin[]
  public: PublicMapPin[]
}

/** GET /route のレスポンス型。 */
export type RouteResponse = {
  geometry: {
    type: 'LineString'
    coordinates: [number, number][]
  }
  distance_m: number
  duration_sec: number
}

/**
 * 移動手段。Google Maps と同じ順序で定義。
 * transit のみ Google Maps ディープリンクで処理し、それ以外はアプリ内で経路描画。
 */
export type TravelMode = 'driving' | 'transit' | 'walking' | 'cycling'

/** 現在地の座標。 */
export type LatLng = { lat: number; lng: number }
