import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

type AdminUserRow = {
  id: string
  locale: string
  created_at: Date
  plan_name: string
  daily_scan_limit: number
}

type StatsResult = {
  total_users: number
  total_scans: number
  scans_today: number
  active_premium: number
}

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUsers(limit: number, cursor?: string): Promise<{ items: AdminUserRow[]; next_cursor: string | null }> {
    const users = await this.prisma.user.findMany({
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        subscriptions: {
          where: { status: 'active' },
          include: { plan: true },
          take: 1,
        },
      },
    })

    const hasMore = users.length > limit
    const pageUsers = hasMore ? users.slice(0, limit) : users
    const items: AdminUserRow[] = pageUsers.map(u => ({
      id: u.id,
      locale: u.locale,
      created_at: u.createdAt,
      plan_name: u.subscriptions[0]?.plan.name ?? 'free',
      daily_scan_limit: u.subscriptions[0]?.plan.dailyScanLimit ?? 20,
    }))

    return {
      items,
      next_cursor: hasMore ? (pageUsers[pageUsers.length - 1]?.id ?? null) : null,
    }
  }

  async getStats(): Promise<StatsResult> {
    const today = new Date().toISOString().slice(0, 10)
    const [totalUsers, totalScans, scansToday, activePremium] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.scanHistory.count(),
      this.prisma.userDailyScan.aggregate({
        where: { scanDate: new Date(today) },
        _sum: { scanCount: true },
      }),
      this.prisma.userSubscription.count({
        where: { status: 'active', plan: { name: 'premium' } },
      }),
    ])
    return {
      total_users: totalUsers,
      total_scans: totalScans,
      scans_today: scansToday._sum.scanCount ?? 0,
      active_premium: activePremium,
    }
  }

  async updateUserPlan(userId: string, planName: string): Promise<void> {
    const plan = await this.prisma.plan.findUniqueOrThrow({ where: { name: planName } })
    await this.prisma.userSubscription.updateMany({
      where: { userId, status: 'active' },
      data: { planId: plan.id },
    })
  }
}
