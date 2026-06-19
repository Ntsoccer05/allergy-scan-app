import type { JudgmentShort } from '@/app/scan/scan.types'

/** GET /history/locations の自分のピン1件（raw_text・detected を含む）。 */
export type MapPin = {
  id: string
  product_name: string | null
  judgment: JudgmentShort
  detected: string[]
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
