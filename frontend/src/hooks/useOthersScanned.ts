'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import type {
  OthersProductItem,
  OthersProductListResponse,
} from '@/app/history/history.types'
import { getOthersScanned } from '@/lib/api/products'

type UseOthersScannedReturn = {
  items: OthersProductItem[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
}

export const useOthersScanned = (): UseOthersScannedReturn => {
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
    [string],
    string | undefined
  >({
    queryKey: ['products-others'],
    queryFn: ({ pageParam }) => getOthersScanned(pageParam),
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
  }
}
