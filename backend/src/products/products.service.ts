import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ProductRepository } from './product.repository';
import { UsersRepository } from '../users/users.repository';
import type { ProductAllergens, UserAllergies } from '../shared/types/db.types';
import { OTHERS_PAGE_LIMIT } from './products.constants';

/** GET /products/others の1件レコード型（Controller が返すレスポンス要素）。 */
export type OthersProductItem = {
  id: string;
  product_name: string | null;
  allergens: ProductAllergens;
  /** ユーザーの allergen 設定に基づいた総合判定（R5）。 */
  judgment: 'ng' | 'partial' | 'ok';
  /** detected: judgment が ng / partial のとき検出されたアレルギー名リスト。 */
  detected: string[];
  /** この商品の最新の公開スキャン履歴に紐づくサムネイル（なければ null）。 */
  thumbnail_url: string | null;
  /** この商品の最新の公開スキャン履歴の店舗名（なければ null）。 */
  store_name: string | null;
  /** 商品の原材料テキスト（詳細表示用・raw_text 表示は安全設計の必須要件）。 */
  raw_text: string | null;
  updated_at: string;
  /** expires_at < NOW() の場合 true（R6）。 */
  is_expired: boolean;
};

/** GET /products/others の検索・フィルタ条件。 */
export type GetOthersParams = {
  cursor?: string;
  /** ユーザー設定で導出した judgment によるフィルタ。 */
  judgment?: 'all' | 'ng' | 'partial' | 'ok';
  /** 商品名の部分一致検索キーワード。 */
  q?: string;
  /** 店舗名の部分一致フィルタ。 */
  store?: string;
};

/**
 * judgment フィルタ時に DB を追加走査する最大回数。
 * judgment はユーザー設定から動的導出されるため SQL では絞り込めず、
 * 導出後フィルタでページが埋まらない場合に次のバッチを読み足す。
 */
const MAX_FILTER_SCANS = 5;

/**
 * products.allergens と users.allergies を照合して総合判定を返す（集約点: dry_principles.md）。
 * products.allergens.contains に enabled なアレルギーが含まれる → ng
 * products.allergens.partial に enabled かつ partialAlert なアレルギーが含まれる → partial
 * それ以外 → ok
 * ⚠️ 安全設計: enabled アレルギーが設定なしの場合も ok として扱う（アレルギー設定なし状態）
 * みんなのスキャン・自分の履歴の設定追従の両方がこの関数を使う。再実装禁止。
 */
export const deriveProductJudgment = (
  allergens: ProductAllergens,
  allergies: UserAllergies,
): { judgment: 'ng' | 'partial' | 'ok'; detected: string[] } => {
  const enabledNames = Object.entries(allergies)
    .filter(([, v]) => v.enabled)
    .map(([name]) => name);

  const ngDetected = allergens.contains.filter((name) =>
    enabledNames.includes(name),
  );
  if (ngDetected.length > 0) {
    return { judgment: 'ng', detected: ngDetected };
  }

  const partialAlertNames = Object.entries(allergies)
    .filter(([, v]) => v.enabled && v.partialAlert)
    .map(([name]) => name);

  const partialDetected = allergens.partial.filter((name) =>
    partialAlertNames.includes(name),
  );
  if (partialDetected.length > 0) {
    return { judgment: 'partial', detected: partialDetected };
  }

  return { judgment: 'ok', detected: [] };
};

/** GET /products/others のレスポンス型。 */
export type OthersProductListResult = {
  items: OthersProductItem[];
  next_cursor: string | null;
};

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly productRepository: ProductRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  /**
   * 公開スキャンのある商品一覧を返す（R4・R5・R6）。
   * 自分がスキャンした商品も公開されていれば含める（公開した本人にも見える仕様）。
   * judgment フィルタはユーザー設定で導出した判定に対して適用するため、
   * ページが埋まるまで DB を追加走査する（最大 MAX_FILTER_SCANS 回）。
   * カーソルが不正な ISO 文字列の場合は BadRequestException を throw する。
   */
  async getOthersScanned(
    userId: string,
    params: GetOthersParams = {},
  ): Promise<OthersProductListResult> {
    const { cursorStr, judgment, q, store } = {
      cursorStr: params.cursor,
      judgment: params.judgment ?? 'all',
      q: params.q,
      store: params.store,
    };

    let cursor: Date | undefined;
    if (cursorStr !== undefined) {
      cursor = new Date(cursorStr);
      if (isNaN(cursor.getTime())) {
        throw new BadRequestException({
          message:
            '不正なカーソル値です。ISO8601 形式の日付文字列を指定してください',
          code: 'INVALID_CURSOR',
        });
      }
    }

    // ユーザーの allergen 設定を取得してから判定を導出する（R5）
    const user = await this.usersRepository.findById(userId);
    const allergies: UserAllergies = user?.allergies ?? {};

    this.logger.log(
      `みんなのスキャン商品取得: userId=${userId}, judgment=${judgment}`,
    );

    const now = new Date();
    // limit+1 件集まるまで走査し、超過分の有無で次ページを判定する
    const items: OthersProductItem[] = [];
    let rawCursor = cursor;
    let moreRaw = true;

    for (
      let scan = 0;
      scan < MAX_FILTER_SCANS && moreRaw && items.length <= OTHERS_PAGE_LIMIT;
      scan++
    ) {
      const rows = await this.productRepository.findOthersForUser({
        cursor: rawCursor,
        limit: OTHERS_PAGE_LIMIT,
        q,
        store,
      });
      moreRaw = rows.length > OTHERS_PAGE_LIMIT;
      const pageRows = moreRaw ? rows.slice(0, OTHERS_PAGE_LIMIT) : rows;
      if (pageRows.length > 0) {
        rawCursor = pageRows[pageRows.length - 1].updatedAt;
      }

      for (const row of pageRows) {
        const derived = deriveProductJudgment(row.allergens, allergies);
        if (judgment !== 'all' && derived.judgment !== judgment) continue;
        items.push({
          id: row.id,
          product_name: row.productName,
          allergens: row.allergens,
          judgment: derived.judgment,
          detected: derived.detected,
          thumbnail_url: row.thumbnailUrl,
          store_name: row.storeName,
          raw_text: row.rawText,
          updated_at: row.updatedAt.toISOString(),
          is_expired: row.expiresAt !== null && row.expiresAt < now,
        });
      }

      // judgment フィルタなしなら間引きが発生しないため1回の走査で確定する
      if (judgment === 'all') break;
    }

    const hasNextPage = items.length > OTHERS_PAGE_LIMIT || moreRaw;
    const pageItems =
      items.length > OTHERS_PAGE_LIMIT
        ? items.slice(0, OTHERS_PAGE_LIMIT)
        : items;
    // limit+1 件目で切った場合は最後に返した商品から、フィルタで走査し切った場合は走査済み位置から再開する
    const next_cursor = !hasNextPage
      ? null
      : items.length > OTHERS_PAGE_LIMIT
        ? pageItems[pageItems.length - 1].updated_at
        : (rawCursor?.toISOString() ?? null);

    return { items: pageItems, next_cursor };
  }
}
