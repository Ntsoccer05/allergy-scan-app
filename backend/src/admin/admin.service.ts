import { Injectable } from '@nestjs/common'
import { AdminRepository } from './admin.repository'

type GetUsersQuery = { limit?: number; cursor?: string }
type UpdatePlanDto = { plan_name: string }

@Injectable()
export class AdminService {
  constructor(private readonly adminRepository: AdminRepository) {}

  async getUsers(query: GetUsersQuery) {
    return this.adminRepository.findUsers(query.limit ?? 20, query.cursor)
  }

  async getStats() {
    return this.adminRepository.getStats()
  }

  async updateUserPlan(userId: string, dto: UpdatePlanDto) {
    await this.adminRepository.updateUserPlan(userId, dto.plan_name)
  }
}
