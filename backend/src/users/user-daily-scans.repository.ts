import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserDailyScansRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getTodayCount(userId: string, scanDate: string): Promise<number> {
    const record = await this.prisma.userDailyScan.findUnique({
      where: { userId_scanDate: { userId, scanDate: new Date(scanDate) } },
    });
    return record?.scanCount ?? 0;
  }

  async upsertIncrement(userId: string, scanDate: string): Promise<void> {
    await this.prisma.userDailyScan.upsert({
      where: { userId_scanDate: { userId, scanDate: new Date(scanDate) } },
      update: { scanCount: { increment: 1 } },
      create: { userId, scanDate: new Date(scanDate), scanCount: 1 },
    });
  }

  /**
   * ユーザーのアクティブなサブスクプランから日次上限を取得する。
   * サブスクが未設定（init 未完了）の場合は安全側に 0 を返す。
   */
  async getUserDailyScanLimit(userId: string): Promise<number> {
    const subscription = await this.prisma.userSubscription.findFirst({
      where: { userId, status: 'active' },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    return subscription?.plan.dailyScanLimit ?? 0;
  }
}
