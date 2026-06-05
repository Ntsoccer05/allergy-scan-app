import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { getPublicHistory, getPublicHistoryDigest } from '@/lib/api/history.api'

export const usePublicHistory = () =>
  useInfiniteQuery({
    queryKey: ['public-history'],
    queryFn: ({ pageParam }) =>
      getPublicHistory(20, pageParam as string | undefined),
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
    refetchInterval: 60 * 1000,
    staleTime: Infinity,
  })
