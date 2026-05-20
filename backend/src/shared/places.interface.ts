/** getStoreCandidates の返却要素 */
export type StoreCandidate = {
  name: string;
  placeId: string;
};

/** 店舗候補を取得するプロバイダーのインターフェース */
export interface StoreCandidateProvider {
  getStoreCandidates(lat: number, lng: number): Promise<StoreCandidate[]>;
}

/** DI トークン: PLACES_PROVIDER_TOKEN */
export const PLACES_PROVIDER_TOKEN = 'PLACES_PROVIDER_TOKEN';
