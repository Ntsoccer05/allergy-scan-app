'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type {
  HistoryFilter,
  OthersProductItem,
  OthersProductListResponse,
} from '@/app/history/history.types'
import { SEARCH_DEBOUNCE_MS } from '@/app/history/history.constants'
import type { HistorySearch } from './useHistory'
import { getOthersScanned } from '@/lib/api/products'

const EMPTY_SEARCH: HistorySearch = { q: '', store: '' }

type UseOthersScannedReturn = {
  items: OthersProductItem[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  filter: HistoryFilter
  setFilter: (filter: HistoryFilter) => void
  search: HistorySearch
  setSearch: (search: HistorySearch) => void
}

export const useOthersScanned = (): UseOthersScannedReturn => {
  const [filter, setFilter] = useState<HistoryFilter>('all')
  // search: 入力値（即時反映・UI 用）/ debouncedSearch: API クエリに使う値
  const [search, setSearch] = useState<HistorySearch>(EMPTY_SEARCH)
  const [debouncedSearch, setDebouncedSearch] = useState<HistorySearch>(EMPTY_SEARCH)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery<
    OthersProductListResponse,
    Error,
    OthersProductListResponse[],
    [string, HistoryFilter, string, string],
    string | undefined
  >({
    queryKey: ['products-others', filter, debouncedSearch.q, debouncedSearch.store],
    queryFn: ({ pageParam }) =>
      getOthersScanned({
        cursor: pageParam,
        filter,
        q: debouncedSearch.q || undefined,
        store: debouncedSearch.store || undefined,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    select: (data) => data.pages,
  })

  const items: OthersProductItem[] =
    data?.flatMap((page) => page.items) ?? []

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
