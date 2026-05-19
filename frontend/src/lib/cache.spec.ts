import { getCached, setCached } from './cache'
import { CACHE_TTL_CLIENT_MS } from './constants'

describe('cache', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('保存した値を即取得できる', () => {
    setCached('test-key', { value: 42 })
    const result = getCached<{ value: number }>('test-key')
    expect(result).toEqual({ value: 42 })
  })

  it('TTL 期限切れ後は null を返す', () => {
    setCached('test-key-expiry', 'hello')
    // TTL を超過させる
    jest.advanceTimersByTime(CACHE_TTL_CLIENT_MS + 1)
    const result = getCached<string>('test-key-expiry')
    expect(result).toBeNull()
  })

  it('存在しないキーは null を返す', () => {
    const result = getCached<string>('non-existent-key')
    expect(result).toBeNull()
  })
})
