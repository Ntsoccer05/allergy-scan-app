import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ScanHistoryRepository } from './scan-history.repository';
import type { ScanHistoryRecord, PublicHistoryRecord } from './scan-history.repository';
import type { ScanHistoryLocation } from '../shared/types/db.types';
import { GetHistoryDto } from './dto/get-history.dto';
import { CreateHistoryDto } from './dto/create-history.dto';
import { PatchHistoryDto } from './dto/patch-history.dto';

/** GET /history のレスポンス型。 */
export type HistoryListResult = {
  items: ScanHistoryRecord[];
  next_before: string | null;
};

/** GET /public/history のレスポンス型（個人情報を除外）。 */
export type PublicHistoryListResult = {
  items: PublicHistoryRecord[];
  next_before: string | null;
};

/** GET /history の1ページあたりの最大件数。 */
const HISTORY_PAGE_LIMIT = 20;

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(private readonly scanHistoryRepository: ScanHistoryRepository) {}

  /**
   * ユーザーのスキャン履歴をカーソルページネーションで取得する（patterns.md パターン4）。
   * before が不正な日付文字列の場合は BadRequestException を throw する。
   */
  async getHistory(
    userId: string,
    query: GetHistoryDto,
  ): Promise<HistoryListResult> {
    let before: Date | undefined;
    if (query.before !== undefined) {
      before = new Date(query.before);
      // 不正な日付文字列の場合は NaN になる
      if (isNaN(before.getTime())) {
        throw new BadRequestException({
          message:
            '不正なカーソル値です。ISO8601 形式の日付文字列を指定してください',
          code: 'INVALID_CURSOR',
        });
      }
    }

    const judgment = query.judgment ?? 'all';

    this.logger.log(`履歴取得: userId=${userId}, judgment=${judgment}`);

    const records = await this.scanHistoryRepository.findByUser(userId, {
      before,
      judgment,
      limit: HISTORY_PAGE_LIMIT,
    });

    // limit+1 件取得しているため、超過分があれば次ページが存在する
    const hasNextPage = records.length > HISTORY_PAGE_LIMIT;
    const items = hasNextPage ? records.slice(0, HISTORY_PAGE_LIMIT) : records;
    const next_before =
      hasNextPage && items.length > 0
        ? items[items.length - 1].scannedAt.toISOString()
        : null;

    return { items, next_before };
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
    });

    // location フィールドが指定された場合は location も更新する（後方互換）
    if (data.location !== undefined) {
      await this.scanHistoryRepository.updateLocation(id, data.location);
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
    });
  }
}
