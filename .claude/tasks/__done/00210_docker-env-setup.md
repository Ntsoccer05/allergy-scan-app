# 00210 Docker / env.example セットアップ

## Metadata

| Key | Value |
|---|---|
| ID | 00210 |
| Title | Docker イメージビルド設定と .env.example 整備 |
| Status | completed |
| Priority | high |
| Created | 2026-05-20 |
| Depends on | 00010_prisma-db-setup（docker-compose.yml・backend/.env.example の既存実装） |

---

## Background

既存ファイルの現状:

- `docker-compose.yml`（リポジトリルート）: `postgres` サービスのみ定義済み。`frontend` / `backend` サービスが未定義。
- `backend/.env.example`: `DATABASE_URL`・`AWS_REGION`・`S3_BUCKET_NAME`（要求は `AWS_S3_BUCKET`）・`GEMINI_API_KEY` が存在。`GOOGLE_PLACES_API_KEY`・`PLACES_PROVIDER`・`COOKIE_SECRET`・`APP_ENV` が未定義。`S3_BUCKET_NAME` は `AWS_S3_BUCKET` に統一する必要がある（`00190_places-strategy-pattern.md` で `PLACES_PROVIDER` が追加されているが `.env.example` に反映されていない）。
- `frontend/.env.example`: 存在しない（新規作成）。
- `frontend/Dockerfile`: 存在しない（新規作成）。
- `backend/Dockerfile`: 存在しない（新規作成）。

本タスクは静的ファイル（設定ファイル）のみを対象とし、typecheck / unit テストの追加は不要。

---

## Requirements

- R1: `frontend/.env.example` を新規作成し、`NEXT_PUBLIC_API_URL` と `NEXT_PUBLIC_APP_ENV` のキーをプレースホルダー値とともに定義する。実際の API キー・パスワード値を含めない。
- R2: `frontend/Dockerfile` を新規作成する。マルチステージビルド（`builder` → `runner` ステージ）、Node 20-alpine ベース、`pnpm` 使用、`NEXT_STANDALONE` 出力モード（`next.config.js` の `output: 'standalone'` 前提）に対応する。
- R3: `backend/.env.example` を更新する。既存キーを維持しつつ、不足キー（`GOOGLE_PLACES_API_KEY`、`PLACES_PROVIDER`、`COOKIE_SECRET`、`APP_ENV`）を追加する。`S3_BUCKET_NAME` を `AWS_S3_BUCKET` に統一する。実際の API キー・パスワード値を含めない。
- R4: `backend/Dockerfile` を新規作成する。Lambda コンテナデプロイ用（`public.ecr.aws/lambda/nodejs:20` ベース）、`pnpm` 使用。NestJS ビルド成果物（`dist/`）と `node_modules`（本番依存のみ）を含む。
- R5: `docker-compose.yml`（リポジトリルート）を更新する。既存の `postgres` サービスを維持した上で `frontend` サービスと `backend` サービスを追加する。`backend` は `db`（postgres サービス）に `depends_on` する。`db` サービスには `POSTGRES_USER`・`POSTGRES_PASSWORD`・`POSTGRES_DB` を定義し、`volumes` でデータを永続化する。

---

## Implementation plan

### Phase 1: frontend 静的ファイル作成

- `frontend/.env.example` 作成（R1）
  - `NEXT_PUBLIC_API_URL=http://localhost:3001`（開発用プレースホルダー）
  - `NEXT_PUBLIC_APP_ENV=development`
- `frontend/Dockerfile` 作成（R2）
  - `builder` ステージ: `node:20-alpine` ベース、`pnpm` インストール、`pnpm install --frozen-lockfile`、`pnpm build`
  - `runner` ステージ: `node:20-alpine` ベース、standalone 出力（`.next/standalone`・`.next/static`・`public/`）のみコピー、`node server.js` で起動
  - `NEXT_TELEMETRY_DISABLED=1` を ENV に設定
  - 非 root ユーザー（`nextjs`）で実行

### Phase 2: backend 静的ファイル更新・作成

