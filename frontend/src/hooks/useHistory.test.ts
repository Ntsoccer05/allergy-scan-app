import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor, act } from '@testing-library/react'
import React from 'react'
import { useHistory } from './useHistory'
import { getHistory } from '@/lib/api/history.api'
import type { HistoryListResponse } from '@/app/history/history.types'

jest.mock('@/lib/api/history.api')

const mockGetHistory = getHistory as jest.MockedFunction<typeof getHistory>

const makeItem = (id: string, scannedAt = '2026-05-18T00:00:00.000Z') => ({
  id,
  userId: 'user-1',
  productId: null,
  productName: `商品${id}`,
  judgment: 'ok' as const,
  detected: [],
  thumbnailUrl: null,
  ocrImageUrl: null,
  isPublic: false,
  memo: null,
  rawText: null,
  scannedAt,
})

const makeResponse = (
  ids: string[],
  next_before: string | null = null,
): HistoryListResponse => ({
  items: ids.map((id) => makeItem(id)),
  next_before,
})

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return Wrapper
}

describe('useHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('初回マウント時に getHistory を呼び出し items が反映される', async () => {
    mockGetHistory.mockResolvedValueOnce(makeResponse(['1', '2']))

    const { result } = renderHook(() => useHistory(), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockGetHistory).toHaveBeenCalledTimes(1)
    expect(result.current.items).toHaveLength(2)
    expect(result.current.items[0].id).toBe('1')
  })

  it('filter を ng に変更すると getHistory が ng で呼ばれ items がリセットされる', async () => {
    mockGetHistory
      .mockResolvedValueOnce(makeResponse(['1', '2']))
      .mockResolvedValueOnce(makeResponse(['3']))

    const { result } = renderHook(() => useHistory(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.setFilter('ng')
    })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1)
    })

    expect(mockGetHistory).toHaveBeenCalledWith({ filter: 'ng', before: undefined })
    expect(result.current.items[0].id).toBe('3')
  })

  it('fetchNextPage を呼び出すと before 付きで getHistory が呼ばれ items に追加される', async () => {
    const before = '2026-05-17T00:00:00.000Z'
    mockGetHistory
      .mockResolvedValueOnce(makeResponse(['1', '2'], before))
      .mockResolvedValueOnce(makeResponse(['3', '4']))

    const { result } = renderHook(() => useHistory(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.hasNextPage).toBe(true)

    act(() => {
      result.current.fetchNextPage()
    })

    await waitFor(() => {
      expect(result.current.items).toHaveLength(4)
    })

    expect(mockGetHistory).toHaveBeenCalledWith({ filter: 'all', before })
    expect(result.current.items[2].id).toBe('3')
  })

  it('hasNextPage が false のとき fetchNextPage を呼び出しても追加リクエストは送信されない', async () => {
    mockGetHistory.mockResolvedValueOnce(makeResponse(['1', '2'], null))

    const { result } = renderHook(() => useHistory(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.hasNextPage).toBe(false)

    act(() => {
      result.current.fetchNextPage()
    })

    await waitFor(() => {
      expect(mockGetHistory).toHaveBeenCalledTimes(1)
    })
  })
})
