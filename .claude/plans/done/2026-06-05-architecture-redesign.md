# アーキテクチャ再設計仕様

**作成日**: 2026-06-05  
**ステータス**: 承認済み・実装待ち

---

## 概要

アレルギースキャンアプリのアーキテクチャを刷新する。既存のビジネスロジック（アレルギー判定・OCRフロー・成分マスター）は流用しつつ、認証・インフラ・UXを根本から見直す。

### 主な変更点

| 項目 | 変更前 | 変更後 |
|---|---|---|
| 認証 | 匿名Cookie | メール/パスワード + Google OAuth（Supabase Auth） |
| DB | RDS PostgreSQL | Supabase（PostgreSQL・無料枠） |
| ストレージ | S3 | S3（継続）+ Supabase Auth のみ Supabase |
| スキャン方式 | 自動撮影（3フレーム連続OK） | タップ撮影（手動・プレビュー確認あり） |
| フロントエンド | コンポーネント混在 | Atomic Design + TanStack Query + shadcn/ui |
| OCRモデル | Gemini Flash | Gemini 3.1 Flash-Lite |
| スキャン制限 | なし | 無料プラン 20回/日・サブスク対応設計 |

---

## Section 1：システム全体アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│  Next.js PWA (Vercel)                                │
│  SP / Tablet / PC（内蔵カメラ対応）                   │
│  Atomic Design / TanStack Query / shadcn/ui          │
└───────────────┬─────────────────────────────────────┘
                │ HTTPS + Supabase JWT（Authorization ヘッダー）
                ▼
┌─────────────────────────────────────────────────────┐
│  NestJS on AWS Lambda（Tokyo リージョン）              │
│  ・全エンドポイント担当                               │
│  ・SupabaseJwtGuard（JWT検証ミドルウェア）            │
│  ・ThrottlerGuard（DDoS・レート制限）                 │
│  ・Controller → Service → Repository 層構造          │
│  ・Warmup関数（EventBridge 5分ごと・DB疎通兼用）      │
└───┬───────────────────┬───────────────────┬─────────┘
    │                   │                   │
    ▼                   ▼                   ▼
┌────────┐    ┌──────────────┐    ┌──────────────────┐
│Supabase│    │   AWS S3     │    │ Gemini 3.1       │
│DB      │    │scans/        │    │ Flash-Lite       │
│(Prisma)│    │thumbnails/   │    │ (OCR+判定)       │
└────────┘    └──────────────┘    └──────────────────┘
┌────────┐
│Supabase│
│Auth    │
│(JWT発行│
│のみ)   │
└────────┘
```

### 各層の責務

| 層 | 担当 |
|---|---|
| Next.js (Vercel) | UI・状態管理・カメラ制御 |
| NestJS Lambda | 全API・認証検証・レート制限 |
| Supabase DB | データ永続化（Prisma経由） |
| Supabase Auth | JWT発行・メール/Google認証（NestJSはJWT検証のみ） |
| AWS S3 | 画像保管（OCR原本・サムネイル） |
| Gemini 3.1 Flash-Lite | OCR + アレルギー判定 |

---

## Section 2：認証設計

### サインイン後のリダイレクト

```
サインイン成功
  → /scan にリダイレクト（デフォルト）
  → 未ログインでアクセスしようとしたページがある場合はそちらへ
     例: 未ログインで /history → /login?redirect=/history → ログイン後 /history

