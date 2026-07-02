/** 1件の履歴レコード（GET /history の items 要素）。 */
export type HistoryItem = {
  id: string
  userId: string
  productId: string | null
  productName: string | null
  judgment: 'ng' | 'partial' | 'ok'
  detected: string[]
  thumbnailUrl: string | null
  ocrImageUrl: string | null
  isPublic: boolean
  memo: string | null
  rawText: string | null
  scannedAt: string
  // lat/lng はみんなのスキャン由来のアイテムでは取得できないため省略可
  location?: { store_name: string; address?: string; lat?: number; lng?: number } | null
}

/** GET /history のレスポンス型。 */
export type HistoryListResponse = {
  items: HistoryItem[]
  next_before: string | null
}

/** POST /history のリクエストボディ型。 */
export type CreateHistoryBody = {
  product_id?: string
  product_name?: string
  judgment: 'ng' | 'partial' | 'ok'
  detected: string[]
  thumbnail_url?: string
  ocr_image_url?: string
  raw_text?: string
  location?: { store_name: string; lat: number; lng: number }
}

/** PATCH /history/:id のリクエストボディ型。 */
export type PatchHistoryBody = {
  product_name?: string | null
  store_name?: string | null
  memo?: string | null
  is_public?: boolean
  thumbnail_url?: string | null
  ocr_image_url?: string | null
}

/** 履歴フィルター型。 */
export type HistoryFilter = 'all' | 'ng' | 'partial' | 'ok'

/** GET /products/others の1件レコード型（R5・R6 準拠）。 */
export type OthersProductItem = {
  id: string
  product_name: string | null
  allergens: {
    contains: string[]
    partial: string[]
    components: string[]
  }
  judgment: 'ng' | 'partial' | 'ok'
  detected: string[]
  /** この商品の最新の公開スキャン履歴に紐づくサムネイル（なければ null）。 */
  thumbnail_url: string | null
  /** この商品の最新の公開スキャン履歴の店舗名（なければ null）。 */
  store_name: string | null
  /** 商品の原材料テキスト（詳細表示用）。 */
  raw_text: string | null
  updated_at: string
  /** expires_at < NOW() の場合 true（R6）。 */
  is_expired: boolean
}

/** GET /products/others の検索・フィルタ条件。 */
export type OthersSearchParams = {
  filter?: HistoryFilter
  q?: string
  store?: string
}

/** GET /products/others のレスポンス型。 */
export type OthersProductListResponse = {
  items: OthersProductItem[]
  next_cursor: string | null
}

/** GET /admin/products の1件レコード型（シードデータ JAN 商品）。 */
export type SystemProductItem = {
  id: string
  jan_code: string
  product_name: string | null
  allergens_contains: string[]
  allergens_partial: string[]
  scan_count: number
  updated_at: string
  judgment: 'ng' | 'partial' | 'ok'
  thumbnail_url: string | null
}

/** GET /admin/products のレスポンス型。 */
export type SystemProductListResponse = {
  items: SystemProductItem[]
  next_cursor: string | null
}

/** 商品単位グループ内の1スキャン。 */
export type ScanEntry = {
  id: string
  scannedAt: string
  location: { store_name: string; lat: number; lng: number } | null
  memo: string | null
  thumbnailUrl: string | null
  ocrImageUrl: string | null
  rawText: string | null
}

/** GET /history の新レスポンス型（商品単位グループ）。 */
export type HistoryGroup = {
  product: {
    id: string | null
    name: string | null
    allergens: {
      contains: string[]
      partial: string[]
      components: string[]
    }
    thumbnailUrl: string | null
    itemUrl: string | null
  }
  judgment: 'ng' | 'partial' | 'ok'
  detected: string[]
  scans: ScanEntry[]
  latestScanAt: string
}

/** GET /history の新レスポンス型。 */
export type HistoryGroupListResponse = {
  items: HistoryGroup[]
  next_before: string | null
}
