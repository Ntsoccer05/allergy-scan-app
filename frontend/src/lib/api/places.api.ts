import type { StoreCandidate } from '@/app/scan/scan.types'
import { apiFetch } from './api-client'

/** GET /places/candidates のレスポンス型。 */
export type PlaceCandidatesResponse = {
  /** 国土地理院 逆ジオコーダによる住所（解決できなかった場合は null） */
  address: string | null
  /** Places プロバイダーによる施設候補 */
  candidates: StoreCandidate[]
}

/**
 * GET /places/candidates: 場所登録用の住所・施設候補を取得する。
 * Places API はコール課金のため、ユーザーの「場所を登録」操作時にのみ呼ぶこと（00320）。
 */
export const getPlaceCandidates = async (
  lat: number,
  lng: number,
): Promise<PlaceCandidatesResponse> => {
  const query = new URLSearchParams({ lat: String(lat), lng: String(lng) })
  const res = await apiFetch(`/places/candidates?${query.toString()}`)
  return res.json() as Promise<PlaceCandidatesResponse>
}
