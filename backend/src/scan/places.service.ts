import { Injectable } from '@nestjs/common';
import type { StoreCandidate } from '../shared/places/places.interface';
import { GsiGeocoderClient } from '../shared/clients/gsi-geocoder.client';
import { StoreCacheService } from '../shared/store-cache.service';

/** GET /places/candidates のレスポンス型。 */
export type PlaceCandidatesResult = {
  address: string | null;
  candidates: StoreCandidate[];
  /** true のとき、バックグラウンドでフル取得中（次回アクセス時に全件が揃う） */
  cacheLoading: boolean;
};

@Injectable()
export class PlacesService {
  constructor(
    private readonly gsiGeocoder: GsiGeocoderClient,
    private readonly storeCacheService: StoreCacheService,
  ) {}

  async getCandidates(lat: number, lng: number, _query?: string): Promise<PlaceCandidatesResult> {
    const [address, { candidates, cacheLoading }] = await Promise.all([
      this.gsiGeocoder.reverseGeocode(lat, lng),
      this.storeCacheService.getCandidates(lat, lng),
    ]);
    return { address, candidates, cacheLoading };
  }
}
