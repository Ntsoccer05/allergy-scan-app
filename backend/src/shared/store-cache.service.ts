import { Injectable, Logger } from '@nestjs/common';
import { StoreCacheRepository, toGridKey, StoreCacheInput } from './store-cache.repository';
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

    // 2. リアルタイム取得（Yahoo API 1ページ/ジャンル・都市部では不完全）
    this.logger.log(`cache miss gridKey=${gridKey} → realtime fetch`);
    const raw = await this.yahooClient.fetchNearby(lat, lng, 20);
    const stores: StoreCacheInput[] = raw.map(toStoreCacheInput('realtime'));

    if (stores.length > 0) {
      await this.storeCacheRepository.upsertRealtime(stores, 'regional');
    }

    // 3. バックグラウンドジョブを常に投入（全ジャンル全ページ取得 → 次回はフルキャッシュ）
    void this.storeCacheRepository.enqueueJob(lat, lng).catch((err) => {
      this.logger.warn('cache_job 投入失敗', err instanceof Error ? err.message : String(err));
    });
    this.logger.log(`job enqueued lat=${lat} lng=${lng}`);

    // リアルタイム取得結果を返す（都市部では不完全なため cacheLoading: true）
    const candidates = await this.storeCacheRepository.findNearby(lat, lng);
    return { candidates, cacheLoading: true };
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
