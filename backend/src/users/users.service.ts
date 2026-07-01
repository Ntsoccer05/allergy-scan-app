import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { UsersRepository } from './users.repository'
import { BackupCodesRepository } from './backup-codes.repository'
import { PrismaService } from '../prisma/prisma.service'
import type { UserAllergies } from '../shared/types/db.types'
import { BACKUP_CODE_DAILY_LIMIT } from './users.constants'

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

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly backupCodesRepository: BackupCodesRepository,
    private readonly prisma: PrismaService,
  ) {}

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

  async issueBackupCode(userId: string): Promise<{ code: string; expires_at: string }> {
    const user = await this.usersRepository.findById(userId)
    if (!user) throw new NotFoundException('ユーザーが見つかりません')

    const todayCount = await this.backupCodesRepository.countIssuedToday(userId)
    if (todayCount >= BACKUP_CODE_DAILY_LIMIT) {
      throw new HttpException(`引き継ぎコードは1日${BACKUP_CODE_DAILY_LIMIT}回までしか発行できません`, HttpStatus.TOO_MANY_REQUESTS)
    }

    const result = await this.backupCodesRepository.issue(userId)
    return { code: result.code, expires_at: result.expires_at.toISOString() }
  }

  async restoreFromCode(requestingUserId: string, code: string): Promise<void> {
    const record = await this.backupCodesRepository.findValidByCode(code)
    if (!record) throw new BadRequestException('code_invalid')

    const sourceUser = await this.usersRepository.findById(record.userId)
    if (!sourceUser) throw new BadRequestException('code_invalid')

    // アレルギー設定の移行とコードの消費をアトミックに実行する
    // （update 成功後に markUsed が失敗するとコードが再利用可能になるためトランザクションが必須）
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: requestingUserId },
        data: { allergies: sourceUser.allergies as object },
      })
      await tx.backupCode.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      })
    })

    this.logger.log('バックアップコードで引継ぎ完了', {
      requestingUserId,
      sourceUserId: record.userId,
    })
  }
}
