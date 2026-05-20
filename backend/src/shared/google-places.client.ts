import { Injectable, Logger } from '@nestjs/common';
import type { StoreCandidate, StoreCandidateProvider } from './places.interface';
import { PLACES_SEARCH_RADIUS_M, STORE_CANDIDATES_LIMIT } from './places.constants';

/** Google Places Nearby Search API のレスポンス（places 配列要素） */
type PlacesApiPlace = {
  displayName?: { text?: string };
  id?: string;
};

/** Google Places Nearby Search API のレスポンス型 */
type PlacesApiResponse = {
  places?: PlacesApiPlace[];
};

/** 検索対象の業種タイプ */
const PLACES_INCLUDED_TYPES = [
  'convenience_store',
  'supermarket',
  'grocery_or_supermarket',
];

/** Places API のベース URL */
const PLACES_API_BASE_URL =
  'https://places.googleapis.com/v1/places:searchNearby';

@Injectable()
export class GooglePlacesClient implements StoreCandidateProvider {
  private readonly logger = new Logger(GooglePlacesClient.name);

  /**
   * 指定緯度経度の近くにある店舗候補を距離順上位 STORE_CANDIDATES_LIMIT 件返す。
   * GOOGLE_PLACES_API_KEY 未設定・API エラー・結果ゼロの場合は空配列を返す（例外を投げない）。
   */
  async getStoreCandidates(
    lat: number,
    lng: number,
  ): Promise<StoreCandidate[]> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      // キー未設定時はスキャンを止めずに空配列を返す
      return [];
    }

    try {
      const body = JSON.stringify({
        includedTypes: PLACES_INCLUDED_TYPES,
        maxResultCount: STORE_CANDIDATES_LIMIT,
        rankPreference: 'DISTANCE',
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            // 10m に絞ることで「今立っている店舗」のみを候補とする。
            // 都市部では 10m 以内に複数店舗が存在するケースもあるが、
            // その場合はユーザー選択（3ウェイ分岐）に委ねる設計。
            radius: PLACES_SEARCH_RADIUS_M,
          },
        },
      });

      const res = await fetch(PLACES_API_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName',
        },
        body,
      });

      if (!res.ok) {
        this.logger.warn(
          `Places API 返却エラー: status=${res.status}`,
        );
        return [];
      }

      const data = (await res.json()) as PlacesApiResponse;
      const places = data.places ?? [];

      return places
        .filter(
          (p): p is PlacesApiPlace & { id: string; displayName: { text: string } } =>
            typeof p.id === 'string' &&
            typeof p.displayName?.text === 'string',
        )
        .map((p) => ({ name: p.displayName.text, placeId: p.id }));
    } catch (error) {
      this.logger.warn(
        'Places API 呼び出し失敗',
        error instanceof Error ? error.message : String(error),
      );
      return [];
    }
  }
}
