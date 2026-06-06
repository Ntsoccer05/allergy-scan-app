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
      limit: query.limit ? parseInt(query.limit, 10) : 20,
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
}
