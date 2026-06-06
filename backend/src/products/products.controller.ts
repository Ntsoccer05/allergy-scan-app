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
import {
  THROTTLE_HISTORY_TTL,
  THROTTLE_HISTORY_LIMIT,
} from '../shared/throttler.constants';

type AuthRequest = Request & { user: SupabaseJwtPayload };

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * GET /products/others:
   * リクエストユーザーがスキャンしていない商品一覧をカーソルページネーションで返す。
   */
  @Get('others')
  @Throttle({
    default: { ttl: THROTTLE_HISTORY_TTL, limit: THROTTLE_HISTORY_LIMIT },
  })
  async getOthers(
    @Req() req: AuthRequest,
    @Query('cursor') cursor?: string,
  ): Promise<OthersProductListResult> {
    return this.productsService.getOthersScanned(req.user.sub, cursor);
  }
}
