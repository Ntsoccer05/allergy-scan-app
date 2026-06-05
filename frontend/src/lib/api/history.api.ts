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
