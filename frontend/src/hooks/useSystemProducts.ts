'use client'

import { useEffect, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { HistoryFilter, SystemProductItem, SystemProductListResponse } from '@/app/history/history.types'
import { getSystemProducts } from '@/lib/api/admin.api'
import { SEARCH_DEBOUNCE_MS } from '@/app/history/history.constants'

type UseSystemProductsReturn = {
  items: SystemProductItem[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  filter: HistoryFilter
  setFilter: (f: HistoryFilter) => void
  search: string
  setSearch: (q: string) => void
}

export const useSystemProducts = (): UseSystemProductsReturn => {
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery<
    SystemProductListResponse,
    Error,
    SystemProductListResponse[],
    [string, HistoryFilter, string],
    string | undefined
  >({
    queryKey: ['admin-system-products', filter, debouncedSearch],
    queryFn: ({ pageParam }) =>
      getSystemProducts(pageParam, debouncedSearch || undefined, filter),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    select: (data) => data.pages,
  })

  const items: SystemProductItem[] = data?.flatMap((page) => page.items) ?? []

  return {
    items,
    isLoading,
    isFetchingNextPage,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
    filter,
    setFilter,
    search,
    setSearch,
  }
}
