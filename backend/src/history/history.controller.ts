import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { HistoryService } from './history.service';
import { GetHistoryDto } from './dto/get-history.dto';
import { CreateHistoryDto } from './dto/create-history.dto';
import { PatchHistoryDto } from './dto/patch-history.dto';
import type { HistoryListResult } from './history.service';
import type { ScanHistoryRecord } from './scan-history.repository';
import { COOKIE_NAME } from '../users/users.constants';
import { Public } from '../auth/public.decorator';
import {
  THROTTLE_HISTORY_TTL,
  THROTTLE_HISTORY_LIMIT,
} from '../shared/throttler.constants';

@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  /** GET /history: カーソルページネーションでスキャン履歴を取得する。 */
  @Public()
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
  @Public()
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

  /** PATCH /history/:id: 履歴の product_name・store_name・memo・location を更新する。Cookie 認証必須。 */
  @Public()
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateHistory(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: PatchHistoryDto,
  ): Promise<void> {
    const userId = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!userId) {
      throw new UnauthorizedException({
        message: '認証が必要です',
        code: 'UNAUTHORIZED',
      });
    }
    await this.historyService.updateHistory(id, userId, body);
  }

  /** DELETE /history/:id: 履歴を物理削除する。Cookie 認証必須。成功時 204 を返す。 */
  @Public()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteHistory(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<void> {
    const userId = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!userId) {
      throw new UnauthorizedException({
        message: '認証が必要です',
        code: 'UNAUTHORIZED',
      });
    }
    await this.historyService.deleteHistory(id, userId);
  }
}
