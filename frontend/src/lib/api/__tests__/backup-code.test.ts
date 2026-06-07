import { issueBackupCode, restoreFromCode } from '@/lib/api/backup-code'

// apiFetch は内部で Supabase セッションを取得するため、クライアントをモック
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
  }),
}))

describe('backup-code API クライアント', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('issueBackupCode', () => {
    it('POST /users/me/backup-code を Authorization Bearer で呼ぶ', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          code: 'ALRG-ABCD-EFGH',
          expires_at: '2026-05-26T00:00:00.000Z',
        }),
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(mockResponse)

      const result = await issueBackupCode()

      expect(global.fetch).toHaveBeenCalledWith(
        '/users/me/backup-code',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      )
      expect(result.code).toBe('ALRG-ABCD-EFGH')
    })

    it('レスポンスが ok でない場合は Error を throw する', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue({}),
      })

      await expect(issueBackupCode()).rejects.toThrow()
    })
  })

  describe('restoreFromCode', () => {
    it('POST /users/me/restore を Authorization Bearer で呼ぶ', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(mockResponse)

      const result = await restoreFromCode('ALRG-ABCD-EFGH')

      expect(global.fetch).toHaveBeenCalledWith(
        '/users/me/restore',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
          body: JSON.stringify({ code: 'ALRG-ABCD-EFGH' }),
        }),
      )
      expect(result.success).toBe(true)
    })

    it('400 レスポンス時に { message: code_invalid } を throw する', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({ message: 'code_invalid' }),
      })

      await expect(restoreFromCode('ALRG-XXXX-YYYY')).rejects.toEqual({
        message: 'code_invalid',
      })
    })

    it('401 レスポンス時に Error を throw する', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue({}),
      })

      await expect(restoreFromCode('ALRG-ABCD-EFGH')).rejects.toThrow(
        'POST /users/me/restore failed: 401',
      )
    })
  })
})
