# アーキテクチャ再設計 — Phase 1: Foundation 実装計画

> **エージェント向け:** REQUIRED SUB-SKILL: **`subagent-driven-development`** を使ってこの計画をタスクごとに実装すること。`executing-plans` は使用禁止。ステップはチェックボックス構文（`- [ ]`）で追跡。

**目標:** Cookie認証→Supabase Auth JWT認証へ移行し、スキャン回数制限・みんなの履歴公開・管理者ガード等のバックエンド基盤を構築する。

**アーキテクチャ:** NestJS Lambda に SupabaseJwtGuard（グローバル）を追加し、全エンドポイントで JWT を検証。スキャン系エンドポイントに DailyScanLimitGuard（per-user 日次制限）と 3 秒クールダウンを追加。

**技術スタック:** NestJS / Prisma / Supabase (DB + Auth JWT) / jsonwebtoken

**依存関係:** この Phase 1 を先行して完了させること。Phase 2（Frontend）と Phase 3（Admin）はこの Phase が完了してから着手する。

**仕様書:** `docs/specs/2026-06-05-architecture-redesign.md`

---

## 実行前チェック

```bash
# 現在のブランチ確認
git branch
# テストが通っていることを確認
pnpm --filter backend test
```

---

### Task 1: Prisma スキーマ刷新

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/seed.ts`（plans マスターデータ）

変更点:
1. `BackupCode` モデル削除（Supabase Auth でアカウント復旧を代替）
2. `User` から `onboarding_done`・`last_used_at`・`backupCodes` リレーション削除、`updated_at` 追加
3. `ScanHistory` に `ocr_image_url`・`is_public` 追加
4. `Plan`・`UserSubscription`・`UserDailyScan`・`StripeCustomer` モデル追加

- [ ] **Step 1: schema.prisma を更新する**

`backend/prisma/schema.prisma` の `User` モデルを以下に置き換え:

```prisma
// ユーザー・アレルギー設定（Supabase Auth UUID を PK として使用）
model User {
  id        String   @id
  allergies Json     @default("{}")
  locale    String   @default("ja")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  subscriptions  UserSubscription[]
  dailyScans     UserDailyScan[]
  stripeCustomer StripeCustomer?

  @@map("users")
}
```

`ScanHistory` モデルに以下フィールドを追加:

```prisma
  ocrImageUrl  String?  @map("ocr_image_url")
  isPublic     Boolean  @default(true) @map("is_public")
```

`BackupCode` モデルを**削除**する。

ファイル末尾に以下のモデルを追加:

```prisma
// プランマスター（'free' | 'premium'）
model Plan {
  id              String   @id @default(uuid())
  name            String   @unique
  displayName     String   @map("display_name")
  dailyScanLimit  Int      @map("daily_scan_limit")
  priceMonthlyJpy Int      @default(0) @map("price_monthly_jpy")
  priceYearlyJpy  Int      @default(0) @map("price_yearly_jpy")
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  subscriptions UserSubscription[]

  @@map("plans")
}

// ユーザー契約（全ユーザーに必ず 1 件・初回ログイン時に無料プランで INSERT）
model UserSubscription {
  id                   String    @id @default(uuid())
  userId               String    @map("user_id")
  planId               String    @map("plan_id")
  status               String    @default("active")
  // 'active' | 'cancelled' | 'expired'
  currentPeriodStart   DateTime  @default(now()) @map("current_period_start")
  currentPeriodEnd     DateTime? @map("current_period_end")
  stripeSubscriptionId String?   @map("stripe_subscription_id")
  createdAt            DateTime  @default(now()) @map("created_at")
  updatedAt            DateTime  @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  plan Plan @relation(fields: [planId], references: [id])

  @@index([userId, status], name: "user_subscriptions_user_idx")
  @@map("user_subscriptions")
}

// スキャン回数トラッキング（user_id + scan_date で UNIQUE）
model UserDailyScan {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  scanDate  DateTime @db.Date @map("scan_date")
  scanCount Int      @default(0) @map("scan_count")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, scanDate])
  @@index([userId, scanDate], name: "user_daily_scans_user_date_idx")
  @@map("user_daily_scans")
}

// Stripe 連携（MVP 時は空・将来追加）
model StripeCustomer {
  id               String   @id @default(uuid())
  userId           String   @unique @map("user_id")
  stripeCustomerId String   @unique @map("stripe_customer_id")
  createdAt        DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("stripe_customers")
}
```

- [ ] **Step 2: マイグレーション作成・適用**

```bash
cd backend
npx prisma migrate dev --name architecture_redesign
```

Expected: マイグレーションファイル生成・DB 適用完了

- [ ] **Step 3: seed.ts 作成**

`backend/prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.plan.upsert({
    where: { name: 'free' },
    update: { dailyScanLimit: 20 },
    create: {
      name: 'free',
      displayName: '無料プラン',
      dailyScanLimit: 20,
      priceMonthlyJpy: 0,
      priceYearlyJpy: 0,
    },
  })
  await prisma.plan.upsert({
    where: { name: 'premium' },
    update: { dailyScanLimit: 50 },
    create: {
      name: 'premium',
      displayName: 'プレミアムプラン',
      dailyScanLimit: 50,
      priceMonthlyJpy: 980,
      priceYearlyJpy: 9800,
    },
  })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

