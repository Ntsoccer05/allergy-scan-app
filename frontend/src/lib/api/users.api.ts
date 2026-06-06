import type { UpdateUserBody, UserProfile } from '@/app/settings/settings.types'
import { apiFetch } from './api-client'

type InitUserResponse = {
  created: boolean
  onboarding_done: boolean
}

export const initUser = async (): Promise<InitUserResponse> => {
  const res = await apiFetch('/users/me/init', {
    method: 'POST',
    headers: {},
  })
  return res.json() as Promise<InitUserResponse>
}

export const getUser = async (): Promise<UserProfile> => {
  const res = await apiFetch('/users/me', {
    headers: {},
  })
  return res.json() as Promise<UserProfile>
}

export const updateUser = async (body: UpdateUserBody): Promise<void> => {
  await apiFetch('/users/me', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export const deleteUser = async (): Promise<void> => {
  await apiFetch('/users/me', {
    method: 'DELETE',
    headers: {},
  })
}
