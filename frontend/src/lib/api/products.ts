import type {
  OthersProductItem,
  OthersProductListResponse,
} from '@/app/history/history.types'
import { API_BASE_URL } from '@/lib/constants'

export type { OthersProductItem, OthersProductListResponse }

/**
 * GET /products/others を呼び出す（R7）。
 * cursor がある場合は URL に `?cursor=<値>` を付与する（R4）。
 * credentials: 'include' で Cookie を送信する（R: Completion criteria）。
 */
export const getOthersScanned = async (
  cursor?: string,
): Promise<OthersProductListResponse> => {
  const query = new URLSearchParams()
  if (cursor) {
    query.set('cursor', cursor)
  }
  const url = `${API_BASE_URL}/products/others${query.toString() ? `?${query.toString()}` : ''}`
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    throw new Error(`GET /products/others failed: ${res.status}`)
  }
  return res.json() as Promise<OthersProductListResponse>
}
