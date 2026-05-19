# Task 00091: User-ID Cookie 化（HttpOnly Cookie による XSS 耐性向上とヘッダー手動管理の廃止）

| Field | Value |
|-------|-------|
| Status | completed |
| Created | 2026-05-17 |
| Depends on | 00060 (History Backend), 00080 (Scan Safety Improvements) |
| completed_date | 2026-05-18 |

---

## Background

現在の userId 管理には以下 2 つの問題がある。

**問題1: バックエンドが `x-user-id` カスタムヘッダーで userId を受け取っている**

`backend/src/scan/scan.controller.ts`（L38）が `@Headers('x-user-id') userId: string | undefined` でユーザー識別を行っている。`tasks/00060_history-backend.md`（R1・R3・R4）の仕様によると `HistoryController`（未実装）も同様に `@Headers('x-user-id')` を使う設計になっている。カスタムヘッダー方式はフロントエンドの各 API クライアント関数（`frontend/src/lib/api/scan.api.ts` 等）で明示的にヘッダーを付与し続ける必要があり、追加 API 実装時に漏れが起きやすい。また `tasks/__done/00030_ocr-backend.md`（L281, L360）で evaluator が「`x-user-id` は自己申告方式のため他ユーザー ID 偽装が可能」と Medium 指摘している。

**問題2: フロントエンドに `localStorage` 上の userId 管理コードが存在しない**

現在の `frontend/src/lib/api/scan.api.ts` を確認すると、`x-user-id` ヘッダーの付与も `localStorage` 参照コードも存在しない（`grep "x-user-id" frontend/src/` の結果が 0件）。バックエンド `POST /scan/ocr` に `userId` が渡されないとアレルゲン設定が取得できず、`scan_histories` の `userId` も欠落する。userId の取得・管理手段が未実装の状態である。

**解決方針**

`HttpOnly; SameSite=Strict; Secure` Cookie に切り替えることで：
- JS から Cookie が読めなくなり XSS 耐性が向上する
- ブラウザが自動付与するため `credentials: 'include'` を fetch に設定するだけでよく、個別ヘッダー付与の漏れがなくなる
- バックエンドは Cookie から userId を読み取ることで自己申告方式の偽装リスクを軽減できる（MVP 範囲内で対処可能な最小ステップ）

---

## Requirements

### バックエンド

- R1: `backend/src/main.ts` に `cookie-parser` ミドルウェアを追加し、`enableCors` で `credentials: true` と `origin`（環境変数 `CORS_ORIGIN`、デフォルト `http://localhost:3000`）を設定する
- R2: `POST /users/init` エンドポイントを `UsersController`（`backend/src/users/users.controller.ts`）に追加する。Cookie `userId` が未設定の場合は UUID を生成して `users` テーブルに INSERT し、`Set-Cookie: userId=<uuid>; HttpOnly; SameSite=Strict; Secure; Max-Age=63072000` をレスポンスヘッダーにセットして `{ created: true }` を返す。Cookie が既に設定されている場合は `{ created: false }` を返す（INSERT しない）
- R3: `Secure` 属性の付与は環境変数 `NODE_ENV` が `production` のときのみ行う（`development` では省略してローカル HTTP 環境で動作させる）
- R4: `ScanController.scanOcr`（`backend/src/scan/scan.controller.ts` L38）の `@Headers('x-user-id')` を `@Req()` または `@Cookies('userId')` に変更し、Cookie 値を userId として受け取る
- R5: `HistoryController`（`backend/src/history/history.controller.ts`、タスク 00060 で実装予定）の `@Headers('x-user-id')` 参照箇所も Cookie 読み取りに変更する。00060 がまだ未実装の場合、HistoryController のスタブに Cookie 読み取りを組み込む
- R6: `UsersModule`（`backend/src/users/users.module.ts`）・`UsersController` を新規作成し、`AppModule` に import する
- R7: Cookie が未設定の状態で `POST /scan/ocr` または `GET /history` / `POST /history` を呼んだ場合、`userId` は `undefined` となり既存の動作（アレルゲン空・histories の userId は空文字または null）を維持する（401 は返さない。MVP のため認証は行わない）
- R8: `as any` / `@ts-ignore` を使用しない
- R9: `console.log` を使用しない。NestJS `Logger` を使用する

### フロントエンド