- `backend/.env.example` 更新（R3）
  - 既存キー: `DATABASE_URL`・`AWS_REGION`・`GEMINI_API_KEY` を保持
  - `S3_BUCKET_NAME` → `AWS_S3_BUCKET` に変更
  - 追加: `GOOGLE_PLACES_API_KEY=your-google-places-api-key`
  - 追加: `PLACES_PROVIDER=hybrid`（デフォルト値をコメントで明記）
  - 追加: `COOKIE_SECRET=your-cookie-secret-32chars-minimum`
  - 追加: `APP_ENV=development`
  - 既存の `AWS_ACCESS_KEY_ID`・`AWS_SECRET_ACCESS_KEY` は Lambda 実行ロール（IAM Role）で付与するため、コメントで「EC2/Lambda 実行環境では不要（IAM Role で付与）。ローカル開発時のみ設定」と注記する
- `backend/Dockerfile` 作成（R4）
  - `public.ecr.aws/lambda/nodejs:20` ベース（シングルステージ）
  - `pnpm` インストール（`npm install -g pnpm`）
  - `pnpm install --frozen-lockfile --prod=false`（ビルドに devDependencies が必要なため）
  - `pnpm build`（NestJS の `nest build`）
  - 本番依存のみ再インストール（`pnpm install --frozen-lockfile --prod`）
  - `dist/` と `node_modules/` を Lambda ハンドラーとして配置
  - `CMD ["dist/lambda.handler"]`（TBD: generator が `src/lambda.ts` のハンドラーパスを確認すること）

### Phase 3: docker-compose.yml 更新

- `docker-compose.yml` 更新（R5）
  - 既存 `postgres` サービスを `db` にリネームして機能を維持（`POSTGRES_USER`・`POSTGRES_PASSWORD`・`POSTGRES_DB`・`volumes` 定義を整備）
  - `frontend` サービス追加: `build: ./frontend`、ポート `3000:3000`、`env_file: ./frontend/.env`（`.env.example` をコピーして使用）
  - `backend` サービス追加: `build: ./backend`、ポート `3001:3001`（ローカル開発時は Lambda エミュレーターとして動作させる想定）、`env_file: ./backend/.env`、`depends_on: db`
  - `volumes` セクションに `postgres_data` を維持

---

## Files to modify

| ファイル | 操作 | 備考 |
|---|---|---|
| `frontend/.env.example` | 新規作成 | R1 |
| `frontend/Dockerfile` | 新規作成 | R2 |
| `backend/.env.example` | 更新（上書き） | R3: `S3_BUCKET_NAME` → `AWS_S3_BUCKET` に変更、不足キー追加 |
| `backend/Dockerfile` | 新規作成 | R4 |
| `docker-compose.yml` | 更新（上書き） | R5: frontend/backend サービス追加、postgres → db リネーム |

---

## Tests to add

静的ファイルのみのタスクのため unit テスト・typecheck の追加は不要。Completion criteria のファイル存在確認と `grep` による検証で代替する。

---

## Completion criteria

