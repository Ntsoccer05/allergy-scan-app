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
  scannedAt: string
  location?: { store_name: string; lat: number; lng: number } | null
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
  location?: { store_name: string; lat: number; lng: number }
}

/** PATCH /history/:id のリクエストボディ型。 */
export type PatchHistoryBody = {
  product_name?: string | null
  store_name?: string | null
  memo?: string | null
  is_public?: boolean
  thumbnail_url?: string | null
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
  updated_at: string
  /** expires_at < NOW() の場合 true（R6）。 */
  is_expired: boolean
}

/** GET /products/others のレスポンス型。 */
export type OthersProductListResponse = {
  items: OthersProductItem[]
  next_cursor: string | null
}
