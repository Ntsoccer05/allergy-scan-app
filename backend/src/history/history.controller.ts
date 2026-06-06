import {
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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { HistoryService } from './history.service';
import { GetHistoryDto } from './dto/get-history.dto';
import { CreateHistoryDto } from './dto/create-history.dto';
import { PatchHistoryDto } from './dto/patch-history.dto';
import type { HistoryListResult } from './history.service';
import type { ScanHistoryRecord } from './scan-history.repository';
import type { SupabaseJwtPayload } from '../auth/types/supabase-jwt.types';
import {
  THROTTLE_HISTORY_TTL,
  THROTTLE_HISTORY_LIMIT,
} from '../shared/throttler.constants';

type AuthRequest = Request & { user: SupabaseJwtPayload };

@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  /** GET /history: カーソルページネーションでスキャン履歴を取得する。 */
  @Get()
  @Throttle({
    default: { ttl: THROTTLE_HISTORY_TTL, limit: THROTTLE_HISTORY_LIMIT },
  })
  async getHistory(
    @Req() req: AuthRequest,
    @Query() query: GetHistoryDto,
  ): Promise<HistoryListResult> {
    return this.historyService.getHistory(req.user.sub, query);
  }

  /** POST /history: スキャン履歴を1件保存する。 */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createHistory(
    @Req() req: AuthRequest,
    @Body() body: CreateHistoryDto,
  ): Promise<ScanHistoryRecord> {
    return this.historyService.createHistory(req.user.sub, body);
  }

  /** PATCH /history/:id: 履歴の product_name・store_name・memo を更新する。 */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateHistory(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: PatchHistoryDto,
  ): Promise<void> {
    await this.historyService.updateHistory(id, req.user.sub, body);
  }

  /** DELETE /history/:id: 履歴を物理削除する。成功時 204 を返す。 */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteHistory(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.historyService.deleteHistory(id, req.user.sub);
  }
}
