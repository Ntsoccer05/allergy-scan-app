import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { AdminRepository } from './admin.repository'
import type { SystemProductRow } from './admin.repository'
import { ADMIN_USERS_DEFAULT_LIMIT, SYSTEM_PRODUCTS_PAGE_LIMIT } from './admin.constants'

type GetUsersQuery = { limit?: number; cursor?: string }
type UpdatePlanDto = { plan_name: string }

export type SystemProductItem = Omit<SystemProductRow, 'updated_at'> & {
  updated_at: string
  judgment: 'ng' | 'partial' | 'ok'
}

export type SystemProductListResult = {
  items: SystemProductItem[]
  next_cursor: string | null
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)

  constructor(private readonly adminRepository: AdminRepository) {}

  async getUsers(query: GetUsersQuery) {
    return this.adminRepository.findUsers(query.limit ?? ADMIN_USERS_DEFAULT_LIMIT, query.cursor)
  }

  async getStats() {
    return this.adminRepository.getStats()
  }

  async updateUserPlan(userId: string, dto: UpdatePlanDto) {
    this.logger.log('プラン手動変更', { userId, plan_name: dto.plan_name })
    await this.adminRepository.updateUserPlan(userId, dto.plan_name)
  }

  async getSystemProducts(params: {
    cursor?: string
    q?: string
    judgment?: 'all' | 'ng' | 'partial' | 'ok'
  }): Promise<SystemProductListResult> {
    let cursor: Date | undefined
    if (params.cursor) {
      cursor = new Date(params.cursor)
      if (isNaN(cursor.getTime())) {
        throw new BadRequestException({ message: '不正なカーソル値です', code: 'INVALID_CURSOR' })
      }
    }

    const rows = await this.adminRepository.findAllJanProducts({
      cursor,
      q: params.q,
      judgment: params.judgment,
      limit: SYSTEM_PRODUCTS_PAGE_LIMIT,
    })

    const hasNextPage = rows.length > SYSTEM_PRODUCTS_PAGE_LIMIT
    const pageRows = hasNextPage ? rows.slice(0, SYSTEM_PRODUCTS_PAGE_LIMIT) : rows

    return {
      items: pageRows.map((row) => ({
        ...row,
        updated_at: row.updated_at.toISOString(),
      })),
      next_cursor: hasNextPage
        ? (pageRows[pageRows.length - 1]?.updated_at.toISOString() ?? null)
        : null,
    }
  }
}
