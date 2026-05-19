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
};

export type AllergyEntry = {
  enabled: boolean;
  partialAlert: boolean;
};

export type UserAllergies = Record<string, AllergyEntry>;
