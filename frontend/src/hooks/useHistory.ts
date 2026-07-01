'use client'

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { HistoryFilter, HistoryGroup, HistoryGroupListResponse, PatchHistoryBody } from '@/app/history/history.types'
import { SEARCH_DEBOUNCE_MS } from '@/app/history/history.constants'
import { bulkDeleteHistory, deleteHistory, getHistory, patchHistory } from '@/lib/api/history.api'

/** 履歴検索の入力値（商品名キーワード + 店舗名フィルタ）。 */
export type HistorySearch = {
  q: string
  store: string
}

const EMPTY_SEARCH: HistorySearch = { q: '', store: '' }

type UseHistoryReturn = {
  items: HistoryGroup[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  filter: HistoryFilter
  setFilter: (filter: HistoryFilter) => void
  search: HistorySearch
  setSearch: (search: HistorySearch) => void
  updateHistoryMutation: ReturnType<typeof useMutation<void, Error, { id: string } & PatchHistoryBody>>
  deleteHistoryMutation: ReturnType<typeof useMutation<void, Error, string>>
  bulkDeleteHistoryMutation: ReturnType<typeof useMutation<void, Error, string[]>>
}

export const useHistory = (): UseHistoryReturn => {
  const [filter, setFilter] = useState<HistoryFilter>('all')
  // search: 入力値（即時反映・UI 用）/ debouncedSearch: API クエリに使う値
  const [search, setSearch] = useState<HistorySearch>(EMPTY_SEARCH)
  const [debouncedSearch, setDebouncedSearch] = useState<HistorySearch>(EMPTY_SEARCH)
  const queryClient = useQueryClient()

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
    HistoryGroupListResponse,
    Error,
    HistoryGroup[],
    [string, HistoryFilter, string, string],
    string | undefined
  >({
    queryKey: ['history', filter, debouncedSearch.q, debouncedSearch.store],
    queryFn: ({ pageParam }) =>
      getHistory({
        filter,
        before: pageParam,
        q: debouncedSearch.q || undefined,
        store: debouncedSearch.store || undefined,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.next_before ?? undefined,
    select: (data) =>
      data.pages.flatMap((page) => page.items),
  })

  const updateHistoryMutation = useMutation<void, Error, { id: string } & PatchHistoryBody>({
    mutationFn: ({ id, ...data }) => patchHistory(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['history'] })
    },
  })

  const deleteHistoryMutation = useMutation<void, Error, string>({
    mutationFn: (id) => deleteHistory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['history'] })
    },
  })

  const bulkDeleteHistoryMutation = useMutation<void, Error, string[]>({
    mutationFn: (ids) => bulkDeleteHistory(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['history'] })
    },
  })

  const items: HistoryGroup[] = data ?? []

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
    updateHistoryMutation,
    deleteHistoryMutation,
    bulkDeleteHistoryMutation,
  }
}
