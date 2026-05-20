import { renderHook, waitFor } from '@testing-library/react'
import { useOnboardingGuard } from '@/hooks/useOnboardingGuard'
import { ONBOARDING_DONE_KEY } from '@/hooks/useOnboarding'
import { getUser } from '@/lib/api/users.api'
import type { UserProfile } from '@/app/settings/settings.types'

jest.mock('@/lib/api/users.api')
jest.mock('@/lib/cache', () => ({
  getCached: jest.fn().mockReturnValue(null),
  setCached: jest.fn(),
}))

const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: jest.fn<string | null, [string]>((key) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value
    }),
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

const makeUserProfile = (overrides?: Partial<UserProfile>): UserProfile => ({
  id: 'user-1',
  allergies: {},
  locale: 'ja',
  onboarding_done: false,
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  localStorageMock.clear()
})

describe('useOnboardingGuard', () => {
  describe('高速パス（localStorage あり）', () => {
    it('onboarding_done が "true" の場合はリダイレクトせず getUser() も呼ばれない', () => {
      localStorageMock.getItem.mockImplementation((key) =>
        key === ONBOARDING_DONE_KEY ? 'true' : null,
      )

      renderHook(() => useOnboardingGuard())

      expect(mockReplace).not.toHaveBeenCalled()
      expect(mockGetUser).not.toHaveBeenCalled()
    })
  })

  describe('フォールバック（localStorage なし・API 呼び出し）', () => {
    it('localStorage なし・getUser() が onboarding_done: true を返す場合はリダイレクトせず localStorage に "true" をセットする', async () => {
      localStorageMock.getItem.mockReturnValue(null)
      mockGetUser.mockResolvedValue(makeUserProfile({ onboarding_done: true }))

      renderHook(() => useOnboardingGuard())

      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          ONBOARDING_DONE_KEY,
          'true',
        )
      })
      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('localStorage なし・getUser() が onboarding_done: false を返す場合は /onboarding へリダイレクトする', async () => {
      localStorageMock.getItem.mockReturnValue(null)
      mockGetUser.mockResolvedValue(makeUserProfile({ onboarding_done: false }))

      renderHook(() => useOnboardingGuard())

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/onboarding')
      })
      expect(localStorageMock.setItem).not.toHaveBeenCalled()
    })

    it('localStorage なし・getUser() が reject する場合は /onboarding へリダイレクトする', async () => {
      localStorageMock.getItem.mockReturnValue(null)
      mockGetUser.mockRejectedValue(new Error('network error'))

      renderHook(() => useOnboardingGuard())

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/onboarding')
      })
    })
  })

  describe('後方互換: localStorage が "true" 以外の値', () => {
    it('onboarding_done が "false" の文字列の場合は getUser() を呼んでフォールバック判定する', async () => {
      localStorageMock.getItem.mockImplementation((key) =>
        key === ONBOARDING_DONE_KEY ? 'false' : null,
      )
      mockGetUser.mockResolvedValue(makeUserProfile({ onboarding_done: false }))

      renderHook(() => useOnboardingGuard())

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/onboarding')
      })
    })
  })
})
