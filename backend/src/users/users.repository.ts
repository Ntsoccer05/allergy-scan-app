import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UserAllergies } from '../shared/types/db.types';

export type UserRecord = {
  id: string;
  allergies: UserAllergies;
  locale: string;
};

export type UpdateUserInput = {
  allergies?: UserAllergies;
  locale?: string;
  onboardingDone?: boolean;
};

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, allergies: true, locale: true },
    });
    if (!user) return null;
    return {
      id: user.id,
      allergies: user.allergies as unknown as UserAllergies,
      // DEFAULT 'ja' だが null 混入防止のためフォールバックを持たせる
      locale: user.locale ?? 'ja',
    };
  }

  // 重複 INSERT を防ぐため ON CONFLICT DO NOTHING 相当の skipDuplicates を使用する
  async create(userId: string): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, allergies: {} },
      update: {},
    });
  }

  async deleteById(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }

  /**
   * アレルギー設定をリセットし、履歴を削除する。
   * users レコードと user_daily_scans は保持してスキャン上限バイパスを防ぐ。
   */
  async resetData(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { allergies: {} },
      }),
      this.prisma.scanHistory.deleteMany({ where: { userId } }),
    ]);
  }

  async createWithFreePlan(userId: string): Promise<void> {
    const freePlan = await this.prisma.plan.findUniqueOrThrow({ where: { name: 'free' } })
    await this.prisma.$transaction([
      this.prisma.user.create({ data: { id: userId } }),
      this.prisma.userSubscription.create({
        data: { userId, planId: freePlan.id, status: 'active' },
      }),
    ])
  }

  async findByIdWithSubscription(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscriptions: {
          where: { status: 'active' },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })
  }

  async update(userId: string, input: UpdateUserInput): Promise<UserRecord> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.allergies !== undefined && { allergies: input.allergies as object }),
        ...(input.locale !== undefined && { locale: input.locale }),
        // ⚠️ 安全設計: onboarding_done は true への上書きのみ許可する。
        // false への書き戻しはオンボーディング同意の取り消しになるため API 経由では禁止。
        ...(input.onboardingDone === true && { onboardingDone: true }),
      },
    });
    return {
      id: user.id,
      allergies: user.allergies as unknown as UserAllergies,
      locale: user.locale ?? 'ja',
    };
  }
}
