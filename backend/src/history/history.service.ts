import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ScanHistoryRepository } from './scan-history.repository';
import type { ScanHistoryRecord } from './scan-history.repository';
import type { ScanHistoryLocation } from '../shared/types/db.types';
import { GetHistoryDto } from './dto/get-history.dto';
import { CreateHistoryDto } from './dto/create-history.dto';

/** GET /history のレスポンス型。 */
export type HistoryListResult = {
  items: ScanHistoryRecord[];
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
