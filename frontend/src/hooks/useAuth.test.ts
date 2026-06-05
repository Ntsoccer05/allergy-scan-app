import { renderHook, waitFor } from '@testing-library/react'
import { useAuth } from './useAuth'

const mockCreateClient = jest.fn()

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateClient(),
}))

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateClient.mockReturnValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: jest.fn().mockReturnValue({
          data: { subscription: { unsubscribe: jest.fn() } },
        }),
      },
    })
  })

  it('returns null session initially', async () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.session).toBeNull()
    expect(result.current.isLoading).toBe(true)
  })

  it('sets isLoading to false after fetching session', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('returns user from session', async () => {
    const mockSession = {
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
      },
      access_token: 'test-token',
    }

    mockCreateClient.mockReturnValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: mockSession } }),
        onAuthStateChange: jest.fn().mockReturnValue({
          data: { subscription: { unsubscribe: jest.fn() } },
        }),
      },
    })

    const { result } = renderHook(() => useAuth())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.user).toEqual(mockSession.user)
  })

  it('has signOut function', () => {
    const { result } = renderHook(() => useAuth())
    expect(typeof result.current.signOut).toBe('function')
  })
})
