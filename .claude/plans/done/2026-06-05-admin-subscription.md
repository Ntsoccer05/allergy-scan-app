# アーキテクチャ再設計 — Phase 3: Admin & Subscription 実装計画

> **エージェント向け:** REQUIRED SUB-SKILL: **`subagent-driven-development`** を使ってこの計画をタスクごとに実装すること。`executing-plans` は使用禁止。ステップはチェックボックス構文（`- [ ]`）で追跡。

**目標:** 管理者ダッシュボード（ユーザー一覧・統計・プラン変更）と Stripe Webhook スタブ（将来のサブスク課金対応の基盤）を構築する。

**前提:** `2026-06-05-foundation.md` の Phase 1 が完了していること（AdminGuard, plans/user_subscriptions テーブルが存在する）。

**アーキテクチャ:** `/admin/*` エンドポイントは `SupabaseJwtGuard + AdminGuard` の二重ガード。フロントエンドは `/admin` ルートグループで AdminLayout を使用。

**技術スタック:** NestJS / Next.js / shadcn/ui / Supabase Admin API

**仕様書:** `docs/specs/2026-06-05-architecture-redesign.md` Section 2, 4

---

### Task 1: バックエンド Admin モジュール

**Files:**
- Create: `backend/src/admin/admin.module.ts`
- Create: `backend/src/admin/admin.controller.ts`
- Create: `backend/src/admin/admin.controller.spec.ts`
- Create: `backend/src/admin/admin.service.ts`
- Create: `backend/src/admin/admin.repository.ts`
- Modify: `backend/src/app.module.ts`

エンドポイント:
```
GET  /admin/users           ユーザー一覧（ページネーション）
GET  /admin/stats           統計情報
PATCH /admin/users/:id/plan プラン手動変更
POST /admin/users/:id/ban   BANフラグ設定（users.banned_at を追加）
```

- [ ] **Step 1: 失敗するテストを書く**

`backend/src/admin/admin.controller.spec.ts`:

```typescript
import { Test } from '@nestjs/testing'
import { ForbiddenException } from '@nestjs/common'
import * as jwt from 'jsonwebtoken'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'

const TEST_SECRET = 'test-secret'
const makeAdminToken = () =>
  jwt.sign(
    { sub: 'admin-uuid', email: 'admin@test.com', role: 'authenticated',
      app_metadata: { provider: 'email', providers: ['email'], role: 'admin' } },
    TEST_SECRET,
  )

const mockService = {
  getUsers: jest.fn().mockResolvedValue({ items: [], next_cursor: null }),
  getStats: jest.fn().mockResolvedValue({ total_users: 0, total_scans: 0 }),
  updateUserPlan: jest.fn(),
  banUser: jest.fn(),
}

describe('AdminController', () => {
  let controller: AdminController

  beforeEach(async () => {
    process.env.SUPABASE_JWT_SECRET = TEST_SECRET
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: mockService }],
    }).compile()
    controller = moduleRef.get(AdminController)
  })

  it('should return users list', async () => {
    const req = { user: { sub: 'admin-uuid', app_metadata: { role: 'admin' } } }
    const result = await controller.getUsers(req as any, {})
    expect(result.items).toEqual([])
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pnpm --filter backend test admin
```

Expected: FAIL

- [ ] **Step 3: AdminRepository を実装する**

`backend/src/admin/admin.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

type AdminUserRow = {
  id: string
  email?: string
  locale: string
  created_at: Date
  plan_name: string
  daily_scan_limit: number
  scan_count_today: number
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
      scan_count_today: 0, // TODO: JOIN user_daily_scans
    }))

    return {
      items,
      next_cursor: hasMore ? pageUsers[pageUsers.length - 1].id : null,
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
```

- [ ] **Step 4: AdminService を実装する**

`backend/src/admin/admin.service.ts`:

```typescript
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
```

- [ ] **Step 5: AdminController を実装する**

`backend/src/admin/admin.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
```

- [ ] **Step 6: admin.module.ts を作成する**

`backend/src/admin/admin.module.ts`:

```typescript
import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { AdminRepository } from './admin.repository'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository],
})
export class AdminModule {}
```

`backend/src/app.module.ts` に `AdminModule` を追加。

- [ ] **Step 7: テストをパスすることを確認**

