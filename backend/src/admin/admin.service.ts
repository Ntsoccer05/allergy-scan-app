import { Injectable, Logger } from '@nestjs/common'
import { AdminRepository } from './admin.repository'
import { ADMIN_USERS_DEFAULT_LIMIT } from './admin.constants'

type GetUsersQuery = { limit?: number; cursor?: string }
type UpdatePlanDto = { plan_name: string }

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
}
