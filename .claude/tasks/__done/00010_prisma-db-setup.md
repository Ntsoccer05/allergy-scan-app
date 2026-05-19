# Task 00010: Prisma DB Setup

| Field | Value |
|-------|-------|
| Status | completed |
| Created | 2026-05-15 |
| Completed | 2026-05-15 |

---

## Background

`backend/` は NestJS 11 + TypeScript strict のスキャフォルドのみ存在し、DB 接続・ORM・スキーマ・シードスクリプトがすべて未実装。`backend/src/app.module.ts` には AppModule の骨格のみある。`backend/package.json` には Prisma 関連パッケージは含まれていない。開発時 DB は Docker Compose で PostgreSQL を起動する想定だが `docker-compose.yml` も未作成。後続タスク 00020（`POST /scan/barcode` 実装）が本タスクのスキーマ・Prisma Client に依存する。

---

## Requirements

- R1: `backend/` に Prisma ORM を追加し、PostgreSQL 接続設定（`.env` 参照の `DATABASE_URL`）を持つ `backend/prisma/schema.prisma` を作成する
- R2: `docs/design/database.md` に記載された以下 5 テーブルの Prisma スキーマを定義する: `allergens`, `allergen_components`, `products`, `scan_histories`, `users`
- R3: `database.md` に記載された必須インデックス（GIN インデックス含む）を `schema.prisma` 内で表現する。GIN インデックスのように Prisma が直接表現できないものは `prisma/migrations/` の SQL または `prisma/schema.prisma` の `@@index` に `raw` で定義する
- R4: `docs/design/database.md` の初期データ（allergens 29品目・allergen_components 主要アレルゲン分）を投入する `backend/prisma/seed.ts` を作成する
- R5: 開発環境の PostgreSQL を起動するための `docker-compose.yml` をリポジトリルートに作成する（ポート 5432、DB 名 `allergy_scan`、ユーザー `postgres`、パスワードは `.env` 参照）
- R6: `backend/package.json` の `scripts` に `db:migrate`（`prisma migrate dev`）と `db:seed`（`prisma db seed`）を追加する
- R7: `backend/src/prisma/` に `PrismaService`（`PrismaClient` を NestJS DI で扱うサービス）と `PrismaModule`（グローバルモジュール）を実装する
- R8: `AppModule` に `PrismaModule` をインポートする

---

## Implementation plan

### Phase 1: Docker Compose + 環境変数ひな型
- リポジトリルートに `docker-compose.yml` を作成（`postgres:16-alpine` イメージ）
- `backend/.env.example` に `DATABASE_URL` のひな型を作成（実値は `.env` に置く。`.gitignore` に追加）

### Phase 2: Prisma インストール + 初期設定
- `pnpm --filter backend add @prisma/client` と `pnpm --filter backend add -D prisma` を実行（generator が実行する）
- `backend/prisma/schema.prisma` を作成（datasource / generator / 全モデル定義）

### Phase 3: スキーマ定義
- `allergens`, `allergen_components`, `products`, `scan_histories`, `users` の Prisma モデルを `database.md` に従って定義
- `products.allergens` / `scan_histories.location` / `users.allergies` は Prisma の `Json` 型で定義し、型安全のためアプリ層で型アサーション用の TypeScript 型を `backend/src/shared/types/` に置く
- `allergen_components.allergen_name` の外部キー（`allergens.name` 参照）を `@@relation` で定義
- Prisma が直接サポートしない GIN インデックス（`products.allergens`）は `prisma migrate dev` 後の migration SQL を手動編集して `USING GIN` を付与する方針を `Implementation summary` に記録する（TBD: generator 確認）

### Phase 4: PrismaService / PrismaModule
- `backend/src/prisma/prisma.service.ts`: `PrismaClient` を継承し `onModuleInit` で `$connect`、`onModuleDestroy` で `$disconnect`
- `backend/src/prisma/prisma.module.ts`: `@Global()` でグローバルモジュールとして登録
- `AppModule` に import 追加