```bash
pnpm --filter backend test admin
```

Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add backend/src/admin/
git commit -m "feat(admin): add admin module with users/stats/plan-update endpoints"
```

---

### Task 2: Stripe Webhook エンドポイント（スタブ）

**Files:**
- Create: `backend/src/webhooks/webhooks.module.ts`
- Create: `backend/src/webhooks/stripe-webhook.controller.ts`
- Modify: `backend/src/app.module.ts`

このタスクは MVP 段階では実際の Stripe 連携を実装しない。署名検証フローと課金イベント処理のスタブのみ実装する。

- [ ] **Step 1: Stripe Webhook コントローラーを作成する**

`backend/src/webhooks/stripe-webhook.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Req,
  Headers,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { Public } from '../auth/public.decorator'
import type { Request } from 'express'

const STRIPE_WEBHOOK_EVENTS = ['invoice.payment_succeeded', 'invoice.payment_failed'] as const
type StripeWebhookEvent = (typeof STRIPE_WEBHOOK_EVENTS)[number]

@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name)

  /**
   * POST /webhooks/stripe: Stripe Webhook 受信エンドポイント。
   * MVP 段階では署名検証のみ実装。課金処理は TODO。
   * @Public() を使わず独自の検証を行う（JWT 不要だが Stripe 署名が必要）。
   */
  @Post('stripe')
  @Public()
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request,
  ) {
    if (!signature) throw new BadRequestException('Missing Stripe signature')

    // TODO: Stripe SDK で署名検証
    // const event = stripe.webhooks.constructEvent(req.rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)

    const body = req.body as { type?: string }
    const eventType = body.type as StripeWebhookEvent | undefined

    this.logger.log('Stripe Webhook 受信', { type: eventType })

    // TODO: 課金フロー実装
    // if (eventType === 'invoice.payment_succeeded') { ... }
    // if (eventType === 'invoice.payment_failed') { ... }

    return { received: true }
  }
}
```

`backend/src/webhooks/webhooks.module.ts`:

```typescript
import { Module } from '@nestjs/common'
import { StripeWebhookController } from './stripe-webhook.controller'

@Module({
  controllers: [StripeWebhookController],
})
export class WebhooksModule {}
```

`backend/src/app.module.ts` に `WebhooksModule` を追加。

- [ ] **Step 2: コミット**

```bash
git add backend/src/webhooks/
git commit -m "feat(webhooks): add Stripe webhook stub endpoint"
```

---

### Task 3: フロントエンド Admin ページ

**Files:**
- Create: `frontend/src/app/admin/layout.tsx`
- Create: `frontend/src/app/admin/users/page.tsx`
- Create: `frontend/src/app/admin/stats/page.tsx`
- Create: `frontend/src/components/templates/AdminLayout.tsx`
- Create: `frontend/src/lib/api/admin.api.ts`

- [ ] **Step 1: AdminLayout テンプレートを作成する**

`frontend/src/components/templates/AdminLayout.tsx`:

```tsx
import Link from 'next/link'
import type { ReactNode } from 'react'

const ADMIN_NAV = [
  { href: '/admin/stats',  label: '統計' },
  { href: '/admin/users',  label: 'ユーザー' },
]

