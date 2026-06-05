import { renderHook, waitFor, act } from '@testing-library/react'
import { useOnboarding, ONBOARDING_DONE_KEY } from '@/hooks/useOnboarding'
import { getAllergens } from '@/lib/api/allergens.api'
import { updateUser } from '@/lib/api/users.api'
import type { AllergenGroup } from '@/app/settings/settings.types'

jest.mock('@/lib/api/allergens.api')
jest.mock('@/lib/api/users.api')

const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

const mockGetAllergens = getAllergens as jest.MockedFunction<typeof getAllergens>
const mockUpdateUser = updateUser as jest.MockedFunction<typeof updateUser>

const makeAllergenGroups = (): AllergenGroup[] => [
  {
    category: 'mandatory',
    label: '特定原材料',
    items: [
      {
        name: '乳',
        display_name: '乳',
        emoji: '🥛',
        display_order: 8,
        judgment_type: 'allergy',
      },
      {
        name: '卵',
        display_name: '卵',
        emoji: '🥚',
        display_order: 7,
        judgment_type: 'allergy',
      },
    ],
  },
  {
    category: 'recommended',
    label: '準ずるもの',
    items: [
      {
        name: 'いか',
        display_name: 'いか',
        emoji: null,
        display_order: 10,
        judgment_type: 'allergy',
      },
    ],
  },
]

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
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
  mockGetAllergens.mockResolvedValue(makeAllergenGroups())
  mockUpdateUser.mockResolvedValue({
    id: 'user-1',
    allergies: {},
    locale: 'ja',
    onboarding_done: true,
    subscription: null,
  })
})

describe('useOnboarding', () => {
  it('マウント時に GET /allergens が1回呼ばれる', async () => {
    const { result } = renderHook(() => useOnboarding())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockGetAllergens).toHaveBeenCalledTimes(1)
  })

  it('初期 step が 1 である', async () => {
    const { result } = renderHook(() => useOnboarding())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.step).toBe(1)
  })

  it('画面2で1品目も選択していないとき canProceedStep2 が false である', async () => {
    const { result } = renderHook(() => useOnboarding())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.canProceedStep2).toBe(false)
  })

  it('画面2で1品目選択後に canProceedStep2 が true になる', async () => {
    const { result } = renderHook(() => useOnboarding())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.handleToggleAllergen('乳')
    })

    expect(result.current.canProceedStep2).toBe(true)
  })

  it('handleToggleAllergen で enabled と partialAlert が連動して ON になる', async () => {
    const { result } = renderHook(() => useOnboarding())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.handleToggleAllergen('乳')
    })

    expect(result.current.selectedAllergies['乳']).toEqual({
      enabled: true,
      partialAlert: true,
    })
  })

  it('goNext で step が 2 に進む', async () => {
    const { result } = renderHook(() => useOnboarding())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.goNext()
    })

    expect(result.current.step).toBe(2)
  })

  it('goBack で step が 1 より小さくならない', async () => {
    const { result } = renderHook(() => useOnboarding())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.goBack()
    })

    expect(result.current.step).toBe(1)
  })

  it('allergenGroups は mandatory と recommended のみ含む', async () => {
    const { result } = renderHook(() => useOnboarding())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const categories = result.current.allergenGroups.map((g) => g.category)
    expect(categories).toContain('mandatory')
    expect(categories).toContain('recommended')
    expect(categories).not.toContain('addiction')
    expect(categories).not.toContain('skin')
  })

  it('completeOnboarding 後に PUT /users/me が呼ばれる', async () => {
    const { result } = renderHook(() => useOnboarding())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.handleToggleAllergen('乳')
    })

    await act(async () => {
      await result.current.completeOnboarding()
    })

    expect(mockUpdateUser).toHaveBeenCalledTimes(1)
    expect(mockUpdateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        allergies: expect.any(Object),
        locale: 'ja',
      }),
    )
  })

  it('completeOnboarding 呼び出し時に updateUser が onboarding_done: true を含むボディで呼ばれる', async () => {
    const { result } = renderHook(() => useOnboarding())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.completeOnboarding()
    })

    expect(mockUpdateUser).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding_done: true }),
    )
  })

  it('completeOnboarding 後に localStorage.onboarding_done が "true" になる', async () => {
    const { result } = renderHook(() => useOnboarding())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.completeOnboarding()
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith(ONBOARDING_DONE_KEY, 'true')
  })

  it('completeOnboarding 後に /scan へ router.replace が呼ばれる', async () => {
    const { result } = renderHook(() => useOnboarding())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.completeOnboarding()
    })

    expect(mockReplace).toHaveBeenCalledWith('/scan')
  })

  it('GET /allergens が複数回マウントされても1回しか呼ばれない', async () => {
    const { result, rerender } = renderHook(() => useOnboarding())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    rerender()

    expect(mockGetAllergens).toHaveBeenCalledTimes(1)
  })
})
