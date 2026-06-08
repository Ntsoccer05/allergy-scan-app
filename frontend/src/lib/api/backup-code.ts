import { apiFetch } from './api-client'

export type IssueBackupCodeResponse = {
  code: string
  expires_at: string
}

export type RestoreFromCodeResponse = {
  success: true
}

export type RestoreFromCodeError = {
  message: 'code_invalid'
}

/**
 * POST /users/me/backup-code: バックアップコードを発行する
 */
export const issueBackupCode = async (): Promise<IssueBackupCodeResponse> => {
  const res = await apiFetch('/users/me/backup-code', {
    method: 'POST',
    headers: {},
  })
  return res.json() as Promise<IssueBackupCodeResponse>
}

/**
 * POST /users/me/restore: バックアップコードで引き継ぎを実行する
 * @throws { message: 'code_invalid' } コードが無効な場合
 */
export const restoreFromCode = async (
  code: string,
): Promise<RestoreFromCodeResponse> => {
  // apiFetch throws on non-ok responses, but we need to handle 400 specially here
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''
  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  const res = await fetch(`${baseUrl}/users/me/restore`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ code }),
  })
  if (res.status === 400) {
    const body = (await res.json()) as RestoreFromCodeError
    throw body
  }
  if (!res.ok) {
    throw new Error(`POST /users/me/restore failed: ${res.status}`)
  }
  return res.json() as Promise<RestoreFromCodeResponse>
}
