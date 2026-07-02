/** GET /places/candidates で返す店舗候補の型 */
export type StoreCandidate = {
  name: string;
  placeId: string;
  address?: string;
  /** 現在地からの距離（km）。Haversine で算出。DB キャッシュ経由の場合のみセット。 */
  distanceKm?: number;
  /** 店舗の緯度。マップピン配置に使用する。 */
  lat?: number;
  /** 店舗の経度。マップピン配置に使用する。 */
  lng?: number;
};
