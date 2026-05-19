import { CACHE_TTL_CLIENT_MS } from './constants'

type CacheEntry<T> = {
  data: T
  expiresAt: number
}

const cache = new Map<string, CacheEntry<unknown>>()

export const getCached = <T>(key: string): T | null => {
  const entry = cache.get(key)
  if (!entry || Date.now() > entry.expiresAt) return null
  return entry.data as T
}

export const setCached = <T>(key: string, data: T): void => {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_CLIENT_MS })
}
