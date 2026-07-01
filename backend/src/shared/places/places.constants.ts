// ── 国土地理院 逆ジオコーダ ─────────────────────────────────────────────
/** 国土地理院 逆ジオコーダ API のタイムアウト（ms） */
export const GSI_GEOCODER_TIMEOUT_MS = 5_000;

// ── Yahoo! Local Search API ──────────────────────────────────────────────

/** Yahoo API で取得するキャッシュ半径（km）。Yahoo API 上限値で常に固定。 */
export const STORE_CACHE_RADIUS_KM = 20;

/**
 * store_cache / store_cache_areas の有効期限（日数）。
 * metro: 大都市（100万人超）は店舗入れ替わりが速いため短め。
 * regional: 地方都市は変動が少ないため長め。
 */
export const STORE_CACHE_EXPIRE_DAYS = {
  METRO: 30,
  REGIONAL: 90,
} as const;

/** Yahoo API 1 リクエストあたりの取得件数（上限） */
export const STORE_CACHE_MAX_RESULTS = 100;

/** アダプティブ表示の距離ステップ（km）。不足なら次の距離へ拡大。 */
export const ADAPTIVE_DISPLAY_STEPS_KM = [5, 10, 20] as const;

/** アダプティブ表示でこの件数を下回ったら次の距離ステップへ拡大する。 */
export const ADAPTIVE_MIN_CANDIDATES = 3;

/** Yahoo! Local Search API のジャンルコード（食品購入場面をカバーする 14 種） */
export const YAHOO_LOCAL_SEARCH_GENRES = [
  '0205',     // コンビニ・スーパー
  '0202',     // ドラッグストア
  '0402001',  // 薬局
  '0204001',  // 百貨店・デパート
  '0204002',  // ショッピングセンター
  '0204004',  // ホームセンター
  '0206002',  // ディスカウントショップ
  '0207008',  // 100円ショップ
  '0210',     // 食品・食材全般
  '0114001',  // 持ち帰り・弁当
  '0117001',  // ベーカリー
  '0118001',  // 洋菓子・ケーキ
  '0118002',  // 和菓子
  '0307003',  // 道の駅
] as const;

/** Yahoo API 1 ジャンルあたりの最大取得ページ数（1ページ=100件・最大30ページ=3,000件/ジャンル） */
export const YAHOO_MAX_PAGES_PER_GENRE = 30;

/** Yahoo API のリクエスト間隔（ms）。レート制限対策。 */
export const YAHOO_REQUEST_INTERVAL_MS = 300;
