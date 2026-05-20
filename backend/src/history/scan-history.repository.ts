import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ScanHistoryLocation } from '../shared/types/db.types';

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
      scannedAt: record.scannedAt,
    };
  }
}
