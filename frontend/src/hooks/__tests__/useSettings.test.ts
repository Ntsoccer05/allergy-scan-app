import { renderHook, waitFor, act } from '@testing-library/react'
import { useSettings, _locationHelpers } from '@/hooks/useSettings'
import { getAllergens } from '@/lib/api/allergens.api'
import { getUser, updateUser, resetUserData } from '@/lib/api/users.api'
import type { AllergenGroup, UserProfile } from '@/app/settings/settings.types'

jest.mock('@/lib/api/allergens.api')
jest.mock('@/lib/api/users.api')

const mockGetAllergens = getAllergens as jest.MockedFunction<typeof getAllergens>
const mockGetUser = getUser as jest.MockedFunction<typeof getUser>
const mockUpdateUser = updateUser as jest.MockedFunction<typeof updateUser>
const mockResetUserData = resetUserData as jest.MockedFunction<typeof resetUserData>

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

  it('handleResetData 呼び出し後に resetUserData API が呼ばれる', async () => {
    mockResetUserData.mockResolvedValue(undefined)

    const { result } = renderHook(() => useSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.handleResetData()
    })

    expect(mockResetUserData).toHaveBeenCalledTimes(1)
  })

  describe('handleLocaleChange', () => {
    let reloadSpy: jest.SpyInstance
    let getProtocolSpy: jest.SpyInstance
    let cookieSetSpy: jest.SpyInstance

    beforeEach(() => {
      // _locationHelpers をスパイすることで jsdom の window.location 制約を回避する
      reloadSpy = jest.spyOn(_locationHelpers, 'reload').mockImplementation(jest.fn())
      getProtocolSpy = jest.spyOn(_locationHelpers, 'getProtocol').mockReturnValue('http:')
      // document.cookie の setter をスパイして書き込み値を記録する
      cookieSetSpy = jest.spyOn(document, 'cookie', 'set').mockImplementation(jest.fn())
    })

    afterEach(() => {
      reloadSpy.mockRestore()
      getProtocolSpy.mockRestore()
      cookieSetSpy.mockRestore()
    })

    it('API 成功時に NEXT_LOCALE cookie をセットしてリロードする', async () => {
      mockUpdateUser.mockResolvedValue(undefined)

      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.handleLocaleChange('en')
      })

      expect(mockUpdateUser).toHaveBeenCalledWith({ locale: 'en' })
      expect(cookieSetSpy).toHaveBeenCalledWith(expect.stringContaining('NEXT_LOCALE=en'))
      expect(reloadSpy).toHaveBeenCalledTimes(1)
    })

    it('API 失敗時にロケールをロールバックしてエラーをセット・リロードしない', async () => {
      mockUpdateUser.mockRejectedValue(new Error('fail'))

      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const initialLocale = result.current.locale

      await act(async () => {
        await result.current.handleLocaleChange('en')
      })

      expect(result.current.locale).toBe(initialLocale)
      expect(result.current.error).toBe('error.localeChangeFailed')
      expect(reloadSpy).not.toHaveBeenCalled()
    })

    it('HTTPS 環境では cookie に Secure フラグが付く', async () => {
      getProtocolSpy.mockReturnValue('https:')
      mockUpdateUser.mockResolvedValue(undefined)

      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.handleLocaleChange('en')
      })

      expect(cookieSetSpy).toHaveBeenCalledWith(expect.stringContaining('Secure'))
    })
  })
})
