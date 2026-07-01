import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
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

export type SystemProductRow = {
  id: string
  jan_code: string
  product_name: string | null
  allergens_contains: string[]
  allergens_partial: string[]
  scan_count: number
  updated_at: Date
  judgment: 'ng' | 'partial' | 'ok'
  thumbnail_url: string | null
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

  async findAllJanProducts(options: {
    cursor?: Date
    q?: string
    judgment?: 'all' | 'ng' | 'partial' | 'ok'
    limit: number
  }): Promise<SystemProductRow[]> {
    const { cursor, q, judgment = 'all', limit } = options

    const cursorFrag = cursor
      ? Prisma.sql`AND updated_at < ${cursor}::timestamptz`
      : Prisma.empty
    const qFrag = q
      ? Prisma.sql`AND product_name ILIKE ${'%' + q + '%'}`
      : Prisma.empty
    const judgmentFrag =
      judgment === 'ng'
        ? Prisma.sql`AND jsonb_array_length(allergens->'contains') > 0`
        : judgment === 'partial'
          ? Prisma.sql`AND jsonb_array_length(allergens->'contains') = 0
                        AND jsonb_array_length(allergens->'partial') > 0`
          : judgment === 'ok'
            ? Prisma.sql`AND jsonb_array_length(allergens->'contains') = 0
                          AND jsonb_array_length(allergens->'partial') = 0`
            : Prisma.empty

    const rows = await this.prisma.$queryRaw<
      {
        id: string
        id_value: string
        product_name: string | null
        allergens: unknown
        scan_count: number
        updated_at: Date
        thumbnail_url: string | null
      }[]
    >(Prisma.sql`
      SELECT id, id_value, product_name, allergens, scan_count, updated_at, thumbnail_url
      FROM products
      WHERE id_type = 'jan'
      ${judgmentFrag}
      ${qFrag}
      ${cursorFrag}
      ORDER BY updated_at DESC
      LIMIT ${limit + 1}
    `)

    return rows.map((row) => {
      const al = row.allergens as { contains?: string[]; partial?: string[] }
      const contains = al.contains ?? []
      const partial = al.partial ?? []
      const judgment: 'ng' | 'partial' | 'ok' =
        contains.length > 0 ? 'ng' : partial.length > 0 ? 'partial' : 'ok'
      return {
        id: row.id,
        jan_code: row.id_value.replace(/^jan#/, ''),
        product_name: row.product_name,
        allergens_contains: contains,
        allergens_partial: partial,
        scan_count: row.scan_count,
        updated_at: row.updated_at,
        judgment,
        thumbnail_url: row.thumbnail_url,
      }
    })
  }
}