```bash
npx prisma db seed
```

Expected: `free` / `premium` プランがINSERTされる

- [ ] **Step 4: 型チェック確認**

```bash
pnpm --filter backend typecheck
```

Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/ backend/prisma/seed.ts
git commit -m "feat(db): add plans/subscriptions/daily-scans tables, remove backup_codes"
```

---

### Task 2: jsonwebtoken パッケージ追加 + 環境変数設定

**Files:**
- Modify: `backend/package.json`
- Create/Modify: `backend/.env.example`

- [ ] **Step 1: パッケージインストール**

```bash
cd backend
pnpm add jsonwebtoken
pnpm add -D @types/jsonwebtoken
```

- [ ] **Step 2: .env.example に Supabase 変数を追加**

既存の `.env.example` に以下を追記:

```bash
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Admin API 用（seed-admin.ts のみ）
SUPABASE_JWT_SECRET=your-jwt-secret  # Supabase Project Settings > API > JWT Settings

# Admin Seeder（開発環境専用）
SEED_ADMIN_PASSWORD=change-this-in-dev
```

- [ ] **Step 3: コミット**

```bash
git add backend/package.json backend/pnpm-lock.yaml backend/.env.example
git commit -m "chore(backend): add jsonwebtoken, update env example for Supabase"
```

---

### Task 3: SupabaseJwtGuard + @Public() デコレーター

**Files:**
- Create: `backend/src/auth/supabase-jwt.guard.ts`
- Create: `backend/src/auth/supabase-jwt.guard.spec.ts`
- Create: `backend/src/auth/public.decorator.ts`
- Create: `backend/src/auth/types/supabase-jwt.types.ts`
- Create: `backend/src/auth/auth.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: 型定義を作成する**

`backend/src/auth/types/supabase-jwt.types.ts`:

```typescript
/** Supabase JWT ペイロード型（HS256）。 */
export type SupabaseJwtPayload = {
  sub: string            // Supabase user UUID
  email: string
  role: string           // 'authenticated'
  app_metadata: {
    provider: string
    providers: string[]
    role?: 'admin'       // AdminGuard が参照する
  }
  user_metadata: Record<string, unknown>
  iat: number
  exp: number
}
```

- [ ] **Step 2: @Public() デコレーターを作成する**

`backend/src/auth/public.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
```

- [ ] **Step 3: 失敗するテストを書く**

`backend/src/auth/supabase-jwt.guard.spec.ts`:

```typescript
import { Test } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import { UnauthorizedException } from '@nestjs/common'
import * as jwt from 'jsonwebtoken'
import { SupabaseJwtGuard } from './supabase-jwt.guard'
import type { SupabaseJwtPayload } from './types/supabase-jwt.types'

const TEST_JWT_SECRET = 'test-secret'

const buildContext = (authorization?: string, metadata?: { isPublic?: boolean }) => {
  const mockReflector = {
    getAllAndOverride: jest.fn().mockReturnValue(metadata?.isPublic ?? false),
  }
  const request = { headers: { authorization }, user: undefined as unknown }
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
    reflector: mockReflector,
    request,
  }
}

describe('SupabaseJwtGuard', () => {
  let guard: SupabaseJwtGuard

  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET
  })

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SupabaseJwtGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn().mockReturnValue(false) } },
      ],
    }).compile()
    guard = moduleRef.get(SupabaseJwtGuard)
  })

  it('should pass with valid JWT', () => {
    const payload: Partial<SupabaseJwtPayload> = {
      sub: 'user-uuid',
      email: 'test@example.com',
      role: 'authenticated',
      app_metadata: { provider: 'email', providers: ['email'] },
    }
    const token = jwt.sign(payload, TEST_JWT_SECRET)
    const ctx = buildContext(`Bearer ${token}`)
    expect(guard.canActivate(ctx as any)).toBe(true)
    expect(ctx.request.user).toMatchObject({ sub: 'user-uuid' })
  })

  it('should throw 401 when no token', () => {
    const ctx = buildContext(undefined)
    expect(() => guard.canActivate(ctx as any)).toThrow(UnauthorizedException)
  })

  it('should throw 401 when token is invalid', () => {
    const ctx = buildContext('Bearer invalid-token')
    expect(() => guard.canActivate(ctx as any)).toThrow(UnauthorizedException)
  })

  it('should skip guard when @Public() is set', () => {
    const ctx = buildContext(undefined, { isPublic: true })
    // @Public() endpoint: Reflector returns true
    const publicReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    }
    const publicGuard = new (guard.constructor as any)(publicReflector)
    expect(publicGuard.canActivate(ctx)).toBe(true)
  })
})
```

- [ ] **Step 4: テストが失敗することを確認**

```bash
pnpm --filter backend test auth/supabase-jwt.guard
```

Expected: FAIL (SupabaseJwtGuard が存在しない)

- [ ] **Step 5: SupabaseJwtGuard を実装する**

`backend/src/auth/supabase-jwt.guard.ts`:

