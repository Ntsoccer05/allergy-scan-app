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
  /** detected: judgment が ng / partial のとき検出されたアレルゲン名リスト。 */
  detected: string[];
  updated_at: string;
  /** expires_at < NOW() の場合 true（R6）。 */
  is_expired: boolean;
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
   * リクエストユーザーがスキャンしていない商品一覧を返す（R3・R4・R5・R6）。
   * カーソルが不正な ISO 文字列の場合は BadRequestException を throw する。
   */
  async getOthersScanned(
    userId: string,
    cursorStr?: string,
  ): Promise<OthersProductListResult> {
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

    // ユーザーの allergen 設定を取得してから products を絞り込む（R5）
    const user = await this.usersRepository.findById(userId);
    const allergies: UserAllergies = user?.allergies ?? {};

    this.logger.log(`他ユーザースキャン済み商品取得: userId=${userId}`);

    const rows = await this.productRepository.findOthersForUser(userId, {
      cursor,
      limit: OTHERS_PAGE_LIMIT,
    });

    const hasNextPage = rows.length > OTHERS_PAGE_LIMIT;
    const pageRows = hasNextPage ? rows.slice(0, OTHERS_PAGE_LIMIT) : rows;
    const next_cursor =
      hasNextPage && pageRows.length > 0
        ? pageRows[pageRows.length - 1].updatedAt.toISOString()
        : null;

    const now = new Date();
    const items: OthersProductItem[] = pageRows.map((row) => {
      const { judgment, detected } = this.deriveJudgment(
        row.allergens,
        allergies,
      );
      return {
        id: row.id,
        product_name: row.productName,
        allergens: row.allergens,
        judgment,
        detected,
        updated_at: row.updatedAt.toISOString(),
        is_expired: row.expiresAt !== null && row.expiresAt < now,
      };
    });

    return { items, next_cursor };
  }

  /**
   * products.allergens と users.allergies を照合して総合判定を返す（R5）。
   * products.allergens.contains に enabled なアレルゲンが含まれる → ng
   * products.allergens.partial に enabled かつ partialAlert なアレルゲンが含まれる → partial
   * それ以外 → ok
   * ⚠️ 安全設計: enabled アレルゲンが設定なしの場合も ok として扱う（アレルゲン設定なし状態）
   */
  private deriveJudgment(
    allergens: ProductAllergens,
    allergies: UserAllergies,
  ): { judgment: 'ng' | 'partial' | 'ok'; detected: string[] } {
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
  }
}
