import { issueBackupCode, restoreFromCode } from '@/lib/api/backup-code'
import { API_BASE_URL } from '@/lib/constants'

describe('backup-code API クライアント', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('issueBackupCode', () => {
    it('POST /users/backup-code に credentials: include で呼ばれる', async () => {
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
        `${API_BASE_URL}/users/backup-code`,
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        }),
      )
      expect(result.code).toBe('ALRG-ABCD-EFGH')
    })

    it('レスポンスが ok でない場合は Error を throw する', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
      })

      await expect(issueBackupCode()).rejects.toThrow('POST /users/backup-code failed: 401')
    })
  })

  describe('restoreFromCode', () => {
    it('POST /users/restore に credentials: include で呼ばれる', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
      }
      ;(global.fetch as jest.Mock).mockResolvedValue(mockResponse)

      const result = await restoreFromCode('ALRG-ABCD-EFGH')

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/users/restore`,
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
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
        'POST /users/restore failed: 401',
      )
    })
  })
})
