import { apiFetch } from './api-client'
import type { SystemProductListResponse } from '@/app/history/history.types'

export type AdminUser = {
  id: string
  locale: string
  created_at: string
  plan_name: string
  daily_scan_limit: number
}

export type AdminStats = {
  total_users: number
  total_scans: number
  scans_today: number
  active_premium: number
}

export const getAdminUsers = async (cursor?: string): Promise<{ items: AdminUser[]; next_cursor: string | null }> => {
  const params = new URLSearchParams({ ...(cursor ? { cursor } : {}) })
  const res = await apiFetch(`/admin/users?${params}`)
  return res.json() as Promise<{ items: AdminUser[]; next_cursor: string | null }>
}

export const getAdminStats = async (): Promise<AdminStats> => {
  const res = await apiFetch('/admin/stats')
  return res.json() as Promise<AdminStats>
}

export const updateUserPlan = async (userId: string, planName: string): Promise<void> => {
  await apiFetch(`/admin/users/${userId}/plan`, {
    method: 'PATCH',
    body: JSON.stringify({ plan_name: planName }),
  })
}

export const getSystemProducts = async (
  cursor?: string,
  q?: string,
  judgment?: 'all' | 'ng' | 'partial' | 'ok',
): Promise<SystemProductListResponse> => {
  const params = new URLSearchParams({
    ...(cursor ? { cursor } : {}),
    ...(q ? { q } : {}),
    ...(judgment && judgment !== 'all' ? { judgment } : {}),
  })
  const res = await apiFetch(`/admin/products?${params}`)
  return res.json() as Promise<SystemProductListResponse>
}
