import { useCallback, useState } from 'react'
import { getRoute } from '@/lib/api/routing.api'
import type { LatLng, RouteResponse, TravelMode } from '@/app/map/map.types'

type UseRouteReturn = {
  route: RouteResponse | null
  isLoading: boolean
  error: string | null
  fetchRoute: (from: LatLng, to: LatLng, mode: Exclude<TravelMode, 'transit'>) => Promise<void>
  clearRoute: () => void
}

export const useRoute = (): UseRouteReturn => {
  const [route, setRoute] = useState<RouteResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRoute = useCallback(async (
    from: LatLng,
    to: LatLng,
    mode: Exclude<TravelMode, 'transit'>,
  ) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getRoute({
        fromLat: from.lat,
        fromLng: from.lng,
        toLat: to.lat,
        toLng: to.lng,
        mode,
      })
      setRoute(result)
    } catch {
      setError('route.error')
      setRoute(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearRoute = useCallback(() => {
    setRoute(null)
    setError(null)
  }, [])

  return { route, isLoading, error, fetchRoute, clearRoute }
}
