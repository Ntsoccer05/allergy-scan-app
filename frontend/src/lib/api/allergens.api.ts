import type { AllergenGroup } from '@/app/settings/settings.types'
import { API_BASE_URL } from '@/lib/constants'

export const getAllergens = async (): Promise<AllergenGroup[]> => {
  const res = await fetch(`${API_BASE_URL}/allergens`, {
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error(`GET /allergens failed: ${res.status}`)
  }
  return res.json() as Promise<AllergenGroup[]>
}
