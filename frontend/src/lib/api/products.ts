import type {
  OthersProductItem,
  OthersProductListResponse,
} from '@/app/history/history.types'
import { apiFetch } from './api-client'

export type { OthersProductItem, OthersProductListResponse }

/**
 * GET /products/others を呼び出す（R7）。
 * cursor がある場合は URL に `?cursor=<値>` を付与する（R4）。
 */
export const getOthersScanned = async (
  cursor?: string,
): Promise<OthersProductListResponse> => {
  const query = new URLSearchParams()
  if (cursor) {
    query.set('cursor', cursor)
  }
  const path = `/products/others${query.toString() ? `?${query.toString()}` : ''}`
  const res = await apiFetch(path, { headers: {} })
  return res.json() as Promise<OthersProductListResponse>
}
