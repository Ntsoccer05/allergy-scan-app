/** GET /route のクエリパラメータ。 */
export type RouteQuery = {
  from_lat: string
  from_lng: string
  to_lat: string
  to_lng: string
  mode: 'driving' | 'walking' | 'cycling'
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

/** OSRM Public API レスポンス型（内部使用）。 */
export type OsrmRouteResponse = {
  code: string
  routes: Array<{
    geometry: { type: 'LineString'; coordinates: [number, number][] }
    legs: Array<{ distance: number; duration: number }>
  }>
}

/** OpenRouteService GeoJSON レスポンス型（内部使用）。 */
export type OrsRouteResponse = {
  features: Array<{
    geometry: { type: 'LineString'; coordinates: [number, number][] }
    properties: {
      summary: { distance: number; duration: number }
    }
  }>
}
