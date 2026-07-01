import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ScanHistoryLocation, ProductAllergens } from '../shared/types/db.types';
import { kanaSearchVariants } from '../shared/kana.util';

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
  rawText?: string | null;
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
  rawText: string | null;
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

/** マップ用ピン（自分の履歴）。location に有効な lat/lng を持つ履歴のみ。 */
export type LocationPinRecord = {
  id: string;
  productName: string | null;
  judgment: string;
  detected: string[];
  thumbnailUrl: string | null;
  storeName: string | null;
  lat: number;
  lng: number;
  scannedAt: Date;
  rawText: string | null;
};

/**
 * マップ用ピン（公開履歴）。
 * ⚠️ プライバシー: userId・detected・rawText・memo を含まない。
 */
export type PublicLocationPinRecord = Omit<
  LocationPinRecord,
  'detected' | 'rawText'
>;

/** $queryRaw が返すマップピン行の型（snake_case カラム名）。 */
type LocationPinRow = {
  id: string;
  product_name: string | null;
  judgment: string;
  detected: unknown;
  thumbnail_url: string | null;
  store_name: string | null;
  lat: number;
  lng: number;
  scanned_at: Date;
  raw_text: string | null;
};

/** GET /history グループ内の1スキャン。 */
export type ScanRecord = {
  id: string;
  scannedAt: Date;
  location: ScanHistoryLocation | null;
  memo: string | null;
  thumbnailUrl: string | null;
  rawText: string | null;
};

/** GET /history のグループ型（商品単位）。 */
export type HistoryGroupRecord = {
  productId: string | null;
  productName: string | null;
  allergens: ProductAllergens;
  thumbnailUrl: string | null;
  itemUrl: string | null;
  latestScanAt: Date;
  scans: ScanRecord[];
};

