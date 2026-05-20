import {
  BadRequestException,
  Body,
  Controller,
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
import { IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
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

/** PATCH /history/:id のリクエストボディ内 location DTO */
class PatchLocationDto {
  @IsString()
  store_name!: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

/** PATCH /history/:id のリクエストボディ DTO */
class PatchHistoryDto {
  @ValidateNested()
  @Type(() => PatchLocationDto)
  location!: PatchLocationDto;
}

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

  /** PATCH /history/:id: 履歴の location を更新する。Cookie 認証必須。 */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateLocation(
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
    await this.historyService.updateLocation(id, userId, body.location);
  }
}
