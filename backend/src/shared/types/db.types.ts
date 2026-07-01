/**
 * JSONB フィールドの TypeScript 型定義
 * products.allergens / scan_histories.location / users.allergies に対応する。
 * Repository 層でのみ型アサーションを使用すること（アンチパターン #14 参照）。
 */

export type ProductAllergens = {
  contains: string[];
  partial: string[];
  components: string[];
};

export type ScanHistoryLocation = {
  store_name: string;
  lat: number;
  lng: number;
  /** 逆ジオコーディング（国土地理院）で取得した住所。store_name（施設名）とは別に保持する */
  address?: string;
  /** Google Places の place_id（将来の店舗キー統一用 — 00320）。住所のみ登録時は未設定 */
  place_id?: string;
};

export type AllergyEntry = {
  enabled: boolean;
  partialAlert: boolean;
};

export type UserAllergies = Record<string, AllergyEntry>;
