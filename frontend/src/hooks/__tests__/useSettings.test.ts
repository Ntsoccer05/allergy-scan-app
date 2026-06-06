import { renderHook, waitFor, act } from '@testing-library/react'
import { useSettings } from '@/hooks/useSettings'
import { getAllergens } from '@/lib/api/allergens.api'
import { getUser, updateUser, deleteUser } from '@/lib/api/users.api'
import type { AllergenGroup, UserProfile } from '@/app/settings/settings.types'

jest.mock('@/lib/api/allergens.api')
jest.mock('@/lib/api/users.api')

const mockGetAllergens = getAllergens as jest.MockedFunction<typeof getAllergens>
const mockGetUser = getUser as jest.MockedFunction<typeof getUser>
const mockUpdateUser = updateUser as jest.MockedFunction<typeof updateUser>
const mockDeleteUser = deleteUser as jest.MockedFunction<typeof deleteUser>

const makeAllergenGroups = (): AllergenGroup[] => [
  {
    category: 'mandatory',
    label: '特定原材料',
    items: [
      { name: '乳', display_name: '乳', emoji: '🥛', display_order: 8, judgment_type: 'allergy' },
      { name: '卵', display_name: '卵', emoji: '🥚', display_order: 7, judgment_type: 'allergy' },
    ],
  },
  {
    category: 'addiction',
    label: '依存性への配慮',
    items: [
      { name: 'アルコール', display_name: 'アルコール', emoji: '🍺', display_order: 30, judgment_type: 'caution' },
    ],
  },
]

const makeUser = (): UserProfile => ({
  id: 'user-1',
  allergies: {
    乳: { enabled: true, partialAlert: true },
    卵: { enabled: false, partialAlert: false },
    アルコール: { enabled: false, partialAlert: false },
  },
  locale: 'ja',
  onboarding_done: true,
  subscription: null,
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  mockGetAllergens.mockResolvedValue(makeAllergenGroups())
  mockGetUser.mockResolvedValue(makeUser())
  mockUpdateUser.mockResolvedValue(undefined)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('useSettings', () => {
  it('初期化時に getAllergens と getUser が並列で呼ばれる', async () => {
    const { result } = renderHook(() => useSettings())

    expect(result.current.isLoading).toBe(true)
    expect(mockGetAllergens).toHaveBeenCalledTimes(1)
    expect(mockGetUser).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.allergenGroups).toHaveLength(2)
    expect(result.current.allergies['乳']).toEqual({ enabled: true, partialAlert: true })
  })

  it('toggleAllergen 呼び出し後に partialAlert も同値になる（OFF → ON）', async () => {
    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.handleToggleAllergen('卵')
    })

    expect(result.current.allergies['卵'].enabled).toBe(true)
    expect(result.current.allergies['卵'].partialAlert).toBe(true)
  })

  it('toggleAllergen 呼び出し後に partialAlert も同値になる（ON → OFF）', async () => {
    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.handleToggleAllergen('乳')
    })

    expect(result.current.allergies['乳'].enabled).toBe(false)
    expect(result.current.allergies['乳'].partialAlert).toBe(false)
  })

  it('toggleCaution 呼び出し後に partialAlert は変化しない', async () => {
    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const before = result.current.allergies['アルコール'].partialAlert

    act(() => {
      result.current.handleToggleCaution('アルコール')
    })

    expect(result.current.allergies['アルコール'].enabled).toBe(true)
    expect(result.current.allergies['アルコール'].partialAlert).toBe(before)
  })

  it('アレルギートグル後に debounce 経過で updateUser が呼ばれる', async () => {
    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      result.current.handleToggleAllergen('卵')
    })

    // debounce 前は呼ばれていない
    expect(mockUpdateUser).not.toHaveBeenCalled()

    // debounce 経過
    act(() => {
      jest.advanceTimersByTime(300)
    })

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledTimes(1)
    })

    expect(mockUpdateUser).toHaveBeenCalledWith(
      expect.objectContaining({ allergies: expect.any(Object) }),
    )
  })

  it('handleDeleteUser 呼び出し後に deleteUser API が呼ばれる', async () => {
    mockDeleteUser.mockResolvedValue(undefined)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.handleDeleteUser()
    })

    expect(mockDeleteUser).toHaveBeenCalledTimes(1)
  })
})