Next.js Middleware:
  未ログインで (app)/* にアクセス → /login?redirect=<元のURL>
```

### Supabase Auth が担当（NestJS不経由）

| 操作 | SDK メソッド | 備考 |
|---|---|---|
| サインアップ | `supabase.auth.signUp()` | メール確認リンク送信 |
| サインイン（メール） | `supabase.auth.signInWithPassword()` | |
| サインイン（Google） | `supabase.auth.signInWithOAuth({ provider: 'google' })` | |
| パスワードリセット | `supabase.auth.resetPasswordForEmail()` | 未ログイン時 |
| パスワード変更 | `supabase.auth.updateUser({ password })` | ログイン済み必須 |
| サインアウト | `supabase.auth.signOut()` | |

### GoogleログインユーザーのUI制御

```typescript
const isEmailProvider = user.identities?.some(i => i.provider === 'email')
// false → パスワード変更UI非表示
```

### NestJS が担当する認証関連

| エンドポイント | 内容 |
|---|---|
| `POST /users/me/init` | 初回ログイン後のユーザーレコード作成・無料プラン初期化 |
| `DELETE /users/me` | アカウント削除（DB + Supabase Admin API でAuth削除） |

フロントエンドはログイン直後に必ず `POST /users/me/init` を呼ぶ。

### 管理者ロール

Supabase の `app_metadata` に `role: 'admin'` を設定（サーバーサイドのみ書き込み可能）。

```typescript
// NestJS AdminGuard
const role = request.user.app_metadata?.role
if (role !== 'admin') throw new ForbiddenException()
```

二重防御：Next.js Middleware（非adminを/403へリダイレクト）+ NestJS AdminGuard。

### 画面ルーティング

```
未ログイン可: /public/history・/login・/signup・/reset-password
ログイン後:   /scan・/history・/settings・/public/history
管理者のみ:   /admin/*
```

### ガード構成

| エンドポイント群 | ガード |
|---|---|
| `GET /public/*` | `@Public()`（認証スキップ） |
| 一般エンドポイント | `SupabaseJwtGuard` |
| `/admin/*` | `SupabaseJwtGuard` + `AdminGuard` |
| `/webhooks/stripe` | Stripe署名検証（JWT不要） |

---

## Section 3：DBスキーマ

### テーブル関係

```
plans ──────────────── user_subscriptions
                              │
allergens ──┐             users ──── user_daily_scans
            │                 │
allergen_   │         scan_histories
components  │                 │
            │             products
            └─────────────────┘
            
stripe_customers ────── users
```

### plans（プランマスター）

```sql
CREATE TABLE plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(50) NOT NULL UNIQUE,  -- 'free' | 'premium'
  display_name      VARCHAR(100) NOT NULL,
  daily_scan_limit  INTEGER NOT NULL,             -- 20(無料) / 50(プレミアム想定)
  price_monthly_jpy INTEGER NOT NULL DEFAULT 0,
  price_yearly_jpy  INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- 初期データ
INSERT INTO plans VALUES
  (gen_random_uuid(), 'free',    '無料プラン',       20, 0,    0,    true),
  (gen_random_uuid(), 'premium', 'プレミアムプラン', 50, 980,  9800, true);
```

### user_subscriptions（ユーザー契約）

```sql
CREATE TABLE user_subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id                UUID NOT NULL REFERENCES plans(id),
  status                 VARCHAR(20) NOT NULL DEFAULT 'active',
  -- 'active'    : 有効（通常利用中）
  -- 'cancelled' : 解約申請済み・current_period_end まで有効（課金済み期間は使える）
  -- 'expired'   : current_period_end を過ぎて未更新・無料プランへダウングレード
  current_period_start   TIMESTAMP NOT NULL DEFAULT NOW(),
  current_period_end     TIMESTAMP,          -- NULL = 無期限（無料プラン）
  stripe_subscription_id VARCHAR(255),       -- NULL = Stripe未連携（MVP）
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);

CREATE INDEX user_subscriptions_user_idx ON user_subscriptions(user_id, status);
```

- 全ユーザーに必ず1件（初回ログイン時に無料プランでINSERT）
- 無料プラン: `current_period_end = NULL`（無期限）
- Stripe連携後の課金フロー: `invoice.payment_succeeded` → `current_period_end` 延長 / `invoice.payment_failed` → `status = 'expired'` → 無料プランへ

### stripe_customers（Stripe連携用・MVP時は空）

```sql
CREATE TABLE stripe_customers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id  VARCHAR(255) NOT NULL UNIQUE,
  created_at          TIMESTAMP DEFAULT NOW()
);
```

### users（アプリ固有ユーザー情報）

```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY,   -- Supabase Auth UUID をそのまま使用
  allergies   JSONB NOT NULL DEFAULT '{}',
  locale      VARCHAR(10) NOT NULL DEFAULT 'ja',
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);
```

### user_daily_scans（スキャン回数トラッキング）

```sql
CREATE TABLE user_daily_scans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scan_date   DATE NOT NULL,
  scan_count  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, scan_date)
);

CREATE INDEX user_daily_scans_user_date_idx ON user_daily_scans(user_id, scan_date);
```

OCR・バーコード・画像アップロードをすべてカウント。サムネイル変更・メモ・店舗名編集はカウント対象外。`not_food_label: true` の場合もカウントしない。

### scan_histories（既存からの変更点）

```sql
ALTER TABLE scan_histories
  ADD COLUMN thumbnail_url  TEXT,           -- 変更可能サムネイル（デフォルト=撮影画像）
  ADD COLUMN ocr_image_url  TEXT,           -- 撮影元画像（変更不可・原本）
  ADD COLUMN is_public      BOOLEAN NOT NULL DEFAULT true,  -- みんなの履歴公開フラグ
  ADD COLUMN memo           TEXT;           -- ユーザーメモ
-- store_name・location は既存カラムを流用
```

---

## Section 4：APIエンドポイント

```
【@Public() - 認証不要】
GET  /public/history              みんなの履歴一覧（カーソルページネーション）
GET  /public/history/digest       新着チェック用ダイジェスト { count, last_updated_at }

【SupabaseJwtGuard】
POST /users/me/init               初回ログイン後のユーザーレコード作成
GET  /users/me                    ユーザー設定取得（アレルギー設定・プラン情報）
PUT  /users/me                    アレルギー設定・locale更新
DELETE /users/me                  アカウント削除

GET  /scan/presigned-url          S3 Presigned PUT URL発行（スキャン回数カウント）
POST /scan/barcode                バーコードスキャン（スキャン回数カウント）
POST /scan/ocr                    OCR + アレルギー判定（スキャン回数カウント）

GET  /history                     自分の履歴一覧（カーソルページネーション）
POST /history                     履歴保存
PATCH /history/:id                部分更新（thumbnail_url / memo / is_public / store_name / location）
DELETE /history/:id               履歴削除

GET  /allergens                   アレルギーマスター取得

【SupabaseJwtGuard + AdminGuard】
GET  /admin/users                 ユーザー一覧
PATCH /admin/users/:id/plan       プラン手動変更
POST /admin/users/:id/ban         BAN処理
GET  /admin/scans                 全スキャン履歴
GET  /admin/stats                 統計情報

【Stripe署名検証】
POST /webhooks/stripe             Stripe Webhook
```

### DDoS・レート制限設計（多層防御）

```
Layer 1: AWS API Gateway     接続レベル遮断（Lambda起動前）
Layer 2: ThrottlerGuard      60秒/100リクエスト/IP（全エンドポイント）
Layer 3: JWT必須             アカウント作成のコストがDDoSバリアになる
Layer 4: DailyScanLimitGuard user_id単位・VPN迂回不可
Layer 5: スキャン間隔         3秒クールダウン/ユーザー（連打防止）
```

### スキャン上限チェックフロー

```
POST /scan/ocr
  → SupabaseJwtGuard（JWT検証）
  → ThrottlerGuard（60秒/100回）
  → 3秒クールダウンチェック（user_id単位）
  → DailyScanLimitGuard
      user_daily_scans で当日カウント確認
      plan の daily_scan_limit と比較
      超過 → 429 { message: 'scan.error.dailyLimitExceeded' }
  → Stage1: クライアント側プレチェック済み想定
  → Gemini OCR処理
  → not_food_label: true → 422返却・カウントしない
  → not_food_label: false → user_daily_scans UPSERT(+1)
```

---

## Section 5：フロントエンド設計

### ディレクトリ構成（Atomic Design）

```
frontend/src/
├── components/
│   ├── atoms/          Button / Badge / Skeleton / LoadingSpinner
│   ├── molecules/      JudgmentBadge / AllergenToggle / ScanLimitBadge / FormField
│   ├── organisms/      ScanCamera / ResultCard / HistoryCard / AllergenSettings / Navbar
│   └── templates/      AppLayout / AuthLayout / AdminLayout
├── app/
│   ├── (auth)/         login / signup / reset-password
│   ├── (app)/          scan / history / settings
│   ├── public/history/ みんなの履歴（未ログインOK）
│   └── admin/          users / scans / stats
├── hooks/
│   ├── useCamera.ts    カメラ制御・getUserMedia・前後切り替え
│   ├── useBarcode.ts   ZXing.js
│   ├── useScan.ts      スキャン状態管理
│   ├── useHistory.ts
│   └── useAuth.ts      Supabase Auth連携
└── lib/
    ├── api/            NestJS APIクライアント
    ├── supabase/       Supabaseクライアント・Auth
    └── queryClient.ts  TanStack Query設定
```

### TanStack Query 使い分け

| Hook | 用途 |
|---|---|
| `useQuery` | 設定取得・アレルギーマスター |
| `useInfiniteQuery` | 履歴一覧・みんなの履歴（カーソルページネーション） |
| `useMutation` | スキャン・履歴保存・設定更新 |

```typescript
// みんなの履歴（自動更新なし・バナー通知方式）
useInfiniteQuery({
  queryKey: ['public-history'],
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
})

// 新着チェック（軽量ポーリング）
useQuery({
  queryKey: ['public-history-digest'],
  queryFn: () => api.getPublicHistoryDigest(),
  refetchInterval: 60 * 1000,
  staleTime: Infinity,
})
// count または last_updated_at が変化 → バナー表示
// 削除・編集・追加すべて検知可能
```

### 統一ローディングコンポーネント

```tsx
// atoms/LoadingOverlay - 全画面統一
<LoadingOverlay isOpen={isPending} message={t('common.loading')} />
// 個別コンポーネントに独自ローディングを書かない
```

### レスポンシブ設計

| デバイス | ナビゲーション | スキャンレイアウト | 履歴レイアウト |
|---|---|---|---|
| SP（〜640px） | ボトムナビ | 全画面カメラ | 1カラム |
| Tablet（640〜1024px） | 上部 or サイド | カメラ + 結果 2カラム | 2カラムグリッド |
| PC（1024px〜） | 左サイドナビ | カメラ中央 + 結果パネル | 3カラムグリッド |

### スキャンUX（タップ撮影）

**スキャンフロー（モード区別なし・タップ統一）:**
```
カメラ起動（SP/Tablet: 背面カメラ優先 / PC: 内蔵カメラ）
  ↓
ファインダー表示
  ├── SP/Tablet: 前後カメラ切り替えボタン表示
  ├── PC: 切り替えボタン非表示
  └── ガイド: 「バーコードまたは原材料ラベルを撮影してください」
  ↓
[撮影ボタンをタップ]（クールダウン中はカウントダウン表示・無効化）
  ↓
ZXing が静止画を解析（~50ms・LoadingOverlay 表示前）
  │
  ├── バーコード検出
  │     ↓ /scan/barcode API へ送信（~200ms）
  │     └── 結果表示
  │
  └── バーコード未検出
        ↓ クライアント側プレチェック（brightness / sharpness / textRegion）
        ├── NG → 「ラベルが読み取れません」 → 再撮影
        └── OK →
            プレビュー表示
              ├── [撮り直す] → ファインダーへ戻る
              └── [この画像を使う]
                  ↓ 前処理（EXIF回転補正 → リサイズ1920px → JPEG 85%圧縮）
                  ↓ S3 Presigned PUT URL 取得・アップロード
                  ↓ LoadingOverlay 表示
                  ↓ OCR + 判定結果表示

リアルタイムバーコード検出なし・ユーザーはバーコード/OCRの区別を意識しない
ZXing.js は複数向き（縦・横・斜め）を自動試行するため向きは問わない
```

**3秒クールダウンUX:**
```
撮影直後 → ボタンが [⏳ 2秒] [⏳ 1秒] とカウントダウン表示
クールダウン中 → タップ無効（disabled）
上限達成時 → [本日の上限（20/20）に達しました]（灰色・無効）
```

**画像前処理（共通・クライアント側）:**
1. EXIF 自動回転補正（モバイル撮影の向き統一・Gemini に正立状態で送るため必須）
2. リサイズ（最大 1920×1920px）
3. JPEG 85% 圧縮
4. 色調補正・グレースケール変換・二値化は行わない（Gemini は自然色画像で最高性能）

自動撮影なし・プレビュー確認あり・やり直し可能。

---

## Section 6：画像ストレージ設計（S3）

### フォルダ構成

```
s3://allergy-scan-app/
├── scans/
│   └── {user_id}/{YYYY-MM}/{uuid}.jpg     # OCR用撮影画像（原本）
└── thumbnails/
    └── {user_id}/{history_id}.jpg          # サムネイル（固定キー・上書き方式）
```

### 圧縮設定（クライアント側・アップロード前）

| 対象 | 最大解像度 | 品質 | 想定サイズ |
|---|---|---|---|
| OCR撮影画像（`scans/`） | 1920×1920px | JPEG 85% | ~200〜350KB |
| サムネイル（`thumbnails/`） | 600×600px | JPEG 80% | ~40〜80KB |

### Presigned URL 有効期限

| 用途 | 有効期限 |
|---|---|
| 自分の履歴画像（GET） | 1時間 |
| みんなの履歴サムネイル（GET） | 24時間 |
| OCRアップロード（PUT） | 5分 |

### サムネイル変更

`thumbnails/{user_id}/{history_id}.jpg` を固定キーとして同一キーに上書きPUT。旧ファイルはS3が自動的に完全置き換え。明示的なDELETEは不要。

### Lifecycleポリシー

MVPでは適用なし（全てS3 Standard）。コストが顕在化した段階で `scans/` のみIA移行を検討（AWS設定のみで完結・コード変更なし）。

### 開発用 Admin Seeder

```typescript
// scripts/seed-admin.ts（開発環境専用）
const { data } = await supabaseAdmin.auth.admin.createUser({
  email: 'admin@allergy-scan.dev',
  password: process.env.SEED_ADMIN_PASSWORD,
  app_metadata: { role: 'admin' },
  email_confirm: true,   // メール確認スキップ
})
await prisma.users.create({ data: { id: data.user.id } })
// SEED_ADMIN_PASSWORD は .env.local で管理・本番環境に含めない
```

### バケットセキュリティ

- パブリックアクセス完全ブロック
- NestJS の IAM ロールのみ PUT/GET/DELETE 許可
- Lambda 以外からの直接アクセス禁止

---

## Section 7：インフラ・コスト

### 構成（確定版）

| サービス | 用途 | 月額（MVP） |
|---|---|---|
| Supabase 無料枠 | DB + Auth | $0 |
| AWS S3 | OCR画像・サムネイル | ~$1 |
| AWS Lambda | NestJS 全API | $0（無料枠内） |
| AWS EventBridge | Warmup cron（5分ごと） | $0 |
| Vercel | Next.js フロントエンド | $0 |
| Gemini 3.1 Flash-Lite | OCR + アレルギー判定 | ~$1 |
| **合計** | | **~$2/月** |

### Supabase アップグレード基準

- DB 400MB 超
- MAU 40,000 超
- パフォーマンス不足
→ Pro（$25/月）へ移行

---

## Section 8：review-checklist.md 組み込み

`docs/review-checklist.md` をこのプロジェクト専用に更新し、以下のスキルから参照する。

- `verification-before-completion`：完了主張・コミット・PR作成前に必ず実行
- `requesting-code-review`：レビュー依頼前の最終確認

### 追加チェック項目（プロジェクト固有）

**#27 OCR安全設計**
- `confidence: low` の場合に判定結果を返していないか
- `incomplete: true` の場合に即エラー返却しているか
- `judgment === '判定不能'` を「なし」として扱っていないか
- スキャン結果画面に免責UI（「購入前にラベルの実物も確認ください」）が常時表示されているか

**#28 i18n**
- UIテキストがコンポーネントにハードコードされていないか（`t('キー名')` 経由を徹底）
- ja/en 両方の locales ファイルにキーが存在するか

**#29 スキャン回数制限**
- OCR・バーコード・画像アップロード後に `user_daily_scans` が +1 されているか
- `not_food_label: true` の場合はカウントしていないか
- サムネイル変更・メモ・店舗名編集はカウント対象外か確認

**#30 認証・認可**
- 管理者エンドポイントに `AdminGuard` が漏れなく適用されているか
- `@Public()` デコレータが `/public/*` 以外に使われていないか
- Supabase JWT の検証をスキップしている箇所がないか

**#31 Atomic Design 遵守**
- atoms がビジネスロジックを持っていないか
- organisms が直接 API 呼び出しをしていないか（Hook 経由を徹底）
- templates がデータ取得をしていないか（Pages に委譲）

**#32 画像・ストレージ**
- OCR画像は `scans/{user_id}/{YYYY-MM}/` に保存されているか
- サムネイルは `thumbnails/{user_id}/{history_id}.jpg` の固定キーか
- サムネイル変更時に同一キーで上書きしているか
- Presigned URL の有効期限が用途別に正しく設定されているか

---

## 更新が必要なドキュメント（実装完了後）

| ドキュメント | 更新内容 |
|---|---|
| `docs/design/api.md` | 全エンドポイント刷新・認証方式変更 |
| `docs/design/database.md` | plans / user_subscriptions / user_daily_scans / stripe_customers 追加 |
| `docs/design/screens.md` | Atomic Design構成・レスポンシブ設計・スキャンUX刷新 |
| `.claude/rules/architecture.md` | Supabase Auth・NestJS層構造更新 |
| `.claude/rules/implementation_rules.md` | スキャン制限・DailyScanLimitGuard追加 |
| `CLAUDE.md` | APIエンドポイント一覧・技術スタック更新 |
| `docs/review-checklist.md` | プロジェクト専用版に更新（#10削除・#27〜#32追加） |
