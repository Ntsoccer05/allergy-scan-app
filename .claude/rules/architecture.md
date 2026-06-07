# アーキテクチャ層境界

## 技術スタック

- Frontend: Next.js (PWA) / TypeScript（pnpm workspace: `frontend/`）
- Backend: NestJS on AWS Lambda / TypeScript（pnpm workspace: `backend/`）
- DB: PostgreSQL（RDS t3.micro → PMF後に Aurora Serverless v2）
- OCR: Gemini Flash API
- バーコード: ZXing.js（端末完結・サーバー不要）
- 画像ストレージ: S3 Presigned URL
- 位置情報: Google Places API / Geocoding API

## ディレクトリ構成

```
/
├── frontend/   Next.js PWA
│   └── src/
│       ├── app/
│       │   ├── scan/
│       │   ├── history/
│       │   └── settings/
│       └── hooks/
│           ├── useCamera.ts
│           ├── useBarcode.ts
│           ├── useFrameCheck.ts
│           └── useScan.ts
└── backend/    NestJS
    └── src/
        ├── scan/
        ├── products/
        ├── history/
        ├── allergens/
        ├── users/
        └── gemini/
```

## 開発順序（バーティカルスライス）

1機能を DB→API→フロント まで貫通させてから次へ進む。

```
Week1: バーコードスキャン（DB→API→フロント）
Week2: OCRスキャン（DB→API→フロント）
Week3: 履歴機能（DB→API→フロント）
Week4: 設定・オンボーディング
```

## システム全体構成

```
[フロントエンド] Next.js PWA
    ↓ HTTPS API
[バックエンド] NestJS on AWS Lambda
    ↓
[データ層] RDS PostgreSQL / Aurora Serverless v2 (スケール後)
           + S3 (画像ストレージ)

[外部API]
    Gemini Flash API    OCR・アレルギー判定
    Open Food Facts     JANコード照合（無料）
    Google Places API   店舗名取得
```

## バックエンド層境界

```
HTTP リクエスト
    ↓
Controller  (HTTPハンドリング・バリデーション・レスポンス整形)
    ↓
Service     (ビジネスロジック・キャッシュ制御)
    ↓
Repository  (DB アクセスのみ)
外部APIクライアント  (HTTP通信のみ)
```

### 依存方向の絶対ルール

| 層 | 呼べる | 呼べない |
|---|---|---|
| Controller | Service のみ | Repository・外部APIクライアント直呼び |
| Service | Repository・外部APIクライアント | Controller |
| Repository | DB（Prisma/TypeORM） | Service・外部APIクライアント |
| 外部APIクライアント | HTTP ライブラリ | Service・Repository |

- ビジネスロジックは Service 層に集約。Controller に漏らさない
- DB クエリは Repository 層に集約。Service に SQL を書かない

## フロントエンド層境界

```
Page / Screen コンポーネント
    ↓ (データ取得・状態管理は Hook 経由)
Custom Hooks
    useScan          メインフック（状態統合・タップ撮影フロー）
    useCamera        カメラ制御
    useBarcode       バーコード検出（ZXing.js）
    useScanApi       API通信
    ↓
API クライアント関数（fetch ラッパー）
    ↓
UI コンポーネント（表示のみ・ロジックなし）
    CameraView / ScanGuide / ScanOverlay / ResultCard
```

### 依存方向の絶対ルール

- Page は Hook 経由でデータを取得する。直接 fetch しない
- UI コンポーネントはビジネスロジックを持たない（Props で受け取るだけ）
- Hook は単一責務に限定する（useCamera が API 通信しない等）

## APIエンドポイント一覧（フロント↔バック境界）

```
POST /users/me/init          Supabase JWT 初回ユーザー登録（Bearer Token 必須）
GET  /users/me               ユーザー設定取得（TTL: 5分キャッシュ）
PUT  /users/me               アレルギー設定更新
DELETE /users/me             ユーザーデータ削除
GET  /scan/presigned-url     S3 Presigned URL 発行
POST /scan/barcode           JANコード照合
POST /scan/ocr               OCR + アレルギー判定（日次スキャン上限チェック）
GET  /history                履歴一覧（カーソルページネーション）
POST /history                履歴保存
PATCH /history/:id           履歴編集（product_name / store_name / memo / is_public / thumbnail_url）
DELETE /history/:id          履歴削除
DELETE /history/bulk         履歴一括削除（ids: string[]・最大100件）
GET  /public/history         みんなのスキャン一覧（認証不要・カーソルページネーション）
GET  /public/history/digest  みんなのスキャン新着件数（ポーリング用・認証不要）
GET  /allergens              アレルギーマスター取得
GET  /admin/users            ユーザー一覧（admin 専用）
GET  /admin/stats            統計情報（admin 専用）
PATCH /admin/users/:id/plan  プラン手動変更（admin 専用）
POST /webhooks/stripe        Stripe Webhook 受信（@Public）
```

**認証方式（現行）**: Cookie ベース認証（`HttpOnly Cookie` の `COOKIE_NAME`）。`req.cookies?.[COOKIE_NAME]` で `userId` を取得。`/admin/*` は `AdminGuard` が Supabase Auth の `app_metadata.role === 'admin'` を追加チェック。`@Public()` デコレータで認証バイパス。

> ⚠️ Phase 1（pending）で Supabase Auth JWT Bearer Token に統一予定。移行後は `SupabaseJwtGuard` がグローバル適用され、フロントエンドは `apiFetch` 経由で `Authorization: Bearer <token>` を自動付与する。

フロントエンドは上記エンドポイントのみを使う。DB に直接アクセスしない。
スキーマ詳細 → `docs/design/api.md`

## キャッシュ層の責務分担

| 層 | TTL | 責務 |
|---|---|---|
| クライアントキャッシュ | 2 時間 | 同一セッション内の重複スキャン防止 |
| NestJS メモリキャッシュ | 60 秒 | 短期の重複リクエスト防止 |
| DB の `expires_at` | 30〜180 日 | 長期キャッシュ（scan_count 連動） |

キャッシュの追加・変更は必ずこの3層構造を維持する。TTL を勝手に変えない。

## DB テーブル間の依存方向

```
allergens（マスター）
    └─ category: 'mandatory' | 'recommended' | 'addiction' | 'skin'
    └─ judgment_type: 'allergy' | 'caution'  ※ Week4 実装予定・現在は category から導出
    └─ name (FK) → allergen_components.allergen_name

products
    └─ allergens (JSONB: contains[], partial[], components[])

scan_histories
    └─ product_id (FK) → products.id
    └─ user_id → users.id

users
    └─ allergies (JSONB キーは allergens.name と完全一致)
    └─ locale: VARCHAR（'ja' | 'en'）
    └─ subscriptions → user_subscriptions
    └─ dailyScans    → user_daily_scans
    └─ stripeCustomer → stripe_customers

plans
    └─ subscriptions → user_subscriptions

user_subscriptions
    └─ user_id (FK) → users.id
    └─ plan_id (FK) → plans.id

user_daily_scans
    └─ user_id (FK) → users.id

stripe_customers
    └─ user_id (FK) → users.id
```

SQL 定義・初期データ → `docs/design/database.md`
