export const PUBLIC_HISTORY_PAGE_LIMIT = 20
export const DIGEST_REFETCH_INTERVAL_MS = 60 * 1000

/** 検索入力のデバウンス時間 (ms)。入力のたびに API を叩かないため。 */
export const SEARCH_DEBOUNCE_MS = 300

/** 履歴ページのアクティブタブを保存する localStorage キー（リロード後もタブを維持する）。 */
export const HISTORY_TAB_STORAGE_KEY = 'history.activeTab'
