import { Inject, Injectable } from '@nestjs/common';
import {
  PLACES_PROVIDER_TOKEN,
  type StoreCandidate,
  type StoreCandidateProvider,
} from '../shared/places.interface';
import { GsiGeocoderClient } from '../shared/gsi-geocoder.client';

/** GET /places/candidates のレスポンス型。 */
export type PlaceCandidatesResult = {
  address: string | null;
  candidates: StoreCandidate[];
};

/**
 * 場所登録用の住所・施設候補を取得する Service。
 * Places API はコール課金のため、スキャン毎ではなく
 * ユーザーの「場所を登録」操作時にのみ呼ばれる（00320 フェーズ A）。
 */
@Injectable()
export class PlacesService {
  constructor(
    @Inject(PLACES_PROVIDER_TOKEN)
    private readonly placesClient: StoreCandidateProvider,
    private readonly gsiGeocoder: GsiGeocoderClient,
  ) {}

  async getCandidates(lat: number, lng: number): Promise<PlaceCandidatesResult> {
    const [address, candidates] = await Promise.all([
      this.gsiGeocoder.reverseGeocode(lat, lng),
      this.placesClient.getStoreCandidates(lat, lng),
    ]);
    return { address, candidates };
  }
}