### Phase 5: シードスクリプト
- `backend/prisma/seed.ts` に allergens 29品目・allergen_components（乳・卵・小麦・落花生・えび・かに）の初期データを記述
- `database.md` の INSERT 文と完全一致するデータを使用（id は `gen_random_uuid()` 相当の `createId()` または Prisma の `cuid()` で生成）
- `package.json` の `prisma.seed` エントリに `ts-node prisma/seed.ts` を登録

---

## Files to modify

| File | Action |
|------|--------|
| `docker-compose.yml`（新規） | PostgreSQL 16 コンテナ定義 |
| `backend/.env.example`（新規） | DATABASE_URL ひな型 |
| `backend/.gitignore`（新規 or 追記） | `.env` を追加 |
| `backend/prisma/schema.prisma`（新規） | Prisma スキーマ全モデル |
| `backend/prisma/seed.ts`（新規） | シードスクリプト |
| `backend/src/prisma/prisma.service.ts`（新規） | PrismaService |
| `backend/src/prisma/prisma.module.ts`（新規） | PrismaModule（グローバル） |
| `backend/src/app.module.ts`（編集） | PrismaModule をインポート |
| `backend/package.json`（編集） | db:migrate / db:seed スクリプト追加・prisma.seed 登録 |
| `backend/src/shared/types/db.types.ts`（新規） | JSONB フィールドの TypeScript 型定義 |

---

## Tests to add

本タスクは ORM セットアップとスキーマ定義が中心のため、テストは以下に限定する:

- `backend/src/prisma/prisma.service.spec.ts`: `PrismaService` が `onModuleInit` で `$connect` を呼び出すことを単体テストする（実 DB 不要。`PrismaClient.$connect` をモックする）

---

## Completion criteria

- [ ] `backend/prisma/schema.prisma` に `allergens`, `allergen_components`, `products`, `scan_histories`, `users` の 5 モデルが定義されており、`grep -c "^model " backend/prisma/schema.prisma` の結果が `5` である
- [ ] `allergen_components` モデルに `allergen_name` フィールドが存在し、`allergens` モデルの `name` を参照する Relation が定義されている（`grep "allergen_name" backend/prisma/schema.prisma` でヒット）
- [ ] `products` モデルに `id_type`, `id_value` の複合ユニーク制約が定義されている（`grep "@@unique" backend/prisma/schema.prisma` でヒット）
- [ ] `backend/src/shared/types/db.types.ts` に `ProductAllergens`, `ScanHistoryLocation`, `UserAllergies` の 3 型が export されており、`as any` を含まない（`grep -r "as any" backend/src/shared/types/` でヒット件数 0）
- [ ] `backend/src/prisma/prisma.service.ts` が存在し、`PrismaService` クラスが `PrismaClient` を継承し `onModuleInit` / `onModuleDestroy` を実装している（`grep "onModuleInit" backend/src/prisma/prisma.service.ts` でヒット）
- [ ] `backend/src/prisma/prisma.module.ts` が `@Global()` デコレータを持ち `PrismaService` を `exports` している（`grep "@Global" backend/src/prisma/prisma.module.ts` でヒット）
- [ ] `backend/src/app.module.ts` が `PrismaModule` をインポートしている（`grep "PrismaModule" backend/src/app.module.ts` でヒット）
- [ ] `docker-compose.yml` が存在し `postgres` サービスを定義している（`grep "postgres" docker-compose.yml` でヒット）
- [ ] `backend/prisma/seed.ts` が allergens テーブルへの 29 件の INSERT に相当するデータ配列を含む（`grep -c "display_order" backend/prisma/seed.ts` の結果が 29 以上）
- [ ] `backend/src/prisma/prisma.service.spec.ts` が存在し、`pnpm --filter backend test` で PASS する（unit テスト 1 件以上 PASS、FAIL 0 件）
- [ ] `pnpm --filter backend typecheck` がエラー 0 件で終了する
- [ ] `console.log` が新規追加ファイルに含まれない（`grep -r "console\.log" backend/src/prisma/ backend/prisma/seed.ts` でヒット件数 0）

---

## Risks

