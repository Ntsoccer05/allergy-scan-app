import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { UsersRepository } from './users.repository'
import type { UserAllergies } from '../shared/types/db.types'

type InitResult = { created: boolean }
type UserMeResult = {
  id: string
  allergies: UserAllergies
  locale: string
  subscription: {
    plan_name: string
    daily_scan_limit: number
    status: string
  } | null
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)

  constructor(private readonly usersRepository: UsersRepository) {}

  async initUser(userId: string, _email?: string): Promise<InitResult> {
    const existing = await this.usersRepository.findById(userId)
    if (existing) return { created: false }
    await this.usersRepository.createWithFreePlan(userId)
    this.logger.log('新規ユーザー作成', { userId })
    return { created: true }
  }

  async getUser(userId: string): Promise<UserMeResult> {
    const user = await this.usersRepository.findByIdWithSubscription(userId)
    if (!user) throw new NotFoundException('ユーザーが見つかりません')
    const activeSub = user.subscriptions?.[0]
    return {
      id: user.id,
      allergies: user.allergies as UserAllergies,
      locale: user.locale,
      subscription: activeSub
        ? {
            plan_name: activeSub.plan.name,
            daily_scan_limit: activeSub.plan.dailyScanLimit,
            status: activeSub.status,
          }
        : null,
    }
  }

  async updateUser(userId: string, allergies?: UserAllergies, locale?: string, onboardingDone?: boolean): Promise<void> {
    const user = await this.usersRepository.findById(userId)
    if (!user) throw new NotFoundException('ユーザーが見つかりません')
    await this.usersRepository.update(userId, { allergies, locale, onboardingDone })
  }

  async deleteUser(userId: string): Promise<void> {
    await this.usersRepository.deleteById(userId)
    this.logger.log('ユーザー削除', { userId })
  }

  async resetUserData(userId: string): Promise<void> {
    const user = await this.usersRepository.findById(userId)
    if (!user) throw new NotFoundException('ユーザーが見つかりません')
    await this.usersRepository.resetData(userId)
    this.logger.log('ユーザーデータリセット', { userId })
  }
}
