import { renderHook } from '@testing-library/react'
import { useOnboardingGuard } from '@/hooks/useOnboardingGuard'
import { ONBOARDING_DONE_KEY } from '@/hooks/useOnboarding'

const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

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

beforeEach(() => {
  jest.clearAllMocks()
  localStorageMock.clear()
})

describe('useOnboardingGuard', () => {
  it('onboarding_done が未セットの場合 /onboarding へ router.replace される', () => {
    localStorageMock.getItem.mockImplementation(() => null)

    renderHook(() => useOnboardingGuard())

    expect(mockReplace).toHaveBeenCalledWith('/onboarding')
  })

  it('onboarding_done が "true" 以外の値の場合 /onboarding へ router.replace される', () => {
    localStorageMock.getItem.mockImplementation((key) =>
      key === ONBOARDING_DONE_KEY ? 'false' : null,
    )

    renderHook(() => useOnboardingGuard())

    expect(mockReplace).toHaveBeenCalledWith('/onboarding')
  })

  it('onboarding_done === "true" の場合はリダイレクトしない', () => {
    localStorageMock.getItem.mockImplementation((key) =>
      key === ONBOARDING_DONE_KEY ? 'true' : null,
    )

    renderHook(() => useOnboardingGuard())

    expect(mockReplace).not.toHaveBeenCalled()
  })
})
