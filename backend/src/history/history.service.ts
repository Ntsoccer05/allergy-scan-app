import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ScanHistoryRepository } from './scan-history.repository';
import type {
  ScanHistoryRecord,
  PublicHistoryRecord,
  LocationPinRecord,
  PublicLocationPinRecord,
  HistoryGroupRecord,
  ScanRecord,
} from './scan-history.repository';
import type { ScanHistoryLocation, ProductAllergens } from '../shared/types/db.types';
import { GetHistoryDto } from './dto/get-history.dto';
import { CreateHistoryDto } from './dto/create-history.dto';
import { PatchHistoryDto } from './dto/patch-history.dto';
import { BulkDeleteHistoryDto } from './dto/bulk-delete-history.dto';
import { ProductRepository } from '../products/product.repository';
import { UsersRepository } from '../users/users.repository';
import { AllergenComponentRepository } from '../allergens/allergen-component.repository';
import { deriveProductJudgment } from '../products/products.service';
import type { UserAllergies } from '../shared/types/db.types';

/** GET /history のレスポンス型。 */
export type HistoryListResult = {
  items: ScanHistoryRecord[];
  next_before: string | null;
};

/** GET /history の新レスポンス型（商品単位グループ）。 */
export type HistoryGroupItem = {
  product: {
    id: string | null;
    name: string | null;
    allergens: ProductAllergens;
    thumbnailUrl: string | null;
    itemUrl: string | null;
  };
  judgment: 'ng' | 'partial' | 'ok';
  detected: string[];
  scans: ScanRecord[];
  latestScanAt: string; // ISO8601
};

export type HistoryGroupListResult = {
  items: HistoryGroupItem[];
  next_before: string | null;
};

/** GET /public/history のレスポンス型（個人情報を除外）。 */
export type PublicHistoryListResult = {
  items: PublicHistoryRecord[];
  next_before: string | null;
};

/** マップ用ピン1件のレスポンス型（自分の履歴。raw_text・detected を含む）。 */
export type MapPin = {
  id: string;
  product_name: string | null;
  judgment: 'ng' | 'partial' | 'ok';
  detected: string[];
  thumbnail_url: string | null;
  store_name: string | null;
  lat: number;
  lng: number;
  scanned_at: string;
  raw_text: string | null;
};

/**
 * マップ用ピン1件のレスポンス型（公開履歴）。
 * ⚠️ プライバシー: raw_text・detected・user_id・memo を含めない。
 */
export type PublicMapPin = Omit<MapPin, 'detected' | 'raw_text'>;

/** GET /history/locations のレスポンス型。 */
export type MapLocationsResult = {
  mine: MapPin[];
  public: PublicMapPin[];
};

/** GET /history の1ページあたりの最大件数。 */
const HISTORY_PAGE_LIMIT = 20;

/** GET /history/locations で返すピンの最大件数（mine / public それぞれ）。 */
const MAP_LOCATION_PINS_LIMIT = 500;

const toMapPin = (record: LocationPinRecord): MapPin => ({
  id: record.id,
  product_name: record.productName,
  judgment: record.judgment as MapPin['judgment'],
  detected: record.detected,
  thumbnail_url: record.thumbnailUrl,
  store_name: record.storeName,
  lat: record.lat,
  lng: record.lng,
  scanned_at: record.scannedAt.toISOString(),
  raw_text: record.rawText,
});