- [ ] `frontend/.env.example` が存在する（`test -f frontend/.env.example` または同等の確認で Pass）
- [ ] `frontend/.env.example` に `NEXT_PUBLIC_API_URL` キーが含まれる（`grep "NEXT_PUBLIC_API_URL" frontend/.env.example` でヒット）
- [ ] `frontend/.env.example` に `NEXT_PUBLIC_APP_ENV` キーが含まれる（`grep "NEXT_PUBLIC_APP_ENV" frontend/.env.example` でヒット）
- [ ] `frontend/.env.example` にシークレット値（実際の API キー・パスワード）が含まれない（ファイル内容がプレースホルダー文字列のみ）
- [ ] `frontend/Dockerfile` が存在する（`test -f frontend/Dockerfile` または同等の確認で Pass）
- [ ] `frontend/Dockerfile` に `builder` ステージと `runner` ステージが定義されている（`grep "AS builder" frontend/Dockerfile` および `grep "AS runner" frontend/Dockerfile` でヒット）
- [ ] `frontend/Dockerfile` が `node:20-alpine` ベースイメージを使用している（`grep "node:20-alpine" frontend/Dockerfile` でヒット）
- [ ] `frontend/Dockerfile` が `pnpm` を使用している（`grep "pnpm" frontend/Dockerfile` でヒット）
- [ ] `backend/.env.example` に `AWS_S3_BUCKET` キーが含まれる（`grep "AWS_S3_BUCKET" backend/.env.example` でヒット）
- [ ] `backend/.env.example` に `GOOGLE_PLACES_API_KEY` キーが含まれる（`grep "GOOGLE_PLACES_API_KEY" backend/.env.example` でヒット）
- [ ] `backend/.env.example` に `PLACES_PROVIDER` キーが含まれる（`grep "PLACES_PROVIDER" backend/.env.example` でヒット）
- [ ] `backend/.env.example` に `COOKIE_SECRET` キーが含まれる（`grep "COOKIE_SECRET" backend/.env.example` でヒット）
- [ ] `backend/.env.example` に `APP_ENV` キーが含まれる（`grep "APP_ENV" backend/.env.example` でヒット）
- [ ] `backend/.env.example` にシークレット値（実際の API キー・パスワード）が含まれない（ファイル内容がプレースホルダー文字列のみ）
- [ ] `backend/Dockerfile` が存在する（`test -f backend/Dockerfile` または同等の確認で Pass）
- [ ] `backend/Dockerfile` が Lambda ベースイメージ（`public.ecr.aws/lambda/nodejs:20`）を使用している（`grep "public.ecr.aws/lambda/nodejs:20" backend/Dockerfile` でヒット）
- [ ] `backend/Dockerfile` が `pnpm` を使用している（`grep "pnpm" backend/Dockerfile` でヒット）
- [ ] `docker-compose.yml` に `frontend` サービスが定義されている（`grep "frontend:" docker-compose.yml` でヒット）
- [ ] `docker-compose.yml` に `backend` サービスが定義されている（`grep "backend:" docker-compose.yml` でヒット）
- [ ] `docker-compose.yml` の `backend` サービスに `depends_on` が定義されている（`grep "depends_on" docker-compose.yml` でヒット）
- [ ] `docker-compose.yml` に `POSTGRES_USER`・`POSTGRES_PASSWORD`・`POSTGRES_DB` が定義されている（各 `grep` でヒット）
- [ ] `docker-compose.yml` に `volumes` セクションが定義されている（`grep "volumes:" docker-compose.yml` でヒット）
- [ ] `backend/.env.example` に `S3_BUCKET_NAME` キーが含まれない（`grep "S3_BUCKET_NAME" backend/.env.example` で 0 件）— `AWS_S3_BUCKET` への統一確認

---

## Risks

| リスク | 影響 | 回避方針 |
|---|---|---|
| `backend/Dockerfile` の `CMD` ハンドラーパスが未確定 | Lambda デプロイ時に起動失敗 | generator が `backend/src/` ディレクトリを確認し、Lambda エントリーポイント（`lambda.ts` 等）の実在を確認してから `CMD` を決定すること（現時点は TBD） |
| `frontend/next.config.js` に `output: 'standalone'` が未設定の場合、runner ステージが機能しない | frontend コンテナ起動失敗 | generator が `frontend/next.config.js` を確認し、未設定なら `output: 'standalone'` を追加すること（本タスクの Files to modify に含める） |
| 既存 `docker-compose.yml` の `postgres` サービス名変更（`db` リネーム）による接続文字列不整合 | backend DB 接続失敗 | `backend/.env.example` の `DATABASE_URL` ホスト部分を `db`（docker-compose サービス名）に更新すること。既存の `docker-compose.yml` を利用している開発者への周知が必要 |
| `S3_BUCKET_NAME` → `AWS_S3_BUCKET` 変数名変更 | 既存 backend コードが環境変数を読めなくなる | generator が `backend/src/` 全体を `grep "S3_BUCKET_NAME"` で検索し、参照箇所を `AWS_S3_BUCKET` に一括変更すること |

---

## Implementation summary

（generator が記入）

## Plan deviation

（generator が記入）

## Review comments

（evaluator が記入）