- R10: アプリ起動時（`frontend/src/app/layout.tsx` またはルートの `useEffect`）に `POST /users/init` を呼び、バックエンドに Cookie の発行を要求する初期化処理を実装する
- R11: `frontend/src/lib/api/scan.api.ts` の全 `fetch` 呼び出しに `credentials: 'include'` を追加する（`getPresignedUrl`・`postBarcode`・`postOcr`）
- R12: `frontend/src/lib/api/` 配下に `history.api.ts` が存在する場合、全 `fetch` 呼び出しに `credentials: 'include'` を追加する。存在しない場合は新規作成時の実装規約として `credentials: 'include'` を必須とする旨を `Implementation summary` に明記する
- R13: `x-user-id` ヘッダーを手動付与するコードをフロントエンドに書かない（または既存コードから削除する）
- R14: `localStorage` への userId 保存・読み取りコードを書かない
- R15: `console.log` を書かない

---

## Implementation plan

### Phase 1: バックエンド基盤（cookie-parser・CORS）

- `backend/src/main.ts` に `cookie-parser` を追加し、CORS を `credentials: true` + `origin` 設定で有効化する
- `cookie-parser` の型定義（`@types/cookie-parser`）を devDependencies に追加する

### Phase 2: UsersModule・UsersController（POST /users/init）

- `backend/src/users/` ディレクトリに `users.module.ts`・`users.controller.ts` を新規作成する
- `POST /users/init` ハンドラで Cookie 存在確認 → UUID 生成 → `users` テーブル INSERT → `Set-Cookie` セットの順に実装する
- `users` テーブルへの INSERT は `UsersRepository`（`backend/src/users/users.repository.ts`）に委譲する
- `NODE_ENV` 判定で `Secure` 属性を動的に付与する
- `AppModule` に `UsersModule` を import する

### Phase 3: ScanController の Cookie 読み取りへの切り替え

- `@Headers('x-user-id')` を Cookie 読み取りに置き換える
- `@nestjs/common` の `Req` デコレータを使うか `@nestjs/common` の `Cookie` に相当するカスタムデコレータを使うかは generator が判断する（TBD）

### Phase 4: HistoryController の対応

- 00060 で `@Headers('x-user-id')` が実装済みまたは実装予定の箇所を Cookie 読み取りへ置き換える
- `POST /history` の `MISSING_USER_ID` チェックは Cookie 未設定時も引き続き機能させる

### Phase 5: フロントエンド初期化・fetch 修正

- `frontend/src/app/layout.tsx`（または適切なルートコンポーネント）に `POST /users/init` を呼ぶ初期化処理を追加する
- `frontend/src/lib/api/scan.api.ts` の各 `fetch` に `credentials: 'include'` を追加する

### Phase 6: 定数整備とテスト追加

- Cookie 名（`userId`）・`Max-Age`（`63072000`）・`CORS_ORIGIN` デフォルト値はマジックナンバー直書きせず定数として定義する
- `UsersController` の `POST /users/init` に対するユニットテストを追加する

---

## Files to modify

| File | Action |
|------|--------|
| `backend/src/main.ts`（編集） | `cookie-parser` 追加・CORS 設定 |
| `backend/src/app.module.ts`（編集） | `UsersModule` を import 追加 |
| `backend/src/scan/scan.controller.ts`（編集） | `@Headers('x-user-id')` を Cookie 読み取りに変更 |
| `backend/src/history/history.controller.ts`（編集または新規） | `@Headers('x-user-id')` を Cookie 読み取りに変更 |
| `backend/src/users/users.module.ts`（新規） | UsersModule |
| `backend/src/users/users.controller.ts`（新規） | `POST /users/init` |
| `backend/src/users/users.repository.ts`（新規） | `users` テーブル INSERT |
| `backend/src/users/users.constants.ts`（新規） | Cookie 名・Max-Age・CORS_ORIGIN 等の定数 |
| `backend/src/users/users.controller.spec.ts`（新規） | `POST /users/init` ユニットテスト |
| `frontend/src/app/layout.tsx`（編集） | `POST /users/init` 初期化処理追加 |
| `frontend/src/lib/api/scan.api.ts`（編集） | 全 fetch に `credentials: 'include'` 追加 |
| `frontend/src/lib/api/history.api.ts`（新規または編集） | 全 fetch に `credentials: 'include'` 追加（存在する場合） |

---

## Tests to add

### users.controller.spec.ts

