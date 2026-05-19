'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { HistoryFilter, HistoryItem, HistoryListResponse } from '@/app/history/history.types'
import { getHistory } from '@/lib/api/history.api'

type UseHistoryReturn = {
  items: HistoryItem[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  filter: HistoryFilter
  setFilter: (filter: HistoryFilter) => void
}

export const useHistory = (): UseHistoryReturn => {
  const [filter, setFilter] = useState<HistoryFilter>('all')

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery<
    HistoryListResponse,
    Error,
    HistoryListResponse[],
    [string, HistoryFilter],
    string | undefined
  >({
    queryKey: ['history', filter],
    queryFn: ({ pageParam }) => getHistory({ filter, before: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.next_before ?? undefined,
    select: (data) => data.pages,
  })

  const items: HistoryItem[] = data?.flatMap((page) => page.items) ?? []

  return {
    items,
    isLoading,
    isFetchingNextPage,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
    filter,
    setFilter,
  }
}
