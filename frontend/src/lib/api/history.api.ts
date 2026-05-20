import type {
  CreateHistoryBody,
  HistoryFilter,
  HistoryItem,
  HistoryListResponse,
} from '@/app/history/history.types'
import { API_BASE_URL } from '@/lib/constants'

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

  const url = `${API_BASE_URL}/history${query.toString() ? `?${query.toString()}` : ''}`
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    throw new Error(`GET /history failed: ${res.status}`)
  }
  return res.json() as Promise<HistoryListResponse>
}

export const postHistory = async (
  body: CreateHistoryBody,
): Promise<HistoryItem> => {
  const res = await fetch(`${API_BASE_URL}/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`POST /history failed: ${res.status}`)
  }
  return res.json() as Promise<HistoryItem>
}

export const patchHistoryLocation = async (
  historyId: string,
  location: { store_name: string; lat: number; lng: number },
): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/history/${historyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ location }),
  })
  if (!res.ok) {
    throw new Error(`PATCH /history/${historyId} failed: ${res.status}`)
  }
}