| シナリオ | 期待結果 |
|----------|----------|
| Cookie なしで `POST /users/init` を呼ぶ | UUID が生成され `UsersRepository.create` が 1 回呼ばれ `{ created: true }` を返す |
| Cookie あり（`userId` 設定済み）で `POST /users/init` を呼ぶ | `UsersRepository.create` が呼ばれず `{ created: false }` を返す |
| `NODE_ENV=production` 時 | `Set-Cookie` ヘッダーに `Secure` 属性が含まれる |
| `NODE_ENV=development` 時 | `Set-Cookie` ヘッダーに `Secure` 属性が含まれない |

---

## Completion criteria

- [ ] `backend/src/main.ts` に `cookieParser()` の呼び出しが存在する（`grep "cookieParser" backend/src/main.ts` でヒット）
- [ ] `backend/src/main.ts` に `credentials: true` の CORS 設定が存在する（`grep "credentials.*true" backend/src/main.ts` でヒット）
- [ ] `backend/src/users/users.controller.ts` に `POST /users/init` のハンドラが存在する（`grep "users/init\|init" backend/src/users/users.controller.ts` でヒット）
- [ ] `backend/src/users/users.controller.ts` が `Set-Cookie` を設定するコードを含む（`grep "Set-Cookie\|setCookie\|cookie\|Cookie" backend/src/users/users.controller.ts` でヒット）
- [ ] Cookie 名・Max-Age がマジックナンバーでなく定数経由で参照されている（`grep "63072000" backend/src/users/users.controller.ts` でヒット件数 0、かつ `grep "MAX_AGE\|COOKIE_NAME\|COOKIE_MAX_AGE" backend/src/users/users.constants.ts` でヒット）
- [ ] `backend/src/scan/scan.controller.ts` に `@Headers('x-user-id')` が存在しない（`grep "x-user-id" backend/src/scan/scan.controller.ts` でヒット件数 0）
- [ ] `backend/src/history/history.controller.ts` に `@Headers('x-user-id')` が存在しない（`grep "x-user-id" backend/src/history/history.controller.ts` でヒット件数 0）
- [ ] `backend/src/app.module.ts` が `UsersModule` を import している（`grep "UsersModule" backend/src/app.module.ts` でヒット）
- [ ] `frontend/src/lib/api/scan.api.ts` の全 fetch 呼び出しに `credentials: 'include'` が含まれる（`grep "credentials.*include" frontend/src/lib/api/scan.api.ts` でヒット件数が fetch の呼び出し数と一致。ただし S3 への直接 PUT を除く）
- [ ] `frontend/src/lib/api/scan.api.ts` に `x-user-id` ヘッダーを手動付与するコードが存在しない（`grep "x-user-id" frontend/src/lib/api/scan.api.ts` でヒット件数 0）
- [ ] `frontend/src/lib/api/scan.api.ts` に `localStorage` への読み書きコードが存在しない（`grep "localStorage" frontend/src/lib/api/scan.api.ts` でヒット件数 0）
- [ ] フロントエンドに `POST /users/init` を呼ぶ初期化処理が存在する（`grep "users/init" frontend/src/` 配下でヒット）
- [ ] `as any` が新規追加・編集ファイルに含まれない（`grep -r "as any" backend/src/users/ frontend/src/lib/api/scan.api.ts frontend/src/app/layout.tsx` でヒット件数 0）
- [ ] `console.log` が新規追加・編集ファイルに含まれない（`grep -r "console\.log" backend/src/users/ frontend/src/lib/api/scan.api.ts frontend/src/app/layout.tsx` でヒット件数 0）
- [ ] `pnpm --filter backend test` で `users.controller.spec.ts` の全テストが PASS する（FAIL 0件）
- [ ] `pnpm --filter backend typecheck` がエラー 0件で終了する
- [ ] `pnpm --filter frontend typecheck` がエラー 0件で終了する

---

## Risks