| リスク | 回避方針 |
|--------|----------|
| Prisma の GIN インデックス非サポート | `prisma migrate dev` 生成の migration SQL を手動編集して `USING GIN` を付与する。`@@index` の `type: Brin` 等は使わず raw SQL で対応 |
| `products.allergens` JSONB の型安全 | `db.types.ts` で型定義し、Repository 層でのみ型アサーションを行う。アンチパターン #14 参照 |
| seed の UUID 生成 | Prisma の `@default(uuid())` を使用し、seed スクリプトでは `prisma.$executeRaw` or `prismaClient.allergen.createMany` で投入する。`gen_random_uuid()` は PostgreSQL 固有のためシード側では使わない |
| `allergen_components.allergen_name` FK の参照先が `allergens.id` でなく `allergens.name` である設計 | `database.md` の設計に従い `@@unique([name])` を allergens に定義し `allergen_name` から参照する |

---

## Implementation summary

### Phase 1: Docker Compose + 環境変数ひな型
- `docker-compose.yml`（リポジトリルート）: `postgres:16-alpine` イメージ、ポート 5432、DB 名 `allergy_scan`、ユーザー `postgres` で作成。パスワードは `${POSTGRES_PASSWORD:-postgres}` で .env 参照
- `backend/.env.example`: `DATABASE_URL` のひな型を作成
- `backend/.gitignore`: `.env` と `dist/`、`node_modules/` を追加

### Phase 2: Prisma インストール
- `@prisma/client@6.19.3` と `prisma@6.19.3` を backend に追加（Node.js 20.18 対応のため v6 を採用。v7 は Node 20.19+ 必須）
- `pnpm --filter backend add @prisma/client@6`
- `pnpm --filter backend add -D prisma@6 --ignore-scripts`（Node.js バージョン制約のため preinstall スクリプトをスキップ）

### Phase 3: スキーマ定義（`backend/prisma/schema.prisma`）
- `Allergen`、`AllergenComponent`、`Product`、`ScanHistory`、`User` の 5 モデルを定義（L1-L90）
- `AllergenComponent.allergenName` は `Allergen.name` を参照する非標準 FK（`allergens.id` ではなく `name`）
- `Product` に `@@unique([idType, idValue])` を定義（L59）
- GIN インデックス（`products.allergens`）は Prisma 非サポートのため migration SQL 手動編集が必要:
  - `CREATE INDEX products_allergens_idx ON products USING GIN (allergens);`
- `scan_histories_store_idx` は `location` JSONB 内の `store_name` への JSONB パスインデックスのため Prisma 非サポート。migration SQL 手動編集が必要:
  - `CREATE INDEX scan_histories_store_idx ON scan_histories((location->>'store_name'), scanned_at DESC);`
- `prisma generate` で Prisma Client を生成済み

### Phase 4: PrismaService / PrismaModule
- `backend/src/prisma/prisma.service.ts`（L1-13）: `PrismaClient` 継承、`onModuleInit` で `$connect`、`onModuleDestroy` で `$disconnect`
- `backend/src/prisma/prisma.module.ts`（L1-9）: `@Global()` デコレータ付き、`PrismaService` を exports
- `backend/src/app.module.ts`（L4, L8）: `PrismaModule` をインポート

### Phase 5: シードスクリプト（`backend/prisma/seed.ts`）
- allergens 29品目・allergen_components（乳・卵・小麦・落花生・えび・かに、計 49件）のデータを upsert 形式で投入
- プロパティ名はスネークケース（`display_order`、`allergen_name` 等）で定義し、Prisma API 呼び出し時に camelCase に変換
- `backend/package.json` の `prisma.seed` に `ts-node prisma/seed.ts` を登録
- `db:migrate`（`prisma migrate dev`）と `db:seed`（`prisma db seed`）スクリプトを追加

### 起動手順
```bash
# PostgreSQL 起動
docker-compose up -d

# .env 作成
cp backend/.env.example backend/.env

# マイグレーション実行（初回）
pnpm --filter backend db:migrate

# シード投入
pnpm --filter backend db:seed

# バックエンド起動
pnpm --filter backend start:dev
```
URL: http://localhost:3000

### 検証結果
- typecheck: PASS (0 errors)
- unit test: PASS (4 tests in 2 suites)

---

## Plan deviation

### 1. Prisma バージョン v6 採用（v7 の予定から変更）
- タスクファイルは最新 Prisma を想定していたが、Node.js 20.18.0 環境では Prisma 7.x（Node 20.19+ 必須）が動作しない
- v6.19.3 に変更。API 互換性は維持されており、将来の v7 移行も容易

