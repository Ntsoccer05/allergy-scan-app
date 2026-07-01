import type {
  CreateHistoryBody,
  HistoryFilter,
  HistoryGroupListResponse,
  HistoryItem,
  PatchHistoryBody,
} from '@/app/history/history.types'
import type { JudgmentShort } from '@/app/scan/scan.types'
import type { MapLocationsResponse } from '@/app/map/map.types'
import { apiFetch } from './api-client'

type GetHistoryParams = {
  filter?: HistoryFilter
  before?: string
  /** 商品名の部分一致検索キーワード */
  q?: string
  /** 店舗名の部分一致フィルタ */
  store?: string
}

export const getHistory = async (
  params: GetHistoryParams = {},
): Promise<HistoryGroupListResponse> => {
  const query = new URLSearchParams()
  if (params.filter && params.filter !== 'all') {
    query.set('judgment', params.filter)
  }
  if (params.before) {
    query.set('before', params.before)
  }
  if (params.q) {
    query.set('q', params.q)
  }
  if (params.store) {
    query.set('store', params.store)
  }
  const path = `/history${query.toString() ? `?${query.toString()}` : ''}`
  const res = await apiFetch(path)
  return res.json() as Promise<HistoryGroupListResponse>
}

export const getMapLocations = async (): Promise<MapLocationsResponse> => {
  const res = await apiFetch('/history/locations')
  return res.json() as Promise<MapLocationsResponse>
}

export const postHistory = async (
  body: CreateHistoryBody,
): Promise<HistoryItem> => {
  const res = await apiFetch('/history', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return res.json() as Promise<HistoryItem>
}

export const patchHistoryLocation = async (
  historyId: string,
  location: { store_name: string; lat: number; lng: number; address?: string; place_id?: string },
): Promise<void> => {
  await apiFetch(`/history/${historyId}`, {
    method: 'PATCH',
    body: JSON.stringify({ location }),
  })
}

export const patchHistory = async (
  historyId: string,
  data: PatchHistoryBody,
): Promise<void> => {
  await apiFetch(`/history/${historyId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export const deleteHistory = async (historyId: string): Promise<void> => {
  await apiFetch(`/history/${historyId}`, {
    method: 'DELETE',
    // DELETE has no body, override Content-Type to avoid sending it
    headers: {},
  })
}

export const bulkDeleteHistory = async (ids: string[]): Promise<void> => {
  await apiFetch('/history/bulk', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  })
}

export type PublicHistoryItem = {
  id: string
  product_name: string | null
  judgment: JudgmentShort
  thumbnail_url: string | null
  store_name: string | null
  scanned_at: string
}

export const getPublicHistory = async (
  limit: number,
  before?: string,
): Promise<{ items: PublicHistoryItem[]; next_before: string | null }> => {
  const params = new URLSearchParams({
    limit: String(limit),
    ...(before ? { before } : {}),
  })
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/public/history?${params}`,
  )
  if (!res.ok) throw new Error('Failed to fetch public history')
  return res.json() as Promise<{ items: PublicHistoryItem[]; next_before: string | null }>
}

export const getPublicHistoryDigest = async (): Promise<{
  count: number
  last_updated_at: string | null
}> => {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/public/history/digest`,
  )
  if (!res.ok) throw new Error('Failed to fetch digest')
  return res.json() as Promise<{ count: number; last_updated_at: string | null }>
}
