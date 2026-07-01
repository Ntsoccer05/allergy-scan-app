import { apiFetch } from './api-client'
import type { RouteResponse, TravelMode } from '@/app/map/map.types'

type GetRouteParams = {
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  /** transit 以外の3モードをバックエンドへ送信する。 */
  mode: Exclude<TravelMode, 'transit'>
}

export const getRoute = async (params: GetRouteParams): Promise<RouteResponse> => {
  const { fromLat, fromLng, toLat, toLng, mode } = params
  const qs = new URLSearchParams({
    from_lat: String(fromLat),
    from_lng: String(fromLng),
    to_lat: String(toLat),
    to_lng: String(toLng),
    mode,
  })
  const res = await apiFetch(`/route?${qs}`)
  return res.json() as Promise<RouteResponse>
}
