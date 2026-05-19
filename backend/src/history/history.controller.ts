import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { HistoryService } from './history.service';
import { GetHistoryDto } from './dto/get-history.dto';
import { CreateHistoryDto } from './dto/create-history.dto';
import type { HistoryListResult } from './history.service';
import type { ScanHistoryRecord } from './scan-history.repository';
import { COOKIE_NAME } from '../users/users.constants';
import {
  THROTTLE_HISTORY_TTL,
  THROTTLE_HISTORY_LIMIT,
} from '../shared/throttler.constants';

@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  /** GET /history: カーソルページネーションでスキャン履歴を取得する。 */
  @Get()
  @Throttle({
    default: { ttl: THROTTLE_HISTORY_TTL, limit: THROTTLE_HISTORY_LIMIT },
  })
  async getHistory(
    @Req() req: Request,
    @Query() query: GetHistoryDto,
  ): Promise<HistoryListResult> {
    const userId = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!userId) {
      throw new BadRequestException({
        message: 'userId Cookie が必要です',
        code: 'MISSING_USER_ID',
      });
    }
    return this.historyService.getHistory(userId, query);
  }

  /** POST /history: スキャン履歴を1件保存する。 */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createHistory(
    @Req() req: Request,
    @Body() body: CreateHistoryDto,
  ): Promise<ScanHistoryRecord> {
    const userId = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!userId) {
      throw new BadRequestException({
        message: 'userId Cookie が必要です',
        code: 'MISSING_USER_ID',
      });
    }
    return this.historyService.createHistory(userId, body);
  }
}
