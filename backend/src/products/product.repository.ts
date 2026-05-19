import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ProductAllergens } from '../shared/types/db.types';
import { calcExpiresAt } from './expires-at.util';
import { buildJanIdValue, buildHashIdValue } from './product-id.util';

/** GET /products/others の1件レコード型。 */
export type OthersProductRecord = {
  id: string;
  productName: string | null;
  allergens: ProductAllergens;
  updatedAt: Date;
  expiresAt: Date | null;
};

/** findOthersForUser のオプション型。 */
export type FindOthersOptions = {
  /** updated_at カーソル（この日時より古い商品を取得）。 */
  cursor?: Date;
  /** 最大取得件数（limit+1 件取得して次ページ判定に使う）。 */
  limit: number;
};

/** products テーブルの検索・UPSERT に必要な入力データ。 */
export type UpsertProductData = {
  productName: string | null;
  allergens: ProductAllergens;
  rawText?: string;
  confidence?: string;
};

/** label_hash ベースの UPSERT に必要な追加データ。 */
export type UpsertHashProductData = UpsertProductData & {
  storeName?: string | null;
};

/** products テーブルのレコード（ScanService が使う最低限のフィールド）。 */
export type ProductRecord = {
  id: string;
  productName: string | null;
  allergens: ProductAllergens;
  scanCount: number;
  expiresAt: Date | null;
};

@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * JAN コードで有効期限内の商品を返す。
   * expires_at が NULL または期限切れの場合は null を返す。
   */
  async findByJan(janCode: string): Promise<ProductRecord | null> {
    const idValue = buildJanIdValue(janCode);
    const product = await this.prisma.product.findUnique({
      where: { idType_idValue: { idType: 'jan', idValue } },
      select: {
        id: true,
        productName: true,
        allergens: true,
        scanCount: true,
        expiresAt: true,
      },
    });
    if (!product) return null;
    if (!product.expiresAt || product.expiresAt < new Date()) return null;

    return {
      id: product.id,
      productName: product.productName,
      // JSONB フィールドを ProductAllergens として解釈する（db.types.ts 準拠）
      allergens: product.allergens as ProductAllergens,
      scanCount: product.scanCount,
      expiresAt: product.expiresAt,
    };
  }

  /**
   * JAN コードで商品を UPSERT する。
   * 既存レコードがある場合は scan_count +1 と expires_at の再計算を行う。
   * Prisma の upsert は ON CONFLICT (id_type, id_value) に相当する。
   */
  async upsertByJan(
    janCode: string,
    data: UpsertProductData,
  ): Promise<ProductRecord> {
    const idValue = buildJanIdValue(janCode);
    const allergensJson = data.allergens;

    // 現在の scan_count を取得して expires_at を計算するため findUnique を先行実行する
    const existing = await this.prisma.product.findUnique({
      where: { idType_idValue: { idType: 'jan', idValue } },
      select: { scanCount: true },
    });
    const nextScanCount = (existing?.scanCount ?? 0) + 1;
    const expiresAt = calcExpiresAt(nextScanCount);

    const product = await this.prisma.product.upsert({
      where: { idType_idValue: { idType: 'jan', idValue } },
      create: {
        idType: 'jan',
        idValue,
        productName: data.productName,
        allergens: allergensJson,
        rawText: data.rawText,
        confidence: data.confidence,
        scanCount: 1,
        expiresAt: calcExpiresAt(1),
      },
      update: {
        productName: data.productName,
        allergens: allergensJson,
        rawText: data.rawText,
        confidence: data.confidence,
        scanCount: { increment: 1 },
        expiresAt,
      },
      select: {
        id: true,
        productName: true,
        allergens: true,
        scanCount: true,
        expiresAt: true,
      },
    });

    return {
      id: product.id,
      productName: product.productName,
      allergens: product.allergens as ProductAllergens,
      scanCount: product.scanCount,
      expiresAt: product.expiresAt,
    };
  }

  /**
   * リクエストユーザーが scan_histories に持たない商品一覧を取得する（R3）。
   * カーソルは updated_at の値を使い、updated_at DESC 順で返す（R4）。
   * limit+1 件取得し、超過分の有無で次ページを判定する。
   */
  async findOthersForUser(
    userId: string,
    options: FindOthersOptions,
  ): Promise<OthersProductRecord[]> {
    const { cursor, limit } = options;

    const cursorFragment = cursor
      ? Prisma.sql`AND p.updated_at < ${cursor}::timestamptz`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        product_name: string | null;
        allergens: unknown;
        updated_at: Date;
        expires_at: Date | null;
      }[]
    >(
      Prisma.sql`
      SELECT
        p.id,
        p.product_name,
        p.allergens,
        p.updated_at,
        p.expires_at
      FROM products p
      LEFT JOIN scan_histories sh
        ON sh.product_id = p.id AND sh.user_id = ${userId}
      WHERE sh.id IS NULL
      ${cursorFragment}
      ORDER BY p.updated_at DESC
      LIMIT ${limit + 1}
      `,
    );

    return rows.map((row) => ({
      id: row.id,
      productName: row.product_name,
      // JSONB フィールドを ProductAllergens として解釈する（db.types.ts 準拠）
      allergens: row.allergens as ProductAllergens,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
    }));
  }

  /**
   * label_hash で惣菜商品を UPSERT する（patterns.md パターン3）。
   * 既存レコードがある場合は scan_count +1 と expires_at の再計算を行う。
   */
  async upsertByHash(
    labelHash: string,
    data: UpsertHashProductData,
  ): Promise<ProductRecord> {
    const idValue = buildHashIdValue(labelHash);

    // 現在の scan_count を取得して expires_at を計算するため findUnique を先行実行する
    const existing = await this.prisma.product.findUnique({
      where: { idType_idValue: { idType: 'hash', idValue } },
      select: { scanCount: true },
    });
    const nextScanCount = (existing?.scanCount ?? 0) + 1;
    const expiresAt = calcExpiresAt(nextScanCount);

    const product = await this.prisma.product.upsert({
      where: { idType_idValue: { idType: 'hash', idValue } },
      create: {
        idType: 'hash',
        idValue,
        productName: data.productName,
        storeName: data.storeName,
        allergens: data.allergens,
        rawText: data.rawText,
        confidence: data.confidence,
        scanCount: 1,
        expiresAt: calcExpiresAt(1),
      },
      update: {
        productName: data.productName,
        storeName: data.storeName,
        allergens: data.allergens,
        rawText: data.rawText,
        confidence: data.confidence,
        scanCount: { increment: 1 },
        expiresAt,
      },
      select: {
        id: true,
        productName: true,
        allergens: true,
        scanCount: true,
        expiresAt: true,
      },
    });

    return {
      id: product.id,
      productName: product.productName,
      allergens: product.allergens as ProductAllergens,
      scanCount: product.scanCount,
      expiresAt: product.expiresAt,
    };
  }
}