export const AdminLayout = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-screen">
    <aside className="w-48 border-r bg-background p-4">
      <p className="mb-4 text-sm font-bold text-muted-foreground">管理者</p>
      <nav className="flex flex-col gap-1">
        {ADMIN_NAV.map(item => (
          <Link key={item.href} href={item.href} className="rounded px-3 py-2 text-sm hover:bg-accent">
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <Link href="/scan" className="text-xs text-muted-foreground hover:text-foreground">
          ← アプリへ戻る
        </Link>
      </div>
    </aside>
    <main className="flex-1 p-6">{children}</main>
  </div>
)
```

- [ ] **Step 2: Admin レイアウトグループを作成する**

`frontend/src/app/admin/layout.tsx`:

```tsx
import { AdminLayout } from '@/components/templates/AdminLayout'

export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>
}
```

- [ ] **Step 3: Admin API クライアントを作成する**

`frontend/src/lib/api/admin.api.ts`:

```typescript
import { apiFetch } from './api-client'

export type AdminUser = {
  id: string
  locale: string
  created_at: string
  plan_name: string
  daily_scan_limit: number
}

export type AdminStats = {
  total_users: number
  total_scans: number
  scans_today: number
  active_premium: number
}

export const getAdminUsers = async (cursor?: string) => {
  const params = new URLSearchParams({ ...(cursor ? { cursor } : {}) })
  const res = await apiFetch(`/admin/users?${params}`)
  return res.json() as Promise<{ items: AdminUser[]; next_cursor: string | null }>
}

export const getAdminStats = async () => {
  const res = await apiFetch('/admin/stats')
  return res.json() as Promise<AdminStats>
}

export const updateUserPlan = async (userId: string, planName: string) => {
  await apiFetch(`/admin/users/${userId}/plan`, {
    method: 'PATCH',
    body: JSON.stringify({ plan_name: planName }),
  })
}
```

- [ ] **Step 4: Stats ページを作成する**

`frontend/src/app/admin/stats/page.tsx`:

```tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { getAdminStats } from '@/lib/api/admin.api'

export default function AdminStatsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: getAdminStats,
    refetchInterval: 60_000,
  })

  if (isLoading) return <p>読み込み中...</p>

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold">統計情報</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: '総ユーザー数', value: data?.total_users },
          { label: '総スキャン数', value: data?.total_scans },
          { label: '本日のスキャン', value: data?.scans_today },
          { label: 'プレミアム会員', value: data?.active_premium },
        ].map(card => (
          <div key={card.label} className="rounded-lg border bg-card p-4 text-center shadow-sm">
            <p className="text-3xl font-bold">{card.value ?? '—'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{card.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Users ページを作成する**

`frontend/src/app/admin/users/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getAdminUsers, updateUserPlan } from '@/lib/api/admin.api'
import { Button } from '@/components/ui/button'

export default function AdminUsersPage() {
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['admin-users'],
    queryFn: ({ pageParam }) => getAdminUsers(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.next_cursor ?? undefined,
  })

  const users = data?.pages.flatMap(p => p.items) ?? []

  const handlePlanChange = async (userId: string, currentPlan: string) => {
    const newPlan = currentPlan === 'free' ? 'premium' : 'free'
    setUpdatingId(userId)
    try {
      await updateUserPlan(userId, newPlan)
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold">ユーザー管理</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4">ID</th>
              <th className="pb-2 pr-4">作成日</th>
              <th className="pb-2 pr-4">プラン</th>
              <th className="pb-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b">
                <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                  {user.id.slice(0, 8)}...
                </td>
                <td className="py-2 pr-4">
                  {new Date(user.created_at).toLocaleDateString('ja-JP')}
                </td>
                <td className="py-2 pr-4">{user.plan_name}</td>
                <td className="py-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updatingId === user.id}
                    onClick={() => handlePlanChange(user.id, user.plan_name)}
                  >
                    {user.plan_name === 'free' ? 'Premium に変更' : 'Free に変更'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasNextPage && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? '読み込み中...' : 'さらに表示'}
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: 型チェック**

```bash
pnpm --filter frontend typecheck
```

- [ ] **Step 7: コミット**

```bash
git add frontend/src/app/admin/ frontend/src/components/templates/AdminLayout.tsx frontend/src/lib/api/admin.api.ts
git commit -m "feat(admin): add admin dashboard (stats, users, plan management)"
```

---

### Task 4: 全体テスト + 型チェック確認

- [ ] **Step 1: バックエンド全テスト**

```bash
pnpm --filter backend test
```

Expected: 全テストパス

- [ ] **Step 2: フロントエンド全テスト**

```bash
pnpm --filter frontend test
```

Expected: 全テストパス

- [ ] **Step 3: 型チェック（全パッケージ）**

```bash
pnpm -r typecheck
```

Expected: エラーなし

---

## 完了チェックリスト

- [ ] `pnpm -r test` 全パス
- [ ] `pnpm -r typecheck` エラーなし
- [ ] `GET /admin/users` が AdminGuard で保護されている（非 admin → 403）
- [ ] `GET /admin/stats` が正しいデータを返す
- [ ] `PATCH /admin/users/:id/plan` でプランが変更できる
- [ ] `/webhooks/stripe` が @Public() で JWT 不要
- [ ] Admin ページが `/admin/*` ルートで動作する
- [ ] Middleware が admin 以外を `/403` にリダイレクトする
- [ ] 管理画面でプラン変更後、対象ユーザーの subscription が更新される

## アーキテクチャ再設計 全体完了後

全 Phase 完了後に `finishing-a-development-branch` スキルを使って:
1. 最終テスト・型チェック確認
2. `docs/design/api.md`・`docs/design/database.md`・`CLAUDE.md` のドキュメント更新
3. PR 作成