```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import * as jwt from 'jsonwebtoken'
import { IS_PUBLIC_KEY } from './public.decorator'
import type { SupabaseJwtPayload } from './types/supabase-jwt.types'

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest()
    const token = this.extractToken(request)
    if (!token) throw new UnauthorizedException()

    try {
      const secret = process.env.SUPABASE_JWT_SECRET
      if (!secret) throw new Error('SUPABASE_JWT_SECRET not set')
      const payload = jwt.verify(token, secret) as SupabaseJwtPayload
      request.user = payload
      return true
    } catch {
      throw new UnauthorizedException()
    }
  }

  private extractToken(request: { headers?: { authorization?: string } }): string | null {
    const auth = request.headers?.authorization
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice(7)
  }
}
```

- [ ] **Step 6: auth.module.ts を作成する**

`backend/src/auth/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common'
import { SupabaseJwtGuard } from './supabase-jwt.guard'

@Module({
  providers: [SupabaseJwtGuard],
  exports: [SupabaseJwtGuard],
})
export class AuthModule {}
```

- [ ] **Step 7: app.module.ts にグローバルガードとして登録する**

`backend/src/app.module.ts` を更新（`APP_GUARD` として追加、cookie-parser 関連インポートも削除）:

```typescript
import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { PrismaModule } from './prisma/prisma.module'
import { ScanModule } from './scan/scan.module'
import { HistoryModule } from './history/history.module'
import { UsersModule } from './users/users.module'
import { ProductsModule } from './products/products.module'
import { AllergensModule } from './allergens/allergens.module'
import { AuthModule } from './auth/auth.module'
import { ThrottlerExceptionFilter } from './shared/throttler-exception.filter'
import { SupabaseJwtGuard } from './auth/supabase-jwt.guard'
import {
  THROTTLE_DEFAULT_TTL_MS,
  THROTTLE_DEFAULT_LIMIT,
} from './shared/throttler.constants'

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { ttl: THROTTLE_DEFAULT_TTL_MS, limit: THROTTLE_DEFAULT_LIMIT },
    ]),
    PrismaModule,
    AuthModule,
    ScanModule,
    HistoryModule,
    UsersModule,
    ProductsModule,
    AllergensModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SupabaseJwtGuard,  // 全エンドポイントに適用（@Public() でスキップ可）
    },
    {
      provide: APP_FILTER,
      useClass: ThrottlerExceptionFilter,
    },
  ],
})
export class AppModule {}
```

- [ ] **Step 8: テストをパスすることを確認**

```bash
pnpm --filter backend test auth/supabase-jwt.guard
```

Expected: PASS

- [ ] **Step 9: 型チェック**

```bash
pnpm --filter backend typecheck
```

- [ ] **Step 10: コミット**

```bash
git add backend/src/auth/
git commit -m "feat(auth): add SupabaseJwtGuard + @Public() decorator as global guard"
```

---

### Task 4: AdminGuard

**Files:**
- Create: `backend/src/auth/admin.guard.ts`
- Create: `backend/src/auth/admin.guard.spec.ts`

- [ ] **Step 1: 失敗するテストを書く**

`backend/src/auth/admin.guard.spec.ts`:

```typescript
import { ForbiddenException } from '@nestjs/common'
import { AdminGuard } from './admin.guard'
import type { SupabaseJwtPayload } from './types/supabase-jwt.types'

const buildContext = (role?: string) => {
  const payload: Partial<SupabaseJwtPayload> = {
    sub: 'user-uuid',
    app_metadata: { provider: 'email', providers: ['email'], ...(role ? { role: role as 'admin' } : {}) },
  }
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: payload }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }
}

describe('AdminGuard', () => {
  let guard: AdminGuard

  beforeEach(() => { guard = new AdminGuard() })

  it('should allow admin users', () => {
    expect(guard.canActivate(buildContext('admin') as any)).toBe(true)
  })

  it('should throw 403 for non-admin users', () => {
    expect(() => guard.canActivate(buildContext() as any)).toThrow(ForbiddenException)
  })

  it('should throw 403 when user is null', () => {
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ user: null }) }), getHandler: () => ({}), getClass: () => ({}) }
    expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pnpm --filter backend test auth/admin.guard
```

Expected: FAIL

- [ ] **Step 3: AdminGuard を実装する**

`backend/src/auth/admin.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import type { SupabaseJwtPayload } from './types/supabase-jwt.types'

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user = request.user as SupabaseJwtPayload | null
    if (user?.app_metadata?.role !== 'admin') {
      throw new ForbiddenException()
    }
    return true
  }
}
```

`backend/src/auth/auth.module.ts` の providers/exports に `AdminGuard` を追加:

```typescript
import { AdminGuard } from './admin.guard'

@Module({
  providers: [SupabaseJwtGuard, AdminGuard],
  exports: [SupabaseJwtGuard, AdminGuard],
})
```

- [ ] **Step 4: テストをパスすることを確認**

```bash
pnpm --filter backend test auth/admin.guard
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add backend/src/auth/
git commit -m "feat(auth): add AdminGuard checking app_metadata.role === 'admin'"
```

---

### Task 5: UserDailyScansRepository + UserDailyScansService

