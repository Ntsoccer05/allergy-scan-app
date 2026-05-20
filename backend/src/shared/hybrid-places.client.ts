import { Injectable } from '@nestjs/common';
import type { StoreCandidate, StoreCandidateProvider } from './places.interface';
import { OverpassPlacesClient } from './overpass-places.client';
import { GooglePlacesClient } from './google-places.client';

/**
 * Overpass primary → Google fallback の Hybrid プロバイダー。
 * Overpass が空配列を返した場合のみ Google Places を呼ぶ。
 */
@Injectable()
export class HybridPlacesClient implements StoreCandidateProvider {
  constructor(
    private readonly overpassClient: OverpassPlacesClient,
    private readonly googleClient: GooglePlacesClient,
  ) {}

  async getStoreCandidates(
    lat: number,
    lng: number,
  ): Promise<StoreCandidate[]> {
    const overpassResult = await this.overpassClient.getStoreCandidates(lat, lng);
    if (overpassResult.length > 0) {
      return overpassResult;
    }
    return this.googleClient.getStoreCandidates(lat, lng);
  }
}