const toPublicMapPin = (record: PublicLocationPinRecord): PublicMapPin => ({
  id: record.id,
  product_name: record.productName,
  judgment: record.judgment as MapPin['judgment'],
  thumbnail_url: record.thumbnailUrl,
  store_name: record.storeName,
  lat: record.lat,
  lng: record.lng,
  scanned_at: record.scannedAt.toISOString(),
});

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(
    private readonly scanHistoryRepository: ScanHistoryRepository,
    private readonly productRepository: ProductRepository,
    private readonly usersRepository: UsersRepository,
    private readonly allergenComponentRepository: AllergenComponentRepository,
  ) {}

  /**
   * ユーザーのスキャン履歴を商品単位グループでカーソルページネーション取得する（patterns.md パターン4）。
   * before が不正な日付文字列の場合は BadRequestException を throw する。
   */
  async getHistory(
    userId: string,
    query: GetHistoryDto,
  ): Promise<HistoryGroupListResult> {
    let before: Date | undefined;
    if (query.before !== undefined) {
      before = new Date(query.before);
      if (isNaN(before.getTime())) {
        throw new BadRequestException({
          message: '不正なカーソル値です。ISO8601 形式の日付文字列を指定してください',
          code: 'INVALID_CURSOR',
        });
      }
    }

    const judgment = query.judgment ?? 'all';
    this.logger.log(`グループ履歴取得: userId=${userId}, judgment=${judgment}`);

    // limit*3 件フェッチして in-memory フィルタ後に limit 件返す
    const FETCH_LIMIT = HISTORY_PAGE_LIMIT * 3;
    const rawGroups = await this.scanHistoryRepository.findGroupsByUser(userId, {
      before,
      limit: FETCH_LIMIT,
      q: query.q,
      store: query.store,
    });

    const user = await this.usersRepository.findById(userId);
    const allergies: UserAllergies = user?.allergies ?? {};

    // 各グループの allergens から judgment を re-derive する
    const derivedGroups: HistoryGroupItem[] = rawGroups.map((group: HistoryGroupRecord) => {
      const { judgment: derivedJudgment, detected } = deriveProductJudgment(
        group.allergens,
        allergies,
      );
      return {
        product: {
          id: group.productId,
          name: group.productName,
          allergens: group.allergens,
          thumbnailUrl: group.thumbnailUrl,
          itemUrl: group.itemUrl,
        },
        judgment: derivedJudgment,
        detected,
        scans: group.scans,
        latestScanAt: group.latestScanAt.toISOString(),
      };
    });

    // in-memory で judgment フィルタ
    const filtered =
      judgment === 'all'
        ? derivedGroups
        : derivedGroups.filter((g) => g.judgment === judgment);

    const hasNextPage = filtered.length > HISTORY_PAGE_LIMIT;
    const items = hasNextPage ? filtered.slice(0, HISTORY_PAGE_LIMIT) : filtered;
    const next_before =
      hasNextPage && items.length > 0 ? items[items.length - 1].latestScanAt : null;

    return { items, next_before };
  }

  /**
   * マップ表示用に自分のピンと公開ピンを取得する。
   * mine: location に lat/lng がある自分の履歴（raw_text・detected を含む）。
   * public: is_public=true かつ店舗名が確定している全ユーザーの履歴
   * （⚠️ プライバシー: user_id・memo・raw_text・detected は含めない）。
   */
  async getMapLocations(userId: string): Promise<MapLocationsResult> {
    const [mine, publicPins] = await Promise.all([
      this.scanHistoryRepository.findLocationPinsByUser(
        userId,
        MAP_LOCATION_PINS_LIMIT,
      ),
      this.scanHistoryRepository.findPublicLocationPins(
        MAP_LOCATION_PINS_LIMIT,
      ),
    ]);
    this.logger.log(
      `マップピン取得: userId=${userId}, mine=${mine.length}, public=${publicPins.length}`,
    );
    return {
      mine: mine.map(toMapPin),
      public: publicPins.map(toPublicMapPin),
    };
  }

  /**
   * 履歴の location を更新する。
   * 所有権確認: 該当履歴が userId に属さない場合は ForbiddenException を throw する。
   */
  async updateLocation(
    id: string,
    userId: string,
    location: ScanHistoryLocation,
  ): Promise<void> {
    const record = await this.scanHistoryRepository.findById(id);
    if (!record) {
      throw new NotFoundException({
        message: '履歴が見つかりません',
        code: 'HISTORY_NOT_FOUND',
      });
    }
    if (record.userId !== userId) {
      throw new ForbiddenException({
        message: 'この履歴を更新する権限がありません',
        code: 'FORBIDDEN',
      });
    }
    await this.scanHistoryRepository.updateLocation(id, location);
    this.logger.log(`location 更新: historyId=${id}, userId=${userId}`);
  }

  /**
   * 履歴の product_name・store_name・memo を更新する。
   * 所有権確認: 該当履歴が userId に属さない場合は ForbiddenException を throw する。
   */
  async updateHistory(
    id: string,
    userId: string,
    data: PatchHistoryDto,
  ): Promise<void> {
    const record = await this.scanHistoryRepository.findById(id);
    if (!record) {
      throw new NotFoundException({
        message: '履歴が見つかりません',
        code: 'HISTORY_NOT_FOUND',
      });
    }
    if (record.userId !== userId) {
      throw new ForbiddenException({
        message: 'この履歴を更新する権限がありません',
        code: 'FORBIDDEN',
      });
    }
    await this.scanHistoryRepository.update(id, {
      productName: data.product_name,
      storeName: data.store_name,
      memo: data.memo,
      isPublic: data.is_public,
      thumbnailUrl: data.thumbnail_url,
    });

    // location フィールドが指定された場合は location も更新する（後方互換）
    if (data.location !== undefined) {
      await this.scanHistoryRepository.updateLocation(id, data.location);
    }

    // 商品名が手動入力された場合、products テーブルにも伝播させて「みんなのスキャン」に反映する
    if (data.product_name && record.productId) {
      await this.productRepository.updateProductName(record.productId, data.product_name);
    }

    this.logger.log(`履歴更新: historyId=${id}, userId=${userId}`);
  }

  /**
   * 履歴を物理削除する。
   * 所有権確認: 該当履歴が userId に属さない場合は ForbiddenException を throw する。
   */
  async deleteHistory(id: string, userId: string): Promise<void> {
    const record = await this.scanHistoryRepository.findById(id);
    if (!record) {
      throw new NotFoundException({
        message: '履歴が見つかりません',
        code: 'HISTORY_NOT_FOUND',
      });
    }
    if (record.userId !== userId) {
      throw new ForbiddenException({
        message: 'この履歴を削除する権限がありません',
        code: 'FORBIDDEN',
      });
    }
    await this.scanHistoryRepository.deleteById(id);
    this.logger.log(`履歴削除: historyId=${id}, userId=${userId}`);
  }

  /**
   * 公開スキャン履歴をカーソルページネーションで取得する。
   * isPublic: true かつ judgment = 'ok' のレコードのみ返す。認証不要。
   * ⚠️ 安全設計: 個人情報（userId・detected・lat/lng・memo）を含まない PublicHistoryRecord を返す。
   */
  async getPublicHistory(limit: number, before?: Date): Promise<PublicHistoryListResult> {
    const items = await this.scanHistoryRepository.findPublicHistory(limit + 1, before);
    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    return {
      items: pageItems,
      next_before:
        hasMore && pageItems.length > 0
          ? pageItems[pageItems.length - 1].scannedAt.toISOString()
          : null,
    };
  }

  /** 公開履歴の件数と最終更新日時を返す（ダイジェスト）。認証不要。 */
  async getPublicHistoryDigest(): Promise<{ count: number; last_updated_at: Date | null }> {
    return this.scanHistoryRepository.getPublicHistoryDigest();
  }

  /** 指定された ID リストに対応する履歴を一括削除する。他ユーザーの ID は無視される。 */
  async bulkDeleteHistory(userId: string, dto: BulkDeleteHistoryDto): Promise<void> {
    if (dto.ids.length === 0) return;
    this.logger.log(`一括削除: userId=${userId}, count=${dto.ids.length}`);
    await this.scanHistoryRepository.deleteManyByIds(userId, dto.ids);
  }

  /**
   * products.allergens と現在のアレルギー設定から judgment / detected を再導出する。
   * detected はスキャン時点の snapshot だが、表示はみんなのスキャンと同様に
   * 現在の設定へ追従させる（OFF → 非表示、ON → 表示）。DB は更新しない。
   * 商品が見つからない履歴（product 削除・productId なし）は snapshot のまま返す。
   */
  private async deriveFromProducts(
    records: ScanHistoryRecord[],
    allergies: UserAllergies,
  ): Promise<ScanHistoryRecord[]> {
    const productIds = [
      ...new Set(
        records.map((r) => r.productId).filter((id): id is string => !!id),
      ),
    ];
    if (productIds.length === 0) return records;

    const productAllergens =
      await this.productRepository.findAllergensByIds(productIds);

    return records.map((record) => {
      const allergens = record.productId
        ? productAllergens.get(record.productId)
        : undefined;
      // 旧形式の不完全な JSONB（contains/partial が配列でない）は snapshot のまま返す
      if (
        !allergens ||
        !Array.isArray(allergens.contains) ||
        !Array.isArray(allergens.partial)
      ) {
        return record;
      }
      const { judgment, detected } = deriveProductJudgment(
        allergens,
        allergies,
      );
      return { ...record, judgment, detected };
    });
  }

  /**
   * ⚠️ 安全設計: 現在のアレルギー設定で履歴レコードを再評価する。
   * スキャン時に未設定だったアレルギーが後から追加された場合、
   * raw_text に成分が含まれていれば judgment を 'ng' に上書きして detected に追加する。
   * DB は更新しない（レスポンス時のみ適用）。
   */
  private async reevaluateWithCurrentAllergens(
    allergies: UserAllergies,
    records: ScanHistoryRecord[],
  ): Promise<ScanHistoryRecord[]> {
    const enabledAllergens = Object.entries(allergies)
      .filter(([, v]) => v.enabled)
      .map(([name]) => name);

    if (enabledAllergens.length === 0) return records;

    const allComponents =
      await this.allergenComponentRepository.findByAllergens(enabledAllergens);
    // exclude 型は誤検出防止リストのため再評価の検出対象に含めない（anti_patterns.md #3）
    const detectionComponents = allComponents.filter(
      (c) => c.componentType !== 'exclude',
    );

    if (detectionComponents.length === 0) return records;

    // rawText がない履歴（バーコードスキャン）のために products.raw_text を取得する
    const productIdsWithoutRawText = [
      ...new Set(
        records
          .filter((r) => !r.rawText && r.productId)
          .map((r) => r.productId!),
      ),
    ];
    const productRawTexts =
      await this.productRepository.findRawTextsByIds(productIdsWithoutRawText);

    return records.map((record) => {
      const textToCheck =
        record.rawText ??
        (record.productId
          ? (productRawTexts.get(record.productId) ?? null)
          : null);

      if (!textToCheck) return record;

      const textLower = textToCheck.toLowerCase();
      const detectedLower = record.detected.map((d) => d.toLowerCase());

      // raw_text にアレルゲンが見つかったかどうか（judgment 升格の判断に使う）
      let shouldUpgradeToNg = false;
      // detected に未追加のアレルゲン（重複防止）
      const newlyMatchedAllergens: string[] = [];

      for (const allergen of enabledAllergens) {
        const components = detectionComponents.filter(
          (c) => c.allergenName === allergen,
        );

        // raw_text にこのアレルギーの成分が含まれているかチェック
        const foundInText = components.some((c) => {
          if (textLower.includes(c.canonicalName.toLowerCase())) return true;
          return c.aliases.some(
            (alias) => alias && textLower.includes(alias.toLowerCase()),
          );
        });

        if (!foundInText) continue;

        // raw_text に見つかった → judgment は必ず 'ng' にする
        // （スキャン時の partial/ok 誤判定を含む安全側への上書き）
        shouldUpgradeToNg = true;

        // すでに detected に含まれていれば追加しない（重複防止のみ）
        const alreadyInDetected = components.some((c) => {
          if (detectedLower.some((d) => d.includes(c.canonicalName.toLowerCase()))) return true;
          return c.aliases.some(
            (alias) => alias && detectedLower.some((d) => d.includes(alias.toLowerCase())),
          );
        });

        if (!alreadyInDetected) {
          newlyMatchedAllergens.push(allergen);
        }
      }

      if (!shouldUpgradeToNg) return record;

      return {
        ...record,
        judgment: 'ng',
        detected: [...record.detected, ...newlyMatchedAllergens],
      };
    });
  }

  /** スキャン履歴を1件 INSERT する。 */
  async createHistory(
    userId: string,
    body: CreateHistoryDto,
  ): Promise<ScanHistoryRecord> {
    this.logger.log(`履歴作成: userId=${userId}, judgment=${body.judgment}`);

    return this.scanHistoryRepository.create({
      userId,
      productId: body.product_id ?? null,
      productName: body.product_name ?? null,
      judgment: body.judgment,
      detected: body.detected,
      location: body.location ?? null,
      thumbnailUrl: body.thumbnail_url ?? null,
      rawText: body.raw_text ?? null,
    });
  }
}