**Files:**
- Create: `backend/src/users/user-daily-scans.repository.ts`
- Create: `backend/src/users/user-daily-scans.service.ts`
- Create: `backend/src/users/user-daily-scans.service.spec.ts`
- Modify: `backend/src/users/users.module.ts`

- [ ] **Step 1: 失敗するテストを書く**

`backend/src/users/user-daily-scans.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing'
import { UserDailyScansService } from './user-daily-scans.service'
import { UserDailyScansRepository } from './user-daily-scans.repository'
import { PrismaService } from '../prisma/prisma.service'

const mockRepository = {
  getTodayCount: jest.fn(),
  upsertIncrement: jest.fn(),
  getUserDailyScanLimit: jest.fn(),
}

describe('UserDailyScansService', () => {
  let service: UserDailyScansService

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        UserDailyScansService,
        { provide: UserDailyScansRepository, useValue: mockRepository },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile()
    service = moduleRef.get(UserDailyScansService)
  })

  afterEach(() => jest.clearAllMocks())

  describe('canUserScan', () => {
    it('should return true when under daily limit', async () => {
      mockRepository.getTodayCount.mockResolvedValue(5)
      mockRepository.getUserDailyScanLimit.mockResolvedValue(20)
      const result = await service.canUserScan('user-uuid')
      expect(result).toBe(true)
    })

    it('should return false when at daily limit', async () => {
      mockRepository.getTodayCount.mockResolvedValue(20)
      mockRepository.getUserDailyScanLimit.mockResolvedValue(20)
      const result = await service.canUserScan('user-uuid')
      expect(result).toBe(false)
    })

    it('should return false when over daily limit', async () => {
      mockRepository.getTodayCount.mockResolvedValue(25)
      mockRepository.getUserDailyScanLimit.mockResolvedValue(20)
      const result = await service.canUserScan('user-uuid')
      expect(result).toBe(false)
    })
  })

  describe('incrementScanCount', () => {
    it('should call upsertIncrement with today date', async () => {
      await service.incrementScanCount('user-uuid')
      expect(mockRepository.upsertIncrement).toHaveBeenCalledWith(
        'user-uuid',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      )
    })
  })

  describe('getRemainingScans', () => {
    it('should return limit minus count', async () => {
      mockRepository.getTodayCount.mockResolvedValue(7)
      mockRepository.getUserDailyScanLimit.mockResolvedValue(20)
      const result = await service.getRemainingScans('user-uuid')
      expect(result).toEqual({ remaining: 13, limit: 20, used: 7 })
    })
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pnpm --filter backend test user-daily-scans.service
```

Expected: FAIL

- [ ] **Step 3: Repository を実装する**

`backend/src/users/user-daily-scans.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class UserDailyScansRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getTodayCount(userId: string, scanDate: string): Promise<number> {
    const record = await this.prisma.userDailyScan.findUnique({
      where: { userId_scanDate: { userId, scanDate: new Date(scanDate) } },
    })
    return record?.scanCount ?? 0
  }

  async upsertIncrement(userId: string, scanDate: string): Promise<void> {
    await this.prisma.userDailyScan.upsert({
      where: { userId_scanDate: { userId, scanDate: new Date(scanDate) } },
      update: { scanCount: { increment: 1 } },
      create: { userId, scanDate: new Date(scanDate), scanCount: 1 },
    })
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
    })
    return subscription?.plan.dailyScanLimit ?? 0
  }
}
```

- [ ] **Step 4: Service を実装する**

`backend/src/users/user-daily-scans.service.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import { UserDailyScansRepository } from './user-daily-scans.repository'

type ScanUsageResult = {
  remaining: number
  limit: number
  used: number
}

@Injectable()
export class UserDailyScansService {
  constructor(private readonly repo: UserDailyScansRepository) {}

  async canUserScan(userId: string): Promise<boolean> {
    const today = this.todayString()
    const [count, limit] = await Promise.all([
      this.repo.getTodayCount(userId, today),
      this.repo.getUserDailyScanLimit(userId),
    ])
    return count < limit
  }

  async incrementScanCount(userId: string): Promise<void> {
    await this.repo.upsertIncrement(userId, this.todayString())
  }

  async getRemainingScans(userId: string): Promise<ScanUsageResult> {
    const today = this.todayString()
    const [used, limit] = await Promise.all([
      this.repo.getTodayCount(userId, today),
      this.repo.getUserDailyScanLimit(userId),
    ])
    return { remaining: Math.max(0, limit - used), limit, used }
  }

  private todayString(): string {
    return new Date().toISOString().slice(0, 10)
  }
}
```

- [ ] **Step 5: users.module.ts に追加**

`backend/src/users/users.module.ts` の providers に `UserDailyScansRepository` と `UserDailyScansService` を追加し、`exports` にも `UserDailyScansService` を追加する。

- [ ] **Step 6: テストをパスすることを確認**

```bash
pnpm --filter backend test user-daily-scans.service
```

Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add backend/src/users/user-daily-scans.repository.ts \
        backend/src/users/user-daily-scans.service.ts \
        backend/src/users/user-daily-scans.service.spec.ts \
        backend/src/users/users.module.ts
