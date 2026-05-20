import type { UpdateUserBody, UserProfile } from '@/app/settings/settings.types'
import { API_BASE_URL } from '@/lib/constants'

type InitUserResponse = {
  created: boolean
  onboarding_done: boolean
}

export const initUser = async (): Promise<InitUserResponse> => {
  const res = await fetch(`${API_BASE_URL}/users/init`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error(`POST /users/init failed: ${res.status}`)
  }
  return res.json() as Promise<InitUserResponse>
}

export const getUser = async (): Promise<UserProfile> => {
  const res = await fetch(`${API_BASE_URL}/users/me`, {
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error(`GET /users/me failed: ${res.status}`)
  }
  return res.json() as Promise<UserProfile>
}

export const updateUser = async (body: UpdateUserBody): Promise<UserProfile> => {
  const res = await fetch(`${API_BASE_URL}/users/me`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`PUT /users/me failed: ${res.status}`)
  }
  return res.json() as Promise<UserProfile>
}

export const deleteUser = async (): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/users/me`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error(`DELETE /users/me failed: ${res.status}`)
  }
}
