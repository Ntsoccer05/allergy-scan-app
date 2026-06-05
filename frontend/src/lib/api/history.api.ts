import type {
  CreateHistoryBody,
  HistoryFilter,
  HistoryItem,
  HistoryListResponse,
  PatchHistoryBody,
} from '@/app/history/history.types'
import { apiFetch } from './api-client'

type GetHistoryParams = {
  filter?: HistoryFilter
  before?: string
}

export const getHistory = async (
  params: GetHistoryParams = {},
): Promise<HistoryListResponse> => {
  const query = new URLSearchParams()
  if (params.filter && params.filter !== 'all') {
    query.set('judgment', params.filter)
  }
  if (params.before) {
    query.set('before', params.before)
  }

  const path = `/history${query.toString() ? `?${query.toString()}` : ''}`
  const res = await apiFetch(path)
  return res.json() as Promise<HistoryListResponse>
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
  location: { store_name: string; lat: number; lng: number },
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

export type PublicHistoryItem = {
  id: string
  product_name: string | null
  judgment: 'ng' | 'partial' | 'ok'
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
