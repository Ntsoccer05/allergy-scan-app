import type { AllergenGroup } from '@/app/settings/settings.types'
import { apiFetch } from './api-client'

export const getAllergens = async (): Promise<AllergenGroup[]> => {
  const res = await apiFetch('/allergens', {
    headers: {},
  })
  return res.json() as Promise<AllergenGroup[]>
}
