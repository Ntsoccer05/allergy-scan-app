import {
  Controller,
  Get,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ProductsService } from './products.service';
import type { OthersProductListResult } from './products.service';
import type { SupabaseJwtPayload } from '../auth/types/supabase-jwt.types';
import { GetOthersDto } from './dto/get-others.dto';
import {
  THROTTLE_HISTORY_TTL,
  THROTTLE_HISTORY_LIMIT,
} from '../shared/throttler/throttler.constants';

type AuthRequest = Request & { user: SupabaseJwtPayload };

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * GET /products/others:
   * 公開スキャンのある商品一覧をカーソルページネーションで返す。
   * judgment / q / store で検索・フィルタできる。
   */
  @Get('others')
  @Throttle({
    default: { ttl: THROTTLE_HISTORY_TTL, limit: THROTTLE_HISTORY_LIMIT },
  })
  async getOthers(
    @Req() req: AuthRequest,
    @Query() query: GetOthersDto,
  ): Promise<OthersProductListResult> {
    return this.productsService.getOthersScanned(req.user.sub, {
      cursor: query.cursor,
      judgment: query.judgment,
      q: query.q,
      store: query.store,
    });
  }
}