git commit -m "feat(users): add UserDailyScansRepository and UserDailyScansService"
```

---

### Task 6: DailyScanLimitGuard

**Files:**
- Create: `backend/src/scan/daily-scan-limit.guard.ts`
- Create: `backend/src/scan/daily-scan-limit.guard.spec.ts`

- [ ] **Step 1: 失敗するテストを書く**

`backend/src/scan/daily-scan-limit.guard.spec.ts`:

```typescript
import { HttpException, HttpStatus } from '@nestjs/common'
import { DailyScanLimitGuard } from './daily-scan-limit.guard'
import { UserDailyScansService } from '../users/user-daily-scans.service'

const mockService = { canUserScan: jest.fn() }

const buildContext = (userId: string) => ({
  switchToHttp: () => ({
    getRequest: () => ({ user: { sub: userId } }),
  }),
})

describe('DailyScanLimitGuard', () => {
  let guard: DailyScanLimitGuard

  beforeEach(() => {
    guard = new DailyScanLimitGuard(mockService as unknown as UserDailyScansService)
  })

  afterEach(() => jest.clearAllMocks())

  it('should allow scan when under limit', async () => {
    mockService.canUserScan.mockResolvedValue(true)
    const result = await guard.canActivate(buildContext('user-uuid') as any)
    expect(result).toBe(true)
  })

  it('should throw 429 when over limit', async () => {
    mockService.canUserScan.mockResolvedValue(false)
    await expect(guard.canActivate(buildContext('user-uuid') as any)).rejects.toThrow(
      new HttpException({ message: 'scan.error.dailyLimitExceeded' }, HttpStatus.TOO_MANY_REQUESTS),
    )
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pnpm --filter backend test daily-scan-limit.guard
```

Expected: FAIL

- [ ] **Step 3: DailyScanLimitGuard を実装する**

`backend/src/scan/daily-scan-limit.guard.ts`:

```typescript
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
import { UserDailyScansService } from '../users/user-daily-scans.service'
import type { SupabaseJwtPayload } from '../auth/types/supabase-jwt.types'

@Injectable()
export class DailyScanLimitGuard implements CanActivate {
  constructor(private readonly userDailyScansService: UserDailyScansService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const userId = (request.user as SupabaseJwtPayload).sub
    const canScan = await this.userDailyScansService.canUserScan(userId)
    if (!canScan) {
      throw new HttpException(
        { message: 'scan.error.dailyLimitExceeded' },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    return true
  }
}
```

- [ ] **Step 4: テストをパスすることを確認**

```bash
pnpm --filter backend test daily-scan-limit.guard
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add backend/src/scan/daily-scan-limit.guard.ts \
        backend/src/scan/daily-scan-limit.guard.spec.ts
git commit -m "feat(scan): add DailyScanLimitGuard (429 when daily limit exceeded)"
```

---

### Task 7: ユーザーモジュール刷新（旧 Cookie 認証削除 + POST /users/me/init 追加）

**Files:**
- Modify: `backend/src/users/users.controller.ts`
- Modify: `backend/src/users/users.service.ts`（または新規作成）
- Modify: `backend/src/users/users.repository.ts`
- Delete: `backend/src/users/backup-code.controller.ts`
- Delete: `backend/src/users/backup-code.service.ts`
- Delete: `backend/src/users/backup-code.repository.ts`
- Delete: `backend/src/users/backup-code.constants.ts`

変更内容:
- `POST /users/init`（Cookie 発行）→ 削除
- `POST /users/backup-code`・`POST /users/restore` → 削除
- `POST /users/me/init` → 追加（Supabase JWT から userId を取得してレコード作成 + 無料プランサブスク作成）
- `GET /users/me`・`PUT /users/me`・`DELETE /users/me` → 認証を JWT ベースに変更（Cookie チェック削除）

- [ ] **Step 1: 失敗するテストを書く**

`backend/src/users/users.controller.spec.ts`（既存ファイルを以下に置き換え）:

```typescript
import { Test } from '@nestjs/testing'
import { HttpStatus, INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import * as jwt from 'jsonwebtoken'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

const TEST_SECRET = 'test-secret'

const makeToken = (sub = 'user-uuid') =>
  jwt.sign(
    {
      sub,
      email: 'user@example.com',
      role: 'authenticated',
      app_metadata: { provider: 'email', providers: ['email'] },
    },
    TEST_SECRET,
  )

const mockService = {
  initUser: jest.fn(),
  getUser: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
}

describe('UsersController', () => {
  let app: INestApplication

  beforeEach(async () => {
    process.env.SUPABASE_JWT_SECRET = TEST_SECRET
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockService }],
    }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(() => app.close())
  afterEach(() => jest.clearAllMocks())

  describe('POST /users/me/init', () => {
    it('should create user and return created:true', async () => {
      mockService.initUser.mockResolvedValue({ created: true })
      const res = await request(app.getHttpServer())
        .post('/users/me/init')
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(HttpStatus.OK)
      expect(res.body.created).toBe(true)
      expect(mockService.initUser).toHaveBeenCalledWith('user-uuid', 'user@example.com')
    })

    it('should return created:false when user already exists', async () => {
      mockService.initUser.mockResolvedValue({ created: false })
      const res = await request(app.getHttpServer())
        .post('/users/me/init')
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(HttpStatus.OK)
      expect(res.body.created).toBe(false)
    })
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pnpm --filter backend test users.controller
```

Expected: FAIL

- [ ] **Step 3: UsersService を実装する**

`backend/src/users/users.service.ts` （既存を置き換え）:

```typescript
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

  /**
   * 初回ログイン後のユーザーレコード作成。
   * 既存ユーザーの場合は何もしない（冪等）。
   * users レコードと無料プランの user_subscriptions を同時に作成する。
   */
  async initUser(userId: string, email: string): Promise<InitResult> {
    const existing = await this.usersRepository.findById(userId)
    if (existing) return { created: false }

    await this.usersRepository.createWithFreePlan(userId)
    this.logger.log('新規ユーザー作成', { userId })
    return { created: true }
  }

  async getUser(userId: string): Promise<UserMeResult> {
    const user = await this.usersRepository.findByIdWithSubscription(userId)
    if (!user) throw new NotFoundException('ユーザーが見つかりません')
    const activeSub = user.subscriptions.find(sub => sub.status === 'active')
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

  async updateUser(userId: string, allergies?: UserAllergies, locale?: string): Promise<void> {
    const user = await this.usersRepository.findById(userId)
    if (!user) throw new NotFoundException('ユーザーが見つかりません')
    await this.usersRepository.update(userId, { allergies, locale })
  }

  async deleteUser(userId: string): Promise<void> {
    await this.usersRepository.deleteById(userId)
    this.logger.log('ユーザー削除', { userId })
  }
}
```

- [ ] **Step 4: UsersRepository を更新する**

`backend/src/users/users.repository.ts` に以下のメソッドを追加:

```typescript
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
```

- [ ] **Step 5: UsersController を置き換える**

`backend/src/users/users.controller.ts` を以下に完全置き換え:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator'
import { UsersService } from './users.service'
import type { SupabaseJwtPayload } from '../auth/types/supabase-jwt.types'
import type { UserAllergies } from '../shared/types/db.types'

class UpdateUserDto {
  @IsOptional()
  @IsObject()
  allergies?: UserAllergies

  @IsOptional()
  @IsString()
  locale?: string
}

type AuthRequest = Request & { user: SupabaseJwtPayload }

@Controller('users/me')
export class UsersController {
  private readonly logger = new Logger(UsersController.name)

  constructor(private readonly usersService: UsersService) {}

  /** POST /users/me/init: 初回ログイン後のユーザーレコード作成（冪等）。 */
  @Post('init')
  @HttpCode(HttpStatus.OK)
  async initUser(@Req() req: AuthRequest) {
    const { sub, email } = req.user
    return this.usersService.initUser(sub, email)
  }

  /** GET /users/me: アレルギー設定 + プラン情報取得。 */
  @Get()
  async getUser(@Req() req: AuthRequest) {
    return this.usersService.getUser(req.user.sub)
  }

  /** PUT /users/me: アレルギー設定・locale 更新。 */
  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateUser(@Req() req: AuthRequest, @Body() dto: UpdateUserDto) {
    await this.usersService.updateUser(req.user.sub, dto.allergies, dto.locale)
  }

  /** DELETE /users/me: アカウント削除（要配慮個人情報の削除権）。 */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@Req() req: AuthRequest) {
    await this.usersService.deleteUser(req.user.sub)
  }
}
```

- [ ] **Step 6: バックアップコード関連ファイルを削除**

```bash
rm backend/src/users/backup-code.controller.ts
rm backend/src/users/backup-code.service.ts
rm backend/src/users/backup-code.repository.ts
rm backend/src/users/backup-code.constants.ts
rm backend/src/users/__tests__/backup-code.service.spec.ts
```

users.module.ts からも BackupCode 関連の import・providers を削除する。

- [ ] **Step 7: テストをパスすることを確認**

```bash
pnpm --filter backend test users
```

Expected: PASS

- [ ] **Step 8: 型チェック**

```bash
pnpm --filter backend typecheck
```

- [ ] **Step 9: コミット**

```bash
git add backend/src/users/
git commit -m "feat(users): replace Cookie auth with Supabase JWT, add POST /users/me/init"
```

---

### Task 8: Public History エンドポイント

**Files:**
- Create: `backend/src/history/public-history.controller.ts`
- Create: `backend/src/history/public-history.controller.spec.ts`
- Modify: `backend/src/history/history.service.ts`
- Modify: `backend/src/history/scan-history.repository.ts`
- Modify: `backend/src/history/history.module.ts`

- [ ] **Step 1: ScanHistoryRepository にパブリック履歴クエリを追加する**

`backend/src/history/scan-history.repository.ts` に以下を追加:

```typescript
  /** みんなの履歴一覧（is_public = true のみ・カーソルページネーション）。 */
  async findPublicHistory(limit: number, before?: Date): Promise<ScanHistoryRecord[]> {
    return this.prisma.scanHistory.findMany({
      where: {
        isPublic: true,
        ...(before ? { scannedAt: { lt: before } } : {}),
      },
      orderBy: { scannedAt: 'desc' },
      take: limit,
    })
  }

  /** 新着チェック用ダイジェスト（count + last_updated_at）。 */
  async getPublicHistoryDigest(): Promise<{ count: number; last_updated_at: Date | null }> {
    const [count, latest] = await Promise.all([
      this.prisma.scanHistory.count({ where: { isPublic: true } }),
      this.prisma.scanHistory.findFirst({
        where: { isPublic: true },
        orderBy: { scannedAt: 'desc' },
        select: { scannedAt: true },
      }),
    ])
    return { count, last_updated_at: latest?.scannedAt ?? null }
  }
```

- [ ] **Step 2: HistoryService にパブリック履歴メソッドを追加する**

`backend/src/history/history.service.ts` に追加:

```typescript
  /**
   * みんなの履歴取得（@Public() エンドポイント向け）。
   * NestJS メモリキャッシュ 30 秒でサーバー負荷を軽減。
   */
  async getPublicHistory(limit: number, before?: Date): Promise<HistoryListResult> {
    const items = await this.scanHistoryRepository.findPublicHistory(limit + 1, before)
    const hasMore = items.length > limit
    const pageItems = hasMore ? items.slice(0, limit) : items
    return {
      items: pageItems,
      next_before: hasMore ? pageItems[pageItems.length - 1].scannedAt?.toISOString() ?? null : null,
    }
  }

  async getPublicHistoryDigest(): Promise<{ count: number; last_updated_at: Date | null }> {
    return this.scanHistoryRepository.getPublicHistoryDigest()
  }
```

- [ ] **Step 3: PublicHistoryController を作成する**

`backend/src/history/public-history.controller.ts`:

```typescript
import { Controller, Get, Query } from '@nestjs/common'
import { Public } from '../auth/public.decorator'
import { HistoryService } from './history.service'
import { GetHistoryDto } from './dto/get-history.dto'

@Controller('public/history')
export class PublicHistoryController {
  constructor(private readonly historyService: HistoryService) {}

  /** GET /public/history: 認証不要のみんなの履歴一覧。 */
  @Public()
  @Get()
  async getPublicHistory(@Query() query: GetHistoryDto) {
    const before = query.before ? new Date(query.before) : undefined
    return this.historyService.getPublicHistory(query.limit ?? 20, before)
  }

  /** GET /public/history/digest: 軽量新着チェック（count + last_updated_at）。 */
  @Public()
  @Get('digest')
  async getPublicHistoryDigest() {
    return this.historyService.getPublicHistoryDigest()
  }
}
```

**注意:** `@Get('digest')` は `@Get(':id')` より前に定義すること（静的ルートを動的ルートより先に）。

- [ ] **Step 4: history.module.ts に PublicHistoryController を追加**

```typescript
controllers: [HistoryController, PublicHistoryController],
```

- [ ] **Step 5: テスト**

```bash
pnpm --filter backend test public-history
```

- [ ] **Step 6: コミット**

```bash
git add backend/src/history/
git commit -m "feat(history): add GET /public/history and GET /public/history/digest"
```

---

### Task 9: スキャンサービスに 3 秒クールダウン + DailyScanLimitGuard 適用

**Files:**
- Modify: `backend/src/scan/scan.service.ts`
- Modify: `backend/src/scan/scan.controller.ts`
- Modify: `backend/src/scan/scan.module.ts`

クールダウンは Lambda 再起動でリセットされるがそれでよい（短期 TTL のため）。

- [ ] **Step 1: scan.service.ts にクールダウンチェックを追加**

`backend/src/scan/scan.constants.ts` に追加:

```typescript
export const SCAN_COOLDOWN_MS = 3_000
```

`backend/src/scan/scan.service.ts` に追加:

```typescript
import { HttpException, HttpStatus } from '@nestjs/common'
import { SCAN_COOLDOWN_MS } from './scan.constants'
import { UserDailyScansService } from '../users/user-daily-scans.service'

// Lambda 再起動でリセットされる短期クールダウン用 Map（TTL: 3秒）
const lastScanTimestamps = new Map<string, number>()

// ScanService コンストラクタに UserDailyScansService を追加する
// constructor(..., private readonly userDailyScansService: UserDailyScansService) {}

  /** 3 秒クールダウンチェック。超過時は 429 を throw する。 */
  private checkCooldown(userId: string): void {
    const last = lastScanTimestamps.get(userId) ?? 0
    const elapsed = Date.now() - last
    if (elapsed < SCAN_COOLDOWN_MS) {
      throw new HttpException(
        {
          message: 'scan.error.cooldown',
          remaining_ms: SCAN_COOLDOWN_MS - elapsed,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    lastScanTimestamps.set(userId, Date.now())
  }
```

OCR・バーコード・Presigned URL 発行の各メソッドの冒頭で `this.checkCooldown(userId)` を呼ぶ。
OCR の場合は `not_food_label: false` の場合のみ `userDailyScansService.incrementScanCount(userId)` を呼ぶ。

- [ ] **Step 2: scan.controller.ts に DailyScanLimitGuard を適用**

```typescript
import { UseGuards } from '@nestjs/common'
import { DailyScanLimitGuard } from './daily-scan-limit.guard'

// POST /scan/barcode と POST /scan/ocr と GET /scan/presigned-url に適用
@UseGuards(DailyScanLimitGuard)
@Post('barcode')
async scanBarcode(...) { ... }

@UseGuards(DailyScanLimitGuard)
@Post('ocr')
async scanOcr(...) { ... }

@UseGuards(DailyScanLimitGuard)
@Get('presigned-url')
async getPresignedUrl(...) { ... }
```

- [ ] **Step 3: scan.module.ts に UsersModule を import**

```typescript
imports: [..., UsersModule],
```

- [ ] **Step 4: 型チェック + テスト**

```bash
pnpm --filter backend typecheck
pnpm --filter backend test scan
```

- [ ] **Step 5: コミット**

```bash
git add backend/src/scan/
git commit -m "feat(scan): add 3s cooldown check and DailyScanLimitGuard to scan endpoints"
```

---

### Task 10: Admin Seeder スクリプト

**Files:**
- Create: `backend/scripts/seed-admin.ts`

開発環境専用。Supabase Admin API でユーザー作成 → `app_metadata.role: 'admin'` 設定 → `users` テーブルに INSERT。

- [ ] **Step 1: seed-admin.ts を作成する**

```bash
pnpm add -D @supabase/supabase-js --filter backend
```

`backend/scripts/seed-admin.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import { PrismaClient } from '@prisma/client'

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@allergy-scan.dev'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD

  if (!supabaseUrl || !serviceRoleKey || !adminPassword) {
    throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_ADMIN_PASSWORD が必要です')
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const prisma = new PrismaClient()

  try {
    // Supabase Auth にユーザー作成
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      app_metadata: { role: 'admin' },
      email_confirm: true,
    })
    if (error) throw error

    const userId = data.user.id

    // users テーブルに INSERT（無料プランのサブスクも同時作成）
    const freePlan = await prisma.plan.findUniqueOrThrow({ where: { name: 'free' } })
    await prisma.$transaction([
      prisma.user.create({ data: { id: userId } }),
      prisma.userSubscription.create({
        data: { userId, planId: freePlan.id, status: 'active' },
      }),
    ])

    console.log(`✅ Admin ユーザー作成完了: ${adminEmail} (${userId})`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(err => {
  console.error('❌ seed-admin 失敗:', err)
  process.exit(1)
})
```

`backend/package.json` に追加:

```json
"scripts": {
  "seed:admin": "ts-node --project tsconfig.json scripts/seed-admin.ts"
}
```

- [ ] **Step 2: 実行方法確認（実際には開発環境の .env を設定してから実行）**

```bash
# 開発環境での実行例（.env に必要変数を設定済みの場合）
pnpm --filter backend seed:admin
```

- [ ] **Step 3: .gitignore に scripts の実行結果を追加しないよう確認**

`backend/scripts/seed-admin.ts` はコミットしてよい（ただし `.env` は絶対にコミットしない）

- [ ] **Step 4: コミット**

```bash
git add backend/scripts/seed-admin.ts backend/package.json
git commit -m "feat(dev): add seed-admin script for development admin user creation"
```

---

### Task 11: 全体テスト + 型チェック確認

- [ ] **Step 1: バックエンド全テスト**

```bash
pnpm --filter backend test
```

Expected: 全テストパス（失敗するテストは Task ごとに修正してからコミット）

- [ ] **Step 2: 型チェック**

```bash
pnpm --filter backend typecheck
```

Expected: エラーなし

- [ ] **Step 3: main.ts から cookie-parser 関連を削除**

Cookie ベース認証が不要になったため `main.ts` から以下を削除:

```typescript
// 削除する行
import * as cookieParser from 'cookie-parser'
app.use(cookieParser())
```

- [ ] **Step 4: 最終コミット**

```bash
git add backend/src/main.ts
git commit -m "chore(backend): remove cookie-parser (auth migrated to Supabase JWT)"
```

---

## 完了チェックリスト

- [ ] `pnpm --filter backend test` 全パス
- [ ] `pnpm --filter backend typecheck` エラーなし
- [ ] Prisma スキーマに plans / user_subscriptions / user_daily_scans / stripe_customers が追加された
- [ ] `SupabaseJwtGuard` がグローバルガードとして動作する
- [ ] `@Public()` でガードをスキップできる
- [ ] `AdminGuard` が `app_metadata.role !== 'admin'` で 403 を返す
- [ ] `DailyScanLimitGuard` が上限超過で 429 を返す
- [ ] `POST /users/me/init` が冪等に動作する（重複呼び出しで created: false）
- [ ] `GET /public/history` と `GET /public/history/digest` が認証なしで動作する
- [ ] スキャン 3 秒クールダウンが動作する
- [ ] バックアップコード関連ファイルが全て削除された

## 次のステップ

この Phase 1 完了後:
- **Phase 2** → `.claude/plans/pending/2026-06-05-frontend.md`（フロントエンド刷新）
- **Phase 3** → `.claude/plans/pending/2026-06-05-admin-subscription.md`（管理画面 + Stripe）
