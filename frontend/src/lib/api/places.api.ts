import type { StoreCandidate } from '@/app/scan/scan.types'
import { apiFetch } from './api-client'

/** GET /places/candidates のレスポンス型。 */
export type PlaceCandidatesResponse = {
  /** 国土地理院 逆ジオコーダによる住所（解決できなかった場合は null） */
  address: string | null
  /** Places プロバイダーによる施設候補 */
  candidates: StoreCandidate[]
  /**
   * true のとき、バックグラウンドでフル取得中。
   * 現在の候補は 1 ページ分のみで不完全な可能性がある。
   * 次回アクセス時に全件が揃う。
   */
  cacheLoading?: boolean
}

/**
 * GET /places/candidates: 場所登録用の住所・施設候補を取得する。
 * Places API はコール課金のため、ユーザーの「場所を登録」操作時にのみ呼ぶこと（00320）。
 * query を指定すると Overpass テキスト検索を使用する（無料）。
 */
export const getPlaceCandidates = async (
  lat: number,
  lng: number,
  query?: string,
): Promise<PlaceCandidatesResponse> => {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) })
  if (query) params.set('q', query)
  const res = await apiFetch(`/places/candidates?${params.toString()}`)
  return res.json() as Promise<PlaceCandidatesResponse>
}
