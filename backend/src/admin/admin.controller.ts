import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AdminGuard } from '../auth/admin.guard'
import { AdminService } from './admin.service'
import type { SystemProductListResult } from './admin.service'
import { ADMIN_USERS_DEFAULT_LIMIT } from './admin.constants'
import type { Request } from 'express'
import { IsString } from 'class-validator'

class UpdatePlanDto {
  @IsString()
  plan_name!: string
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** GET /admin/users: ユーザー一覧（カーソルページネーション）。 */
  @Get('users')
  async getUsers(@Req() _req: Request, @Query() query: { limit?: string; cursor?: string }) {
    return this.adminService.getUsers({
      limit: query.limit ? parseInt(query.limit, 10) : ADMIN_USERS_DEFAULT_LIMIT,
      cursor: query.cursor,
    })
  }

  /** GET /admin/stats: 統計情報。 */
  @Get('stats')
  async getStats() {
    return this.adminService.getStats()
  }

  /** PATCH /admin/users/:id/plan: プラン手動変更（admin 専用）。 */
  @Patch('users/:id/plan')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateUserPlan(@Param('id') userId: string, @Body() dto: UpdatePlanDto) {
    await this.adminService.updateUserPlan(userId, dto)
  }

  /** GET /admin/products: シードデータ（JAN商品）一覧（カーソルページネーション・商品名検索・判定フィルタ）。 */
  @Get('products')
  async getSystemProducts(
    @Query() query: { cursor?: string; q?: string; judgment?: 'all' | 'ng' | 'partial' | 'ok' },
  ): Promise<SystemProductListResult> {
    return this.adminService.getSystemProducts({
      cursor: query.cursor,
      q: query.q,
      judgment: query.judgment,
    })
  }
}
