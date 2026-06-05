import { Controller, Get, Query } from '@nestjs/common';
import { IsISO8601, IsOptional } from 'class-validator';
import { Public } from '../auth/public.decorator';
import { HistoryService } from './history.service';

class PublicHistoryQueryDto {
  @IsOptional()
  @IsISO8601()
  before?: string;
}

@Controller('public/history')
export class PublicHistoryController {
  constructor(private readonly historyService: HistoryService) {}

  // digest は静的ルートのため動的ルートより先に定義すること
  @Public()
  @Get('digest')
  async getPublicHistoryDigest() {
    return this.historyService.getPublicHistoryDigest();
  }

  @Public()
  @Get()
  async getPublicHistory(@Query() query: PublicHistoryQueryDto) {
    const before = query.before ? new Date(query.before) : undefined;
    return this.historyService.getPublicHistory(20, before);
  }
}
