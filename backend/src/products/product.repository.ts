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
  /** この商品の最新の公開スキャン履歴のサムネイル（なければ null）。 */
  thumbnailUrl: string | null;
  /** この商品の最新の公開スキャン履歴の店舗名（なければ null）。 */
  storeName: string | null;
  /** 商品の原材料テキスト（詳細表示用）。 */
  rawText: string | null;
  updatedAt: Date;
  expiresAt: Date | null;
};

/** findOthersForUser のオプション型。 */
export type FindOthersOptions = {
  /** updated_at カーソル（この日時より古い商品を取得）。 */
  cursor?: Date;
  /** 最大取得件数（limit+1 件取得して次ページ判定に使う）。 */
  limit: number;
  /** 商品名の部分一致検索キーワード（大文字小文字を区別しない）。 */
  q?: string;
  /** 店舗名（公開履歴の location.store_name）の部分一致フィルタ。 */
  store?: string;
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
  /** OCR 由来の場合の読み取り信頼度（OFF 由来は null）。JAN キャッシュの配信可否判定に使う。 */
  confidence: string | null;
  /** 原材料テキスト（OCR 由来 JAN キャッシュの検証表示用）。 */
  rawText: string | null;
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
        confidence: true,
        rawText: true,
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
      confidence: product.confidence,
      rawText: product.rawText,
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
        confidence: true,
        rawText: true,
      },
    });

    return {
      id: product.id,
      productName: product.productName,
      allergens: product.allergens as ProductAllergens,
      scanCount: product.scanCount,
      expiresAt: product.expiresAt,
      confidence: product.confidence,
      rawText: product.rawText,
    };
  }

  /**
   * 公開スキャン（is_public = TRUE）が1件以上ある商品一覧を取得する。
   * 自分がスキャンした商品も、公開されていれば含める（公開した本人にも見える）。
   * カーソルは updated_at の値を使い、updated_at DESC 順で返す（R4）。
   * limit+1 件取得し、超過分の有無で次ページを判定する。
   * ⚠️ プライバシー: サムネイルも公開履歴のものだけを使う（非公開スキャンの写真を露出させない）。
   */
  async findOthersForUser(
    options: FindOthersOptions,
  ): Promise<OthersProductRecord[]> {
    const { cursor, limit, q, store } = options;

    const cursorFragment = cursor
      ? Prisma.sql`AND p.updated_at < ${cursor}::timestamptz`
      : Prisma.empty;
    const qFragment = q
      ? Prisma.sql`AND p.product_name ILIKE ${'%' + q + '%'}`
      : Prisma.empty;
    // 店舗フィルタは公開履歴の location.store_name に対して適用する
    const storeFragment = store
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM scan_histories s3
          WHERE s3.product_id = p.id
            AND s3.is_public = TRUE
            AND s3.location->>'store_name' ILIKE ${'%' + store + '%'}
        )`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        product_name: string | null;
        allergens: unknown;
        thumbnail_url: string | null;
        store_name: string | null;
        raw_text: string | null;
        updated_at: Date;
        expires_at: Date | null;
      }[]
    >(
      Prisma.sql`
      SELECT
        p.id,
        p.product_name,
        p.allergens,
        t.thumbnail_url,
        s.store_name,
        p.raw_text,
        p.updated_at,
        p.expires_at
      FROM products p
      LEFT JOIN LATERAL (
        SELECT sh2.thumbnail_url
        FROM scan_histories sh2
        WHERE sh2.product_id = p.id
          AND sh2.thumbnail_url IS NOT NULL
          AND sh2.is_public = TRUE
        ORDER BY sh2.scanned_at DESC
        LIMIT 1
      ) t ON TRUE
      LEFT JOIN LATERAL (
        SELECT sh3.location->>'store_name' AS store_name
        FROM scan_histories sh3
        WHERE sh3.product_id = p.id
          AND sh3.location->>'store_name' IS NOT NULL
          AND sh3.is_public = TRUE
        ORDER BY sh3.scanned_at DESC
        LIMIT 1
      ) s ON TRUE
      WHERE EXISTS (
        SELECT 1 FROM scan_histories pub
        WHERE pub.product_id = p.id AND pub.is_public = TRUE
      )
      ${cursorFragment}
      ${qFragment}
      ${storeFragment}
      ORDER BY p.updated_at DESC
      LIMIT ${limit + 1}
      `,
    );

    return rows.map((row) => ({
      id: row.id,
      productName: row.product_name,
      // JSONB フィールドを ProductAllergens として解釈する（db.types.ts 準拠）
      allergens: row.allergens as ProductAllergens,
      thumbnailUrl: row.thumbnail_url,
      storeName: row.store_name,
      rawText: row.raw_text,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
    }));
  }

  /**
   * 指定 ID リストの products.raw_text を返す。
   * scan_histories に raw_text がないバーコードスキャン履歴の再評価に使用する。
   */
  async findRawTextsByIds(ids: string[]): Promise<Map<string, string | null>> {
    if (ids.length === 0) return new Map();
    const records = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, rawText: true },
    });
    return new Map(records.map((r) => [r.id, r.rawText ?? null]));
  }

  /**
   * 指定 ID リストの products.allergens を返す。
   * 履歴一覧を現在のアレルギー設定で再導出するために使用する。
   */
  async findAllergensByIds(
    ids: string[],
  ): Promise<Map<string, ProductAllergens>> {
    if (ids.length === 0) return new Map();
    const records = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, allergens: true },
    });
    return new Map(
      records.map((r) => [r.id, r.allergens as ProductAllergens]),
    );
  }

  /**
   * products.product_name を更新する。
   * 履歴編集で手動入力された商品名を products にも反映させるために使用する。
   */
  async updateProductName(productId: string, productName: string): Promise<void> {
    await this.prisma.product.update({
      where: { id: productId },
      data: { productName },
    });
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
        confidence: true,
        rawText: true,
      },
    });

    return {
      id: product.id,
      productName: product.productName,
      allergens: product.allergens as ProductAllergens,
      scanCount: product.scanCount,
      expiresAt: product.expiresAt,
      confidence: product.confidence,
      rawText: product.rawText,
    };
  }
}