/** findByUser のオプション型。 */
export type FindByUserOptions = {
  before?: Date;
  judgment?: string;
  limit: number;
  /** 商品名の部分一致検索キーワード（大文字小文字を区別しない）。 */
  q?: string;
  /** 店舗名（location.store_name）の部分一致フィルタ。 */
  store?: string;
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
    const { before, judgment, limit, q, store } = options;

    const records = await this.prisma.scanHistory.findMany({
      where: {
        userId,
        ...(judgment !== undefined && judgment !== 'all' ? { judgment } : {}),
        ...(before !== undefined ? { scannedAt: { lt: before } } : {}),
        ...(q ? { productName: { contains: q, mode: 'insensitive' } } : {}),
        // location JSONB の store_name キーを部分一致で絞り込む
        ...(store
          ? { location: { path: ['store_name'], string_contains: store } }
          : {}),
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
        rawText: true,
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
      rawText: record.rawText,
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
        rawText: true,
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
      rawText: record.rawText,
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
        rawText: data.rawText ?? undefined,
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
        rawText: true,
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
      rawText: record.rawText,
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
      // storeName 更新時は既存の lat/lng（および place_id）を維持するため findById で取得して merge する
      const existing = await this.findById(id);
      const existingLocation = existing?.location;
      updateData.location = existingLocation
        ? { ...existingLocation, store_name: data.storeName }
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
   * マップ表示用: location に有効な lat/lng を持つ自分の履歴を最新順に取得する。
   * JSONB キーの数値型判定は Prisma クエリビルダーで表現できないため
   * $queryRaw + Prisma.sql を使う（patterns.md パターン15）。
   */
  async findLocationPinsByUser(
    userId: string,
    limit: number,
  ): Promise<LocationPinRecord[]> {
    const rows = await this.prisma.$queryRaw<LocationPinRow[]>(Prisma.sql`
      SELECT
        id,
        product_name,
        judgment,
        detected,
        thumbnail_url,
        location->>'store_name' AS store_name,
        (location->>'lat')::float8 AS lat,
        (location->>'lng')::float8 AS lng,
        scanned_at,
        raw_text
      FROM scan_histories
      WHERE user_id = ${userId}
        AND jsonb_typeof(location->'lat') = 'number'
        AND jsonb_typeof(location->'lng') = 'number'
      ORDER BY scanned_at DESC
      LIMIT ${limit}
    `);
    return rows.map((row) => ({
      id: row.id,
      productName: row.product_name,
      judgment: row.judgment,
      // JSONB フィールドを string[] として解釈する（db.types.ts 準拠）
      detected: (row.detected as string[]) ?? [],
      thumbnailUrl: row.thumbnail_url,
      storeName: row.store_name,
      lat: row.lat,
      lng: row.lng,
      scannedAt: row.scanned_at,
      rawText: row.raw_text,
    }));
  }

  /**
   * マップ表示用: 公開履歴のピンを最新順に取得する。
   * ⚠️ プライバシー: 店舗名が確定している履歴のみ公開ピン化する
   * （自宅等でスキャンした座標をそのまま公開しないための設計判断。task 00320 参照）。
   * ⚠️ anti_patterns.md #4: OK 判定のみ公開可能（findPublicHistory と同一ポリシー）。
   * userId・detected・rawText・memo は返却しない。
   */
  async findPublicLocationPins(
    limit: number,
  ): Promise<PublicLocationPinRecord[]> {
    const rows = await this.prisma.$queryRaw<LocationPinRow[]>(Prisma.sql`
      SELECT
        id,
        product_name,
        judgment,
        thumbnail_url,
        location->>'store_name' AS store_name,
        (location->>'lat')::float8 AS lat,
        (location->>'lng')::float8 AS lng,
        scanned_at
      FROM scan_histories
      WHERE is_public = true
        AND judgment = 'ok'
        AND COALESCE(location->>'store_name', '') <> ''
        AND jsonb_typeof(location->'lat') = 'number'
        AND jsonb_typeof(location->'lng') = 'number'
      ORDER BY scanned_at DESC
      LIMIT ${limit}
    `);
    return rows.map((row) => ({
      id: row.id,
      productName: row.product_name,
      judgment: row.judgment,
      thumbnailUrl: row.thumbnail_url,
      storeName: row.store_name,
      lat: row.lat,
      lng: row.lng,
      scannedAt: row.scanned_at,
    }));
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

  /**
   * 商品単位でグループ化した履歴を取得する（GROUP BY product_id）。
   * judgment フィルタはサービス層で re-derive 後に適用するため SQL ではフィルタしない。
   * カーソル: latestScanAt（グループ内の最新スキャン日時）の降順。
   * limit+1 件取得して next_cursor 判定に使う。
   */
  async findGroupsByUser(
    userId: string,
    options: { before?: Date; limit: number; q?: string; store?: string },
  ): Promise<HistoryGroupRecord[]> {
    const { before, limit, q, store } = options;

    // ひらがな・カタカナ双方向マッチ: 入力をカタカナ版とひらがな版に変換して OR 検索
    const qFragment = q
      ? (() => {
          const [qKata, qHira] = kanaSearchVariants(q);
          return Prisma.sql`AND (p.product_name ILIKE ${'%' + qKata + '%'} OR p.product_name ILIKE ${'%' + qHira + '%'})`;
        })()
      : Prisma.empty;

    const storeFragment = store
      ? (() => {
          const [sKata, sHira] = kanaSearchVariants(store);
          return Prisma.sql`AND EXISTS (
          SELECT 1 FROM scan_histories sh2
          WHERE sh2.product_id = sh.product_id
            AND sh2.user_id = ${userId}
            AND (sh2.location->>'store_name' ILIKE ${'%' + sKata + '%'}
              OR sh2.location->>'store_name' ILIKE ${'%' + sHira + '%'})
        )`;
        })()
      : Prisma.empty;

    const beforeHaving =
      before !== undefined
        ? Prisma.sql`AND MAX(sh.scanned_at) < ${before}::timestamptz`
        : Prisma.empty;

    type GroupRow = {
      product_id: string | null;
      product_name: string | null;
      allergens: unknown;
      thumbnail_url: string | null;
      item_url: string | null;
      latest_scan_at: Date;
      scans: unknown;
    };

    const rows = await this.prisma.$queryRaw<GroupRow[]>(Prisma.sql`
      SELECT
        p.id AS product_id,
        p.product_name,
        p.allergens,
        p.thumbnail_url,
        p.item_url,
        MAX(sh.scanned_at) AS latest_scan_at,
        json_agg(
          json_build_object(
            'id', sh.id,
            'scannedAt', sh.scanned_at,
            'location', sh.location,
            'memo', sh.memo,
            'thumbnailUrl', sh.thumbnail_url,
            'rawText', sh.raw_text
          ) ORDER BY sh.scanned_at DESC
        ) AS scans
      FROM scan_histories sh
      LEFT JOIN products p ON p.id = sh.product_id
      WHERE sh.user_id = ${userId}
      ${qFragment}
      ${storeFragment}
      GROUP BY p.id, p.product_name, p.allergens, p.thumbnail_url, p.item_url
      HAVING TRUE ${beforeHaving}
      ORDER BY latest_scan_at DESC
      LIMIT ${limit + 1}
    `);

    return rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      allergens: (row.allergens ?? {
        contains: [],
        partial: [],
        components: [],
      }) as ProductAllergens,
      thumbnailUrl: row.thumbnail_url,
      itemUrl: row.item_url,
      latestScanAt: row.latest_scan_at,
      scans: (
        Array.isArray(row.scans) ? row.scans : JSON.parse(row.scans as string)
      ) as ScanRecord[],
    }));
  }
}
