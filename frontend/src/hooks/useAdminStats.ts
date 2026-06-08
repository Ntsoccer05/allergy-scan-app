'use client'

import { useQuery } from '@tanstack/react-query'
import { getAdminStats } from '@/lib/api/admin.api'

const STATS_REFETCH_INTERVAL_MS = 60_000

export const useAdminStats = () =>
  useQuery({
    queryKey: ['admin-stats'],
    queryFn: getAdminStats,
    refetchInterval: STATS_REFETCH_INTERVAL_MS,
  })
