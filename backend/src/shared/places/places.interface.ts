/** GET /places/candidates で返す店舗候補の型 */
export type StoreCandidate = {
  name: string;
  placeId: string;
  address?: string;
  /** 現在地からの距離（km）。Haversine で算出。DB キャッシュ経由の場合のみセット。 */
  distanceKm?: number;
};