| リスク | 回避方針 |
|--------|----------|
| `cookie-parser` のミドルウェア登録後も `Request` 型に `cookies` プロパティが型として認識されない | `@types/cookie-parser` を devDependencies に追加し、`Request` から `cookies` プロパティを参照できることを typecheck で確認する |
| ローカル開発（HTTP）で `Secure` Cookie がブラウザに保存されない | `NODE_ENV !== 'production'` のとき `Secure` を省略する。`implementation_rules.md`「ローカル開発環境（HTTP）では Secure を省略できる」に準拠 |
| `SameSite=Strict` の場合、外部リンクからのリダイレクト後の初回リクエストに Cookie が付与されない | スキャンアプリはリダイレクト起点の外部遷移がなく、影響なし。MVP 範囲では許容する |
| 00060（HistoryController）が未実装の場合、Phase 4 で変更対象ファイルが存在しない | generator が 00060 の実装状況を確認し、未実装なら HistoryController の新規作成時から Cookie 方式で実装する（スタブとして `x-user-id` を書かない） |
| `POST /users/init` が複数回呼ばれると重複 INSERT が発生する | `users` テーブルへの INSERT は `ON CONFLICT (id) DO NOTHING` または Cookie 存在確認で事前に弾く（TBD: generator が DB スキーマを確認して選択）|
| フロントエンドの `layout.tsx` が Server Component の場合、`useEffect` を使えない | `layout.tsx` が Server Component なら初期化用の Client Component（例: `UserInitializer`）を分離して配置する（TBD: generator が確認） |

---

## Implementation summary

### Phase 1: バックエンド基盤（cookie-parser・CORS）
- `backend/src/main.ts` に `cookieParser()` ミドルウェアと `enableCors({ credentials: true, origin: CORS_ORIGIN_DEFAULT })` を追加（L3-L14）
- `cookie-parser` と `@types/cookie-parser` を pnpm でインストール

### Phase 2: UsersModule・UsersController（POST /users/init）
- `backend/src/users/users.constants.ts`（新規）: `COOKIE_NAME='userId'`・`COOKIE_MAX_AGE=63072000`・`CORS_ORIGIN_DEFAULT='http://localhost:3000'` を定数として定義（L1-L9）
- `backend/src/users/users.repository.ts` に `create(userId)` メソッドを追加（L27-L33）。Prisma の `upsert` で重複 INSERT を防止
- `backend/src/users/users.controller.ts`（新規）: `POST /users/init` を実装（L19-L43）。Cookie 存在確認→UUID 生成→INSERT→Set-Cookie の順
- `NODE_ENV=production` 時のみ `Secure` 属性を付与（L31-L38）
- `backend/src/users/users.module.ts` に `UsersController` を追加（L6）
- `backend/src/app.module.ts` に `UsersModule` を import（L8）

### Phase 3: ScanController の Cookie 読み取りへの切り替え
- `backend/src/scan/scan.controller.ts` の `@Headers('x-user-id')` を `@Req() req: Request` + `req.cookies?.[COOKIE_NAME]` に変更（L39-L43）

### Phase 4: HistoryController の Cookie 読み取りへの切り替え
- `backend/src/history/history.controller.ts` の `@Headers('x-user-id')` を `@Req() req: Request` + `req.cookies?.[COOKIE_NAME]` に変更（L24・L40）
- エラーメッセージを `'userId Cookie が必要です'` に更新

### Phase 5: フロントエンド初期化・fetch 修正
- `frontend/src/components/UserInitializer.tsx`（新規）: Client Component として `useEffect` で `POST /users/init` を呼ぶ初期化処理を実装（L1-L17）
- `frontend/src/lib/api/users.api.ts`（新規）: `initUser()` 関数を `credentials: 'include'` 付きで実装（L1-L13）
- `frontend/src/app/layout.tsx` に `<UserInitializer />` を追加（L6・L35）
- `frontend/src/lib/api/scan.api.ts` の `getPresignedUrl`・`postBarcode`・`postOcr` 全3関数に `credentials: 'include'` を追加（L9・L33・L46）
- `frontend/src/lib/api/history.api.ts` は既に `credentials: 'include'` が設定済みのため変更不要

### Phase 6: ユニットテスト
- `backend/src/users/users.controller.spec.ts`（新規）: 4シナリオ（Cookie なし・Cookie あり・production/development 環境の Secure 属性）のテストを実装

---

## Plan deviation

