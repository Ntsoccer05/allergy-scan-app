import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ScanHistoryLocation } from '../shared/types/db.types';

/** scan_histories テーブルの UPDATE データ型。 */
export type UpdateScanHistoryData = {
  productName?: string | null;
  storeName?: string | null;
  memo?: string | null;
  isPublic?: boolean;
  thumbnailUrl?: string | null;
};

/** scan_histories テーブルへの INSERT データ型。 */
export type CreateScanHistoryData = {
  userId: string;
  productId: string | null;
  productName: string | null;
  judgment: 'ng' | 'partial' | 'ok';
  detected: string[];
  location: ScanHistoryLocation | null;
  thumbnailUrl: string | null;
};

/** scan_histories テーブルのレコード型（Repository 外部公開用）。 */
export type ScanHistoryRecord = {
  id: string;
  userId: string;
  productId: string | null;
  productName: string | null;
  judgment: string;
  detected: string[];
  location: ScanHistoryLocation | null;
  thumbnailUrl: string | null;
  isPublic: boolean;
  memo: string | null;
  scannedAt: Date;
};

/**
 * 公開履歴のレスポンス型。
 * 個人情報（userId・detected・location の lat/lng・memo）を除外した安全な型。
 */
export type PublicHistoryRecord = {
  id: string;
  productName: string | null;
  judgment: string;
  thumbnailUrl: string | null;
  storeName: string | null;
  scannedAt: Date;
};

/** findByUser のオプション型。 */
export type FindByUserOptions = {
  before?: Date;
  judgment?: string;
  limit: number;
};

