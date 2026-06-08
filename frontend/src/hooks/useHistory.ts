'use client'

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { HistoryFilter, HistoryItem, HistoryListResponse, PatchHistoryBody } from '@/app/history/history.types'
import { bulkDeleteHistory, deleteHistory, getHistory, patchHistory } from '@/lib/api/history.api'

type UseHistoryReturn = {
  items: HistoryItem[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  filter: HistoryFilter
  setFilter: (filter: HistoryFilter) => void
  updateHistoryMutation: ReturnType<typeof useMutation<void, Error, { id: string } & PatchHistoryBody>>
  deleteHistoryMutation: ReturnType<typeof useMutation<void, Error, string>>
  bulkDeleteHistoryMutation: ReturnType<typeof useMutation<void, Error, string[]>>
}

export const useHistory = (): UseHistoryReturn => {
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const queryClient = useQueryClient()

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

  const items: HistoryItem[] = data?.flatMap((page) => page.items) ?? []

  return {
    items,
    isLoading,
    isFetchingNextPage,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
    filter,
    setFilter,
    updateHistoryMutation,
    deleteHistoryMutation,
    bulkDeleteHistoryMutation,
  }
}
