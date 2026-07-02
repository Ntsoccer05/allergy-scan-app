import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StoreCandidate } from './places/places.interface';
import { STORE_CACHE_EXPIRE_DAYS } from './places/places.constants';

/** Haversine 距離計算（km） */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 0.01°グリッドキーを生成する */
export function toGridKey(lat: number, lng: number): string {
  return `${Math.floor(lat * 100)}_${Math.floor(lng * 100)}`;
}

/** store_cache の有効期限（日）を計算する */
function getStoreExpireDays(tier: 'metro' | 'regional'): number {
  return tier === 'metro' ? STORE_CACHE_EXPIRE_DAYS.METRO : STORE_CACHE_EXPIRE_DAYS.REGIONAL;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Yahoo API から取得した生データ（StoreCacheRepository に渡す形式） */
export type StoreCacheInput = {
  uid: string;
  name: string;
  address?: string;
  genre?: string;
  lat: number;
  lng: number;
  source: 'batch' | 'realtime';
};

@Injectable()
export class StoreCacheRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 指定座標の近傍キャッシュを取得し、距離順で StoreCandidate[] を返す（20km 以内全件）。
   * フロントエンドのオートコンプリート検索で絞り込むため、件数制限は行わない。
   */
  async findNearby(lat: number, lng: number): Promise<StoreCandidate[]> {
    const now = new Date();

    // 20km 圏内の有効キャッシュを全取得（おおよその bbox でフィルタ）
    const bboxDelta = 0.2; // 20km ≒ 0.18°
    const raw = await this.prisma.storeCache.findMany({
      where: {
        lat: { gte: lat - bboxDelta, lte: lat + bboxDelta },
        lng: { gte: lng - bboxDelta, lte: lng + bboxDelta },
        expiresAt: { gt: now },
      },
    });

    // Haversine で正確な距離を計算して距離順にソートして返す
    return raw
      .map((s) => ({ ...s, distanceKm: haversineKm(lat, lng, s.lat, s.lng) }))
      .filter((s) => s.distanceKm <= 20)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .map((s) => ({
        name: s.name,
        placeId: s.uid,
        address: s.address ?? undefined,
        distanceKm: s.distanceKm,
        lat: s.lat,
        lng: s.lng,
      }));
  }

  /**
   * エリアカバー記録を確認する（キャッシュ済みエリアかどうか）
   */
  async findArea(gridKey: string): Promise<boolean> {
    const area = await this.prisma.storeCacheArea.findUnique({
      where: { gridKey },
      select: { expiresAt: true },
    });
    if (!area) return false;
    return area.expiresAt > new Date();
  }

  /**
   * バッチ取得結果を store_cache に一括 UPSERT し、エリアカバー記録を更新する。
   * - uid で UPSERT（重複は name/address/genre/lat/lng/source/expiresAt を更新）
   * - batchStartedAt より古いバッチデータを物理削除
   * - store_cache_areas に gridKey を記録
   */
  async upsertBatch(
    stores: StoreCacheInput[],
    gridKey: string,
    radiusKm: number,
    tier: 'metro' | 'regional',
    batchStartedAt: Date,
  ): Promise<void> {
    const now = new Date();
    const storeExpireDays = getStoreExpireDays(tier);
    const storeExpiresAt = addDays(now, storeExpireDays);
    const areaExpiresAt = addDays(now, storeExpireDays);

    // store_cache に UPSERT
    await Promise.all(
      stores.map((s) =>
        this.prisma.storeCache.upsert({
          where: { uid: s.uid },
          create: {
            uid: s.uid,
            name: s.name,
            address: s.address,
            genre: s.genre,
            lat: s.lat,
            lng: s.lng,
            source: s.source,
            expiresAt: storeExpiresAt,
          },
          update: {
            name: s.name,
            address: s.address,
            genre: s.genre,
            lat: s.lat,
            lng: s.lng,
            source: s.source,
            expiresAt: storeExpiresAt,
          },
        }),
      ),
    );

    // 旧バッチデータを物理削除（今回更新されなかった古いバッチデータ）
    await this.prisma.storeCache.deleteMany({
      where: {
        source: 'batch',
        updatedAt: { lt: batchStartedAt },
      },
    });

    // store_cache_areas に UPSERT
    await this.prisma.storeCacheArea.upsert({
      where: { gridKey },
      create: {
        gridKey,
        radiusKm,
        tier,
        expiresAt: areaExpiresAt,
      },
      update: {
        radiusKm,
        tier,
        fetchedAt: now,
        expiresAt: areaExpiresAt,
      },
    });
  }

  /**
   * リアルタイム取得結果を store_cache に UPSERT する（エリアカバー記録は更新しない）。
   */
  async upsertRealtime(stores: StoreCacheInput[], tier: 'metro' | 'regional'): Promise<void> {
    const storeExpiresAt = addDays(new Date(), getStoreExpireDays(tier));

    await Promise.all(
      stores.map((s) =>
        this.prisma.storeCache.upsert({
          where: { uid: s.uid },
          create: {
            uid: s.uid,
            name: s.name,
            address: s.address,
            genre: s.genre,
            lat: s.lat,
            lng: s.lng,
            source: 'realtime',
            expiresAt: storeExpiresAt,
          },
          update: {
            name: s.name,
            address: s.address,
            genre: s.genre,
            lat: s.lat,
            lng: s.lng,
            expiresAt: storeExpiresAt,
          },
        }),
      ),
    );
  }

  /** store_cache_areas にエリアカバー記録を追加する（次回はキャッシュヒットさせる） */
  async recordArea(gridKey: string, radiusKm: number, tier: 'metro' | 'regional'): Promise<void> {
    const expiresAt = addDays(new Date(), getStoreExpireDays(tier));
    await this.prisma.storeCacheArea.upsert({
      where: { gridKey },
      create: { gridKey, radiusKm, tier, expiresAt },
      update: { radiusKm, tier, fetchedAt: new Date(), expiresAt },
    });
  }

  /** cache_jobs にジョブを追加する（OCR 完了後のバックグラウンドキャッシュ用） */
  async enqueueJob(lat: number, lng: number): Promise<void> {
    await this.prisma.cacheJob.create({
      data: { lat, lng, status: 'pending' },
    });
  }

  /** pending なジョブを取得してステータスを processing に更新する */
  async dequeueJob(): Promise<{ id: string; lat: number; lng: number } | null> {
    const job = await this.prisma.cacheJob.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) return null;

    await this.prisma.cacheJob.update({
      where: { id: job.id },
      data: { status: 'processing' },
    });

    return { id: job.id, lat: job.lat, lng: job.lng };
  }

  /** ジョブを完了状態に更新する */
  async completeJob(id: string): Promise<void> {
    await this.prisma.cacheJob.update({
      where: { id },
      data: { status: 'done', processedAt: new Date() },
    });
  }

  /** ジョブを失敗状態に更新する */
  async failJob(id: string): Promise<void> {
    await this.prisma.cacheJob.update({
      where: { id },
      data: { status: 'failed', processedAt: new Date() },
    });
  }
}