@Injectable()
export class ScanHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * カーソルベースページネーションで scan_histories を取得する（patterns.md パターン4）。
   * limit+1 件取得し、超過分の有無で次ページを判定する。
   */
  async findByUser(
    userId: string,
    options: FindByUserOptions,
  ): Promise<ScanHistoryRecord[]> {
    const { before, judgment, limit } = options;

    const records = await this.prisma.scanHistory.findMany({
      where: {
        userId,
        ...(judgment !== undefined && judgment !== 'all' ? { judgment } : {}),
        ...(before !== undefined ? { scannedAt: { lt: before } } : {}),
      },
      orderBy: { scannedAt: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        userId: true,
        productId: true,
        productName: true,
        judgment: true,
        detected: true,
        location: true,
        thumbnailUrl: true,
        isPublic: true,
        memo: true,
        scannedAt: true,
      },
    });

    return records.map((record) => ({
      id: record.id,
      userId: record.userId,
      productId: record.productId,
      productName: record.productName,
      judgment: record.judgment,
      // JSONB フィールドを string[] として解釈する（db.types.ts 準拠）
      detected: (record.detected as unknown as string[]) ?? [],
      location: (record.location as unknown as ScanHistoryLocation) ?? null,
      thumbnailUrl: record.thumbnailUrl,
      isPublic: record.isPublic,
      memo: record.memo,
      scannedAt: record.scannedAt,
    }));
  }

  /** scan_histories テーブルから ID でレコードを取得する。存在しない場合は null を返す。 */
  async findById(id: string): Promise<ScanHistoryRecord | null> {
    const record = await this.prisma.scanHistory.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        productId: true,
        productName: true,
        judgment: true,
        detected: true,
        location: true,
        thumbnailUrl: true,
        isPublic: true,
        memo: true,
        scannedAt: true,
      },
    });
    if (!record) return null;
    return {
      id: record.id,
      userId: record.userId,
      productId: record.productId,
      productName: record.productName,
      judgment: record.judgment,
      detected: (record.detected as unknown as string[]) ?? [],
      location: (record.location as unknown as ScanHistoryLocation) ?? null,
      thumbnailUrl: record.thumbnailUrl,
      isPublic: record.isPublic,
      memo: record.memo,
      scannedAt: record.scannedAt,
    };
  }

  /**
   * scan_histories テーブルの location フィールドを更新する。
   * 所有権チェックは Service 層で行う。
   */
  async updateLocation(
    id: string,
    location: ScanHistoryLocation,
  ): Promise<void> {
    await this.prisma.scanHistory.update({
      where: { id },
      data: { location },
    });
  }

  /** scan_histories テーブルに新規レコードを INSERT する。 */
  async create(data: CreateScanHistoryData): Promise<ScanHistoryRecord> {
    const record = await this.prisma.scanHistory.create({
      data: {
        userId: data.userId,
        productId: data.productId,
        productName: data.productName,
        judgment: data.judgment,
        detected: data.detected,
        location: data.location ?? undefined,
        thumbnailUrl: data.thumbnailUrl,
      },
      select: {
        id: true,
        userId: true,
        productId: true,
        productName: true,
        judgment: true,
        detected: true,
        location: true,
        thumbnailUrl: true,
        isPublic: true,
        memo: true,
        scannedAt: true,
      },
    });
    return {
      id: record.id,
      userId: record.userId,
      productId: record.productId,
      productName: record.productName,
      judgment: record.judgment,
      // JSONB フィールドを string[] として解釈する（db.types.ts 準拠）
      detected: (record.detected as unknown as string[]) ?? [],
      location: (record.location as unknown as ScanHistoryLocation) ?? null,
      thumbnailUrl: record.thumbnailUrl,
      isPublic: record.isPublic,
      memo: record.memo,
      scannedAt: record.scannedAt,
    };
  }

  /**
   * scan_histories テーブルの product_name・store_name（location 内）・memo を更新する。
   * storeName が指定された場合は既存 location の lat/lng を維持しつつ store_name のみ更新する。
   * 所有権チェックは Service 層で行う。
   */
  async update(id: string, data: UpdateScanHistoryData): Promise<void> {
    const updateData: Record<string, unknown> = {};

    if (data.productName !== undefined) {
      updateData.productName = data.productName;
    }

    if (data.storeName !== undefined) {
      // storeName 更新時は既存の lat/lng を維持するため findById で取得して merge する
      const existing = await this.findById(id);
      const existingLocation = existing?.location;
      updateData.location = existingLocation
        ? { store_name: data.storeName, lat: existingLocation.lat, lng: existingLocation.lng }
        : { store_name: data.storeName };
    }

    if (data.memo !== undefined) {
      updateData.memo = data.memo;
    }

    if (data.isPublic !== undefined) {
      updateData.isPublic = data.isPublic;
    }

    if (data.thumbnailUrl !== undefined) {
      updateData.thumbnailUrl = data.thumbnailUrl;
    }

    await this.prisma.scanHistory.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * 指定された ID リストのうち userId に属するレコードを一括物理削除する。
   * ids が空配列の場合は何もしない。
   * 所有権は WHERE userId = userId で保証するため、他ユーザーの ID を含めても削除されない。
   */
  async deleteManyByIds(userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.scanHistory.deleteMany({
      where: { id: { in: ids }, userId },
    });
  }

  /**
   * isPublic: true かつ judgment = 'ok' のスキャン履歴をカーソルページネーションで取得する。
   * 認証不要のパブリック履歴一覧に使用する。
   * ⚠️ 安全設計: userId・detected・location の lat/lng・memo は返却しない（個人情報漏洩防止）。
   * ⚠️ anti_patterns.md #4: OK 判定のみ公開可能（NG・一部含む は公開不可）。
   */
  async findPublicHistory(limit: number, before?: Date): Promise<PublicHistoryRecord[]> {
    const records = await this.prisma.scanHistory.findMany({
      where: {
        isPublic: true,
        judgment: 'ok',
        ...(before ? { scannedAt: { lt: before } } : {}),
      },
      orderBy: { scannedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        productName: true,
        judgment: true,
        thumbnailUrl: true,
        location: true,
        scannedAt: true,
      },
    });
    return records.map((record) => ({
      id: record.id,
      productName: record.productName,
      judgment: record.judgment,
      thumbnailUrl: record.thumbnailUrl,
      // location JSONB から store_name のみ抽出する。lat/lng は返却しない
      storeName: (record.location as unknown as ScanHistoryLocation | null)?.store_name ?? null,
      scannedAt: record.scannedAt,
    }));
  }

  /** isPublic: true かつ judgment = 'ok' の履歴件数と最終スキャン日時を返す（ダイジェスト用）。 */
  async getPublicHistoryDigest(): Promise<{ count: number; last_updated_at: Date | null }> {
    const where = { isPublic: true, judgment: 'ok' } as const;
    const [count, latest] = await Promise.all([
      this.prisma.scanHistory.count({ where }),
      this.prisma.scanHistory.findFirst({
        where,
        orderBy: { scannedAt: 'desc' },
        select: { scannedAt: true },
      }),
    ]);
    return { count, last_updated_at: latest?.scannedAt ?? null };
  }

  /**
   * scan_histories テーブルからレコードを物理削除する。
   * 存在しない場合の Prisma エラー（P2025）は Service 層の findById null チェックで防ぐ。
   * 所有権チェックは Service 層で行う。
   */
  async deleteById(id: string): Promise<void> {
    await this.prisma.scanHistory.delete({
      where: { id },
    });
  }
}
