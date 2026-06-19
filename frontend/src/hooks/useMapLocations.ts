'use client'

import { useQuery } from '@tanstack/react-query'
import type { MapLocationsResponse } from '@/app/map/map.types'
import { MAP_LOCATIONS_STALE_TIME_MS } from '@/app/map/map.constants'
import { getMapLocations } from '@/lib/api/history.api'

/** GET /history/locations（自分のピン + 公開ピン）を取得するフック。 */
export const useMapLocations = () =>
  useQuery<MapLocationsResponse, Error>({
    queryKey: ['history', 'locations'],
    queryFn: getMapLocations,
    staleTime: MAP_LOCATIONS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  })