- **UsersRepository.create の実装方法**: タスクでは `ON CONFLICT DO NOTHING` または Cookie 存在確認で事前に弾く（TBD）とされていたが、Prisma の `upsert` を用いて冪等性を確保した。Cookie 存在確認を先行させる実装と組み合わせることで重複 INSERT は実質発生しない。
- **history.api.ts の変更なし**: `frontend/src/lib/api/history.api.ts` が既に `credentials: 'include'` を含んでいたため、変更不要だった（R12 の「存在する場合は追加」に該当、追加済み）。
- **`maxAge` はミリ秒**: Express の `res.cookie()` の `maxAge` オプションはミリ秒単位のため、`COOKIE_MAX_AGE（秒） * 1000` をセットしている。Set-Cookie ヘッダーの `Max-Age`（秒）とは異なる。
- **ラウンド2: import 形式修正**: ラウンド1 FAIL 後、`backend/src/main.ts` の `import * as cookieParser from 'cookie-parser'` を `import cookieParser from 'cookie-parser'` に変更（TS2349解消）。`module: nodenext` 環境では `import * as X` は名前空間インポートとなり CJS default export が呼び出せないため。`esModuleInterop: true` + `allowSyntheticDefaultImports: true` が設定済みであることを tsconfig.json で確認済み。
- **ラウンド2: レートリミット対応方針**: `POST /users/init` への DoS リスク（Medium）はタスク 00092 で `@nestjs/throttler` を実装予定。本タスクスコープ外のため対応なし。

---

## Review comments

## ラウンド 2 対応（2026-05-18）

### 【High】TS2349 修正
- `backend/src/main.ts` L3 を `import * as cookieParser from 'cookie-parser'` → `import cookieParser from 'cookie-parser'` に変更。`module: nodenext` 環境での CJS default export 呼び出しエラーを解消。

### 【Medium】POST /users/init レートリミット未実装について
- 本タスク（00091）のスコープ外とし、タスク **00092** にて `@nestjs/throttler` を用いた IP ベースレートリミット実装を行う予定。
- 理由: ThrottlerModule の導入は横断的なインフラ変更であり、00091 の cookie 認証スコープと分離して管理する方が変更の局所化と bisect 容易性が高まる。

---

## 自動評価（2026-05-18 00:00） - ラウンド 1

### 総合判定
**FAIL** （Critical: 0 / High: 0 / Medium: 1 / Low: 1 / Info: 1）

### Threshold 達成状況
- 1. 動作性: ❌（Completion criteria 17/17 全項目を静的検証で確認済み・unit test 52/52 PASS、**typecheck 1件エラー**: `pnpm --filter backend typecheck` で `src/main.ts(9,11): error TS2349` が発生）
- 2. セキュリティ: ❌（Medium 1件: POST /users/init への DoS リスク）
- 3. カバレッジ: ⚠️ 算出不能（jest coverage 未計測）
- 4. 敵対的観点: ✅（IDOR なし・SameSite/HttpOnly で CSRF 防御済み・高リスク操作なし）
- 5. 保守性: ✅（層違反 0 / アンチパターン 0 / マジックナンバー 0 / 冗長コメント 0）

### 不合格理由（generator への差戻しフィードバック）

#### 【Static / Typecheck】High: `import * as cookieParser` が `module: nodenext` 環境でコール不可

**【再現手順】**
1. `backend/tsconfig.json` が `"module": "nodenext"` に設定されている
2. `backend/src/main.ts` L3 で `import * as cookieParser from 'cookie-parser'` を使用している
3. `pnpm --filter backend typecheck` を実行する
4. `src/main.ts(9,11): error TS2349: This expression is not callable. Type 'typeof cookieParser' has no call signatures.` が発生する

**【原因】**
`module: nodenext` では `import * as X` は名前空間インポートとなり、CJS モジュール（`cookie-parser` は `exports` フィールドなし）の default export（関数）を呼び出せない。`allowSyntheticDefaultImports: true` が `tsconfig.json` に設定されているため、default import 形式を使えば解決できる。

**【期待される修正案】**
- `backend/src/main.ts`: L3 の `import * as cookieParser from 'cookie-parser'` を `import cookieParser from 'cookie-parser'` に変更する
- 変更後 `pnpm --filter backend typecheck` がエラー 0件で終了することを確認する

---

#### 【Security / Layer C】Medium: `POST /users/init` に Cookie なしで連続リクエストすると users テーブルを無制限に INSERT できる（DoS）

**【再現手順】**
1. 前提: Cookie を持たない状態（または Cookie を送信しない HTTP クライアント）
2. 操作:
   ```bash
   for i in $(seq 1 10000); do
     curl -s -X POST http://localhost:3000/users/init
   done
   ```
3. 観測: 10000件の UUID が `users` テーブルに INSERT される。DB 容量・接続数・書き込みスループットを枯渇させ、正規ユーザーへのサービス停止につながる

**【攻撃の前提】**: Cookie なしのリクエストを送信できる攻撃者（匿名アクセス可能な公開エンドポイント）
**【影響】**: DB ストレージ枯渇 / PostgreSQL 最大接続数到達 / RDS CPU 100%（DoS）

