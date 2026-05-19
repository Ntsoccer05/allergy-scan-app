/** クライアントサイドキャッシュの TTL: 2時間 (ms) */
export const CACHE_TTL_CLIENT_MS = 2 * 60 * 60 * 1000

/** API ベース URL（環境変数から取得） */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'
