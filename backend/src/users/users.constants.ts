/** HttpOnly Cookie のキー名 */
export const COOKIE_NAME = 'userId' as const;

/** Cookie の有効期間: 2年（秒） */
export const COOKIE_MAX_AGE = 63072000 as const;

/** CORS 許可オリジンのデフォルト値 */
export const CORS_ORIGIN_DEFAULT = 'http://localhost:3000' as const;
