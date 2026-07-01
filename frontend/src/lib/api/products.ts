import type {
  OthersProductItem,
  OthersProductListResponse,
  OthersSearchParams,
} from '@/app/history/history.types'
import { apiFetch } from './api-client'

export type { OthersProductItem, OthersProductListResponse }

/**
 * GET /products/others を呼び出す（R7）。
 * cursor / judgment / q / store をクエリパラメータとして付与する（R4）。
 */
export const getOthersScanned = async (
  params: OthersSearchParams & { cursor?: string } = {},
): Promise<OthersProductListResponse> => {
  const query = new URLSearchParams()
  if (params.cursor) {
    query.set('cursor', params.cursor)
  }
  if (params.filter && params.filter !== 'all') {
    query.set('judgment', params.filter)
  }
  if (params.q) {
    query.set('q', params.q)
  }
  if (params.store) {
    query.set('store', params.store)
  }
  const path = `/products/others${query.toString() ? `?${query.toString()}` : ''}`
  const res = await apiFetch(path, { headers: {} })
  return res.json() as Promise<OthersProductListResponse>
}
