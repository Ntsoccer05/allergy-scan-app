import { Injectable, Logger } from '@nestjs/common';
import { StoreCacheRepository, toGridKey, StoreCacheInput, haversineKm } from './store-cache.repository';
import { YahooLocalSearchClient, YahooStoreRaw } from './clients/yahoo-local-search.client';
import { StoreCandidate } from './places/places.interface';

@Injectable()
export class StoreCacheService {
  private readonly logger = new Logger(StoreCacheService.name);

  constructor(
    private readonly storeCacheRepository: StoreCacheRepository,
    private readonly yahooClient: YahooLocalSearchClient,
  ) {}

  /**
   * 近傍店舗候補を返す。
   *
   * フロー:
   * 1. store_cache に有効なキャッシュがあれば即返却（cacheLoading: false）
   * 2. なければ Yahoo API でリアルタイム取得してキャッシュに保存
   * 3. バックグラウンドジョブを投入して全件取得を開始（cacheLoading: true）
   */
  async getCandidates(
    lat: number,
    lng: number,
  ): Promise<{ candidates: StoreCandidate[]; cacheLoading: boolean }> {
    const gridKey = toGridKey(lat, lng);

    // 1. キャッシュ確認（バッチ済みエリアであれば全件返す）
    const hasCache = await this.storeCacheRepository.findArea(gridKey);
    if (hasCache) {
      const cached = await this.storeCacheRepository.findNearby(lat, lng);
      if (cached.length > 0) {
        this.logger.log(`cache hit gridKey=${gridKey} count=${cached.length}`);
        return { candidates: cached, cacheLoading: false };
      }
    }

    // 2. リアルタイム取得（0205のみ全ページ並列取得・全件カバー）
    this.logger.log(`cache miss gridKey=${gridKey} → realtime fetch`);
    const raw = await this.yahooClient.fetchNearby(lat, lng, 20);

    // DB保存・ジョブ投入は fire-and-forget（レスポンスをブロックしない）
    void this.saveAndEnqueue(raw, lat, lng, gridKey);

    // 生データを直接 StoreCandidate に変換して即返却（DB roundtrip なし）
    const candidates = rawToSortedCandidates(raw, lat, lng);
    return { candidates, cacheLoading: false };
  }

  /** DB保存とジョブ投入を非同期で行う（レスポンスをブロックしない） */
  private async saveAndEnqueue(
    raw: YahooStoreRaw[],
    lat: number,
    lng: number,
    gridKey: string,
  ): Promise<void> {
    const stores: StoreCacheInput[] = raw.map(toStoreCacheInput('realtime'));
    try {
      if (stores.length > 0) {
        await this.storeCacheRepository.upsertRealtime(stores, 'regional');
        // エリアカバー記録（次回はキャッシュヒットさせる）
        await this.storeCacheRepository.recordArea(gridKey, 20, 'regional');
      }
    } catch (err) {
      this.logger.warn('store cache save 失敗', err instanceof Error ? err.message : String(err));
    }
    try {
      await this.storeCacheRepository.enqueueJob(lat, lng);
      this.logger.log(`job enqueued lat=${lat} lng=${lng}`);
    } catch (err) {
      this.logger.warn('cache_job 投入失敗', err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * バッチジョブを実行する（cache_jobs から pending を取り出して処理）。
   * Lambda の月次バッチスクリプトや CacheJobController から呼ばれる。
   */
  async processNextJob(): Promise<boolean> {
    const job = await this.storeCacheRepository.dequeueJob();
    if (!job) return false;

    try {
      const gridKey = toGridKey(job.lat, job.lng);
      this.logger.log(`processing job=${job.id} gridKey=${gridKey}`);

      const batchStartedAt = new Date();
      const raw = await this.yahooClient.fetchAllStores(job.lat, job.lng, 20);
      const stores: StoreCacheInput[] = raw.map(toStoreCacheInput('batch'));

      await this.storeCacheRepository.upsertBatch(stores, gridKey, 20, 'regional', batchStartedAt);
      await this.storeCacheRepository.completeJob(job.id);

      this.logger.log(`job=${job.id} done stores=${stores.length}`);
      return true;
    } catch (err) {
      await this.storeCacheRepository.failJob(job.id);
      this.logger.error(`job=${job.id} failed`, err instanceof Error ? err.message : String(err));
      return false;
    }
  }
}

function toStoreCacheInput(source: 'batch' | 'realtime') {
  return (raw: YahooStoreRaw): StoreCacheInput => ({
    uid: raw.uid,
    name: raw.name,
    address: raw.address,
    genre: raw.genre,
    lat: raw.lat,
    lng: raw.lng,
    source,
  });
}

/** Yahoo 生データを距離順 StoreCandidate[] に変換する（DB roundtrip なし） */
function rawToSortedCandidates(raw: YahooStoreRaw[], lat: number, lng: number): StoreCandidate[] {
  return raw
    .map((s) => ({
      name: s.name,
      placeId: s.uid,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      distanceKm: haversineKm(lat, lng, s.lat, s.lng),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
