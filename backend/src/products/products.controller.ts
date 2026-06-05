import {
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ProductsService } from './products.service';
import type { OthersProductListResult } from './products.service';
import { COOKIE_NAME } from '../users/users.constants';
import { Public } from '../auth/public.decorator';
import {
  THROTTLE_HISTORY_TTL,
  THROTTLE_HISTORY_LIMIT,
} from '../shared/throttler.constants';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * GET /products/others:
   * リクエストユーザーがスキャンしていない商品一覧をカーソルページネーションで返す（R2・R3・R4）。
   * Cookie なしのリクエストは 401 を返す（R: Completion criteria）。
   */
  @Public()
  @Get('others')
  @Throttle({
    default: { ttl: THROTTLE_HISTORY_TTL, limit: THROTTLE_HISTORY_LIMIT },
  })
  async getOthers(
    @Req() req: Request,
    @Query('cursor') cursor?: string,
  ): Promise<OthersProductListResult> {
    const userId = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!userId) {
      throw new UnauthorizedException({
        message: 'userId Cookie が必要です',
        code: 'MISSING_USER_ID',
      });
    }
    return this.productsService.getOthersScanned(userId, cursor);
  }
}
