import { createClient } from '@/lib/supabase/client'

export const apiFetch = async (path: string, init?: RequestInit): Promise<Response> => {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...init?.headers,
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string }
    throw Object.assign(new Error(body.message ?? 'API error'), { status: res.status, body })
  }
  return res
}