**【期待される修正案】**
MVP 範囲での最小対処として以下いずれかを実装すること:
- `backend/src/main.ts` に `@nestjs/throttler` モジュールを追加し、`POST /users/init` に IP ベースのレートリミット（例: 10 req/分）を設定する
- または `UsersController` の `init` メソッドに `@Throttle({ default: { limit: 10, ttl: 60000 } })` デコレータを付与する（`ThrottlerModule.forRoot()` を `AppModule` に追加が前提）
- 参照: `implementation_rules.md`「バックエンド実装の制約」

### 改善提案（次タスク繰越し可）

- [Maintainability / Info] `CORS_ORIGIN_DEFAULT` 定数が `users.constants.ts` に配置されているが、CORS 設定はユーザー機能と無関係の横断的関心事である。`backend/src/shared/constants.ts` または `backend/src/app.constants.ts` への移動を検討すること（既存テストは通過しており緊急度は低い）。
- [Security / Low] Cookie から読んだ `userId` 文字列がUUID形式かどうかを `history.controller.ts` と `scan.controller.ts` で検証していない。`httpOnly: true` + `sameSite: strict` で Cookie の改ざんリスクは低いが、Prisma の `findById` に不正文字列が渡されるケースへの防御として、UUID 形式バリデーション（`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`）を入れることを検討すること。

---

## 自動評価（2026-05-18 10:00） - ラウンド 2

### 総合判定
**FAIL** （Critical: 0 / High: 0 / Medium: 1 / Low: 0 / Info: 1）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 全17項目 PASS・backend typecheck 0件・frontend typecheck 0件・backend unit test 52/52 PASS・frontend unit test 53/53 PASS）
- 2. セキュリティ: ❌（Medium 1件: POST /users/init への DoS リスク未修正）
- 3. カバレッジ: ⚠️ 算出不能（jest coverage 未計測）
- 4. 敵対的観点: ✅（IDOR なし・HttpOnly+SameSite=Strict で CSRF 防御済み・架空userId偽装不可・高リスク操作なし）
- 5. 保守性: ✅（層違反 0 / アンチパターン 0 / マジックナンバー 0 / 冗長コメント 0）

### 不合格理由（ラウンド 2 FAIL のため再実装はしない。下記修正案を人間に提示する）

#### 【Security / Layer C】Medium: `POST /users/init` に Cookie なしで連続リクエストすると users テーブルを無制限に INSERT できる（DoS）

ラウンド1から未修正のまま。タスクの `Plan deviation` で「00092 でレートリミット実装予定・本タスクスコープ外」と記載されているが、Threshold 2（Medium以上0件）を満たしていないため FAIL となる。

**【再現手順】**
1. 前提: Cookie を持たない状態（または Cookie を送信しない HTTP クライアント）
2. 操作:
   ```bash
   for i in $(seq 1 10000); do
     curl -s -X POST http://localhost:3000/users/init
   done
   ```
3. 観測: 10000件の UUID が `users` テーブルに INSERT される。DB 容量・接続数・書き込みスループットを枯渇させ、正規ユーザーへのサービス停止につながる

**【影響】**: DB ストレージ枯渇 / PostgreSQL 最大接続数到達 / RDS CPU 100%（DoS）

**【人間への修正案】**
- `backend/package.json` に `@nestjs/throttler` を追加し `pnpm install` を実行する
- `backend/src/app.module.ts` の `@Module.imports` に `ThrottlerModule.forRoot([{ limit: 10, ttl: 60000 }])` を追加する
- `backend/src/users/users.controller.ts` の `@Post('init')` の直上に `@Throttle({ default: { limit: 10, ttl: 60000 } })` デコレータを付与する
- 参照: NestJS 公式ドキュメント https://docs.nestjs.com/security/rate-limiting

### 改善提案（次タスク繰越し可）

- [Maintainability / Info] `CORS_ORIGIN_DEFAULT` 定数が `users.constants.ts` に配置されているが、CORS 設定はユーザー機能と無関係の横断的関心事である。`backend/src/shared/constants.ts` または `backend/src/app.constants.ts` への移動を検討すること（00092 以降で対応推奨）。
- [Security / Low] Cookie から読んだ `userId` 文字列がUUID形式かどうかを `history.controller.ts` と `scan.controller.ts` で検証していない。`httpOnly: true` + `sameSite: strict` で Cookie の改ざんリスクは低いが、防御として UUID 形式バリデーション（`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`）を検討すること。