### 2. scan_histories_store_idx の Prisma 表現変更
- `database.md` は `scan_histories(store_name, scanned_at DESC)` のインデックスを定義しているが、`scan_histories` テーブルに `store_name` カラムは存在せず（`location` JSONB 内のフィールド）
- Prisma の `@@index` では JSONB パスインデックスを表現できないため、スキーマコメントに手動 SQL を記載。`scan_histories_user_idx` のみ `@@index` で定義

### 3. prisma preinstall スクリプトのスキップ
- Node.js バージョン制約エラーを避けるため `--ignore-scripts` オプションを使用
- `prisma generate` は手動実行で Prisma Client を生成済み

---

## Review comments

## 自動評価（2026-05-15 00:00） - ラウンド 1

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 1 / Info: 2）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 12/12 通過、typecheck 0件、unit 4件 PASS / FAIL 0件）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（PrismaService の公開メソッド全件テスト済み。db.types.ts / prisma.module.ts はロジックなし）
- 4. 敵対的観点: ✅（Critical/High 0件）
- 5. 保守性: ✅（層違反 0 / アンチパターン再導入 0 / マジックナンバー 0 / 冗長コメント 0）

### Completion criteria 個別判定

| # | 検証コマンド / 観点 | 結果 |
|---|---|---|
| 1 | `grep -c "^model " backend/prisma/schema.prisma` → 5 | PASS |
| 2 | `grep "allergen_name" backend/prisma/schema.prisma` でヒット（allergenName フィールド + Relation 定義） | PASS |
| 3 | `grep "@@unique" backend/prisma/schema.prisma` → `@@unique([idType, idValue])` | PASS |
| 4 | `ProductAllergens` / `ScanHistoryLocation` / `UserAllergies` 3型 export 確認、`as any` 0件 | PASS |
| 5 | `grep "onModuleInit" backend/src/prisma/prisma.service.ts` でヒット | PASS |
| 6 | `grep "@Global" backend/src/prisma/prisma.module.ts` でヒット | PASS |
| 7 | `grep "PrismaModule" backend/src/app.module.ts` でヒット（import + imports[] 両方） | PASS |
| 8 | `grep "postgres" docker-compose.yml` でヒット（サービス定義・イメージ・ユーザー確認） | PASS |
| 9 | `grep -c "display_order:" backend/prisma/seed.ts` → 30（型定義1行含む。allergens 実データ29行確認済み） | PASS |
| 10 | `pnpm --filter backend test` → Tests: 4 passed, 4 total | PASS |
| 11 | `pnpm --filter backend typecheck` → エラー 0件 | PASS |
| 12 | `grep -rn "console\.log" backend/src/prisma/ backend/prisma/seed.ts` → 0件 | PASS |

### 改善提案（PASS / 次タスク繰越し可）

- [Adversarial / Low] `backend/prisma/seed.ts` の `allergen_components` 部分が `findFirst + update` の 2ステップになっている（`prisma/seed.ts` L135-161）。`allergen_components` に `(allergenName, component)` の複合ユニーク制約がないため Prisma の `upsert` が使えない状況は理解できる。シードスクリプトは単一プロセス実行であり競合は発生しないが、将来 `@@unique([allergenName, component])` を追加して `upsert` に統一すると保守性が向上する（`ON CONFLICT` を担保できる）。

- [Maintainability / Info] `database.md` に `CREATE INDEX scan_histories_store_idx ON scan_histories(store_name, scanned_at DESC)` と記載されているが、`scan_histories` テーブルに `store_name` 独立カラムは存在せず `location` JSONB 内のフィールドである。Generator は `Plan deviation` に JSONB パスインデックスによる手動SQL対応を記録している（対応方針は適切）。`database.md` 自体の記述も将来修正することを推奨（`(location->>'store_name')` に更新）。

- [Maintainability / Info] `backend/.env.example` に `POSTGRES_PASSWORD=postgres` が平文で記載されている。`.env.example` はリポジトリに含まれるドキュメントとして許容範囲だが、コメントで「開発用デフォルト値。本番では必ず変更すること」と明記することを推奨。
