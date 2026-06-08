import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { getPublicHistory, getPublicHistoryDigest } from '@/lib/api/history.api'
import { DIGEST_REFETCH_INTERVAL_MS, PUBLIC_HISTORY_PAGE_LIMIT } from '@/app/history/history.constants'

export const usePublicHistory = () =>
  useInfiniteQuery({
    queryKey: ['public-history'],
    queryFn: ({ pageParam }) =>
      getPublicHistory(PUBLIC_HISTORY_PAGE_LIMIT, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.next_before ?? undefined,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

export const usePublicHistoryDigest = () =>
  useQuery({
    queryKey: ['public-history-digest'],
    queryFn: getPublicHistoryDigest,
    refetchInterval: DIGEST_REFETCH_INTERVAL_MS,
    staleTime: Infinity,
  })
