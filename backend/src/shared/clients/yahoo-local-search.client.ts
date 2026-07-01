import { Injectable, Logger } from '@nestjs/common';
import {
  YAHOO_LOCAL_SEARCH_GENRES,
  YAHOO_MAX_PAGES_PER_GENRE,
  YAHOO_REQUEST_INTERVAL_MS,
  STORE_CACHE_MAX_RESULTS,
} from '../places/places.constants';

const YAHOO_LOCAL_SEARCH_URL =
  'https://map.yahooapis.jp/search/local/V1/localSearch';

/** Yahoo! Local Search API のレスポンス型（必要フィールドのみ） */
type YahooFeature = {
  Id: string;
  Name: string;
  Geometry: {
    Coordinates: string; // "lng,lat" 形式
  };
  Property: {
    Address?: string;
    Genre?: Array<{ Name: string }>;
  };
};

type YahooLocalSearchResponse = {
  ResultInfo: {
    Count: number;
    Total: number;
    Start: number;
    Latency: number;
  };
  Feature?: YahooFeature[];
};

/** Yahoo! Local Search API から取得した生データ */
export type YahooStoreRaw = {
  uid: string;      // Yahoo Feature ID
  name: string;
  lat: number;
  lng: number;
  address?: string;
  genre?: string;   // 最初のジャンル名
};

@Injectable()
export class YahooLocalSearchClient {
  private readonly logger = new Logger(YahooLocalSearchClient.name);
  private readonly appId: string;

  constructor() {
    const id = process.env.YAHOO_APP_ID;
    if (!id) throw new Error('YAHOO_APP_ID environment variable is not set');
    this.appId = id;
  }

  /**
   * 指定座標・半径内の全対象ジャンルの店舗を取得する（バッチ用）。
   * Yahoo API のレート制限を避けるため、リクエスト間に YAHOO_REQUEST_INTERVAL_MS を挟む。
   */
  async fetchAllStores(
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<YahooStoreRaw[]> {
    const stores = new Map<string, YahooStoreRaw>();

    for (const genre of YAHOO_LOCAL_SEARCH_GENRES) {
      let start = 1;
      let totalFetched = 0;

      for (let page = 0; page < YAHOO_MAX_PAGES_PER_GENRE; page++) {
        const batch = await this.fetchPage(lat, lng, radiusKm, genre, start);
        if (batch.length === 0) break;

        for (const store of batch) {
          stores.set(store.uid, store);
        }

        totalFetched += batch.length;
        start += batch.length;

        if (batch.length < STORE_CACHE_MAX_RESULTS) break;

        await this.sleep(YAHOO_REQUEST_INTERVAL_MS);
      }

      this.logger.log(`genre=${genre} fetched=${totalFetched}`);
      await this.sleep(YAHOO_REQUEST_INTERVAL_MS);
    }

    return Array.from(stores.values());
  }

  /**
   * 指定座標・半径内の店舗をリアルタイム検索する（場所登録ボタンタップ時用）。
   * 全ジャンルを並列で 1 ページずつ取得する（逐次+sleep は不要: 1ユーザー分のリクエストなのでレート制限不要）。
   */
  async fetchNearby(
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<YahooStoreRaw[]> {
    const stores = new Map<string, YahooStoreRaw>();

    const batches = await Promise.all(
      YAHOO_LOCAL_SEARCH_GENRES.map((genre) => this.fetchPage(lat, lng, radiusKm, genre, 1)),
    );
    for (const batch of batches) {
      for (const store of batch) {
        stores.set(store.uid, store);
      }
    }

    return Array.from(stores.values());
  }

  private async fetchPage(
    lat: number,
    lng: number,
    radiusKm: number,
    genre: string,
    start: number,
  ): Promise<YahooStoreRaw[]> {
    const params = new URLSearchParams({
      appid: this.appId,
      lat: String(lat),
      lon: String(lng),
      dist: String(radiusKm),
      gc: genre,
      results: String(STORE_CACHE_MAX_RESULTS),
      start: String(start),
      output: 'json',
    });

    const url = `${YAHOO_LOCAL_SEARCH_URL}?${params.toString()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        this.logger.error(
          `Yahoo API HTTP error genre=${genre} start=${start} status=${res.status}`,
        );
        return [];
      }

      const data = (await res.json()) as YahooLocalSearchResponse;
      const features = data.Feature ?? [];

      return features.map((f): YahooStoreRaw => {
        const [lngStr, latStr] = f.Geometry.Coordinates.split(',');
        return {
          uid: f.Id,
          name: f.Name,
          lat: parseFloat(latStr ?? '0'),
          lng: parseFloat(lngStr ?? '0'),
          address: f.Property.Address,
          genre: f.Property.Genre?.[0]?.Name,
        };
      });
    } catch (err) {
      this.logger.error(
        `Yahoo API error genre=${genre} start=${start}`,
        err instanceof Error ? err.message : String(err),
      );
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
