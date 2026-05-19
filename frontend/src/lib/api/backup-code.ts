import { API_BASE_URL } from '@/lib/constants'

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
 * POST /users/backup-code: バックアップコードを発行する
 * Cookie 認証が必要（credentials: 'include' を付ける）
 */
export const issueBackupCode = async (): Promise<IssueBackupCodeResponse> => {
  const res = await fetch(`${API_BASE_URL}/users/backup-code`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error(`POST /users/backup-code failed: ${res.status}`)
  }
  return res.json() as Promise<IssueBackupCodeResponse>
}

/**
 * POST /users/restore: バックアップコードで引き継ぎを実行する
 * Cookie 認証が必要（credentials: 'include' を付ける）
 * @throws { message: 'code_invalid' } コードが無効な場合
 */
export const restoreFromCode = async (
  code: string,
): Promise<RestoreFromCodeResponse> => {
  const res = await fetch(`${API_BASE_URL}/users/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code }),
  })
  if (res.status === 400) {
    const body = (await res.json()) as RestoreFromCodeError
    throw body
  }
  if (!res.ok) {
    throw new Error(`POST /users/restore failed: ${res.status}`)
  }
  return res.json() as Promise<RestoreFromCodeResponse>
}
