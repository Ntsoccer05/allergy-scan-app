# Task 00092: Rate Limiting（API Gateway スロットリング設定ドキュメント化 + NestJS Throttler 実装）

| Field | Value |
|-------|-------|
| Status | completed (round 2) |
| Created | 2026-05-18 |
| completed_date | 2026-05-18 |
| Depends on | 00091 (User-ID Cookie) |

---

## Background

認証不要（Cookie UUID）のアーキテクチャのため、誰でも API エンドポイントを叩ける。特に `POST /scan/ocr` は Gemini Flash API を呼び出すため、意図的な攻撃またはフロントエンドの実装バグによる無限ループで Gemini API コストが青天井になるリスクがある。

現時点のバックエンドには `@nestjs/throttler` が依存関係に存在しない（`backend/package.json` 確認済み）。`backend/src/app.module.ts` には `ThrottlerModule` の import もない（`backend/src/app.module.ts` L7〜L12 確認済み）。

2 層のレート制限を導入して保護する。

- **Layer 1**: AWS Lambda デプロイ時に API Gateway で設定するスロットリング値をタスクファイル内にドキュメントとして記録する（アプリコード変更なし）
- **Layer 2**: NestJS Throttler をグローバルガードとして実装し、エンドポイントごとに異なるレート制限値を定数で管理する

---

## Requirements

### Layer 1（ドキュメント）

- R1: API Gateway のグローバルスロットリング設定値（レート: 50 req/秒、バースト: 200 req）をこのタスクファイルの `Implementation summary` セクションに記録する（generator が記入）

### Layer 2（NestJS Throttler 実装）

- R2: `@nestjs/throttler` パッケージを `backend/package.json` の `dependencies` に追加する
- R3: `backend/src/app.module.ts` に `ThrottlerModule.forRoot` をインポートし、グローバルデフォルトのレート制限（TTL・Limit）を設定する。デフォルト値はマジックナンバー直書きではなく定数として定義する
- R4: `ThrottlerGuard` を `backend/src/app.module.ts` の `providers` にグローバルガードとして登録する（`APP_GUARD` トークン使用）
- R5: 以下のエンドポイントに `@Throttle` デコレータで個別のレート制限を設定する。設定値は `backend/src/shared/throttler.constants.ts` に名前付き定数として定義し、デコレータ引数にはその定数を参照する

  | エンドポイント | ファイル | TTL | Limit | 保護目的 |
  |---|---|---|---|---|
  | `POST /scan/ocr` | `backend/src/scan/scan.controller.ts` | 60 秒 | 5 回 | Gemini API コスト保護 |
  | `POST /scan/barcode` | `backend/src/scan/scan.controller.ts` | 60 秒 | 30 回 | DB flooding 防止 |
  | `POST /users/init` | `backend/src/users/users.controller.ts`（00091 で新規作成） | 3600 秒 | 3 回 | DB flooding 防止 |
  | `GET /history` | `backend/src/history/history.controller.ts`（00060 で新規作成） | 60 秒 | 60 回 | 過剰ポーリング防止 |

- R6: レート制限超過時（HTTP 429）のエラーメッセージを日本語で返す。`ThrottlerException` をカスタムした例外クラスまたはフィルターを使い、`{ message: "リクエストが多すぎます。しばらく待ってから再試行してください", code: "TOO_MANY_REQUESTS" }` を返す
- R7: Lambda のメモリストア限界（インスタンス間でスロットリングカウンターが共有されない）について、`backend/src/shared/throttler.constants.ts` にコメントで明記する
- R8: `as any` / `@ts-ignore` を使用しない
- R9: `console.log` を使用しない。NestJS `Logger` を使用する
- R10: 00060（`HistoryController`）または 00091（`UsersController`）が未実装の場合、該当コントローラーへの `@Throttle` デコレータ追加は generator が実装状況を確認し、未実装なら `Implementation summary` に「対象コントローラー未実装のため追加できなかった箇所と理由」を明記する

---

## Implementation plan

### Phase 1: 定数ファイル新規作成

- `backend/src/shared/throttler.constants.ts` を新規作成し、TTL・Limit のすべての値を `THROTTLE_*` 名前付き定数として定義する
- Lambda メモリストア制限のコメントをこのファイルに記載する

### Phase 2: ThrottlerModule・ThrottlerGuard のグローバル設定

- `backend/package.json` に `@nestjs/throttler` を追加する
- `backend/src/app.module.ts` の `imports` に `ThrottlerModule.forRoot`（Phase 1 の定数使用）を追加する
- `backend/src/app.module.ts` の `providers` に `{ provide: APP_GUARD, useClass: ThrottlerGuard }` を追加する

### Phase 3: エンドポイントへの @Throttle デコレータ設定

- `backend/src/scan/scan.controller.ts` の `scanOcr` ハンドラと `scanBarcode` ハンドラに `@Throttle` を追加する（Phase 1 の定数参照）
- 00060 `HistoryController` が実装済みであれば `GET /history` ハンドラに `@Throttle` を追加する
- 00091 `UsersController` が実装済みであれば `POST /users/init` ハンドラに `@Throttle` を追加する

### Phase 4: 429 エラーレスポンスの日本語化

- `ThrottlerException` を継承したカスタム例外クラスまたは NestJS Exception Filter を実装し、429 レスポンスのメッセージを日本語化する

### Phase 5: ユニットテスト追加

- `backend/src/scan/scan.controller.spec.ts`（新規または既存）で Throttler をモックし、レート超過時に 429 が返ることを確認するテストを追加する

---

## Files to modify

| File | Action |
|------|--------|
| `backend/package.json`（編集） | `@nestjs/throttler` を dependencies に追加 |
| `backend/src/app.module.ts`（編集） | `ThrottlerModule.forRoot` import・`APP_GUARD` 登録 |
| `backend/src/scan/scan.controller.ts`（編集） | `scanOcr`・`scanBarcode` に `@Throttle` 追加 |
| `backend/src/shared/throttler.constants.ts`（新規） | TTL・Limit 定数・Lambda 制限コメント |
| `backend/src/history/history.controller.ts`（編集・実装済みの場合） | `GET /history` に `@Throttle` 追加 |
| `backend/src/users/users.controller.ts`（編集・実装済みの場合） | `POST /users/init` に `@Throttle` 追加 |
| `backend/src/scan/throttler-exception.filter.ts`（新規） | 429 日本語エラーレスポンスのフィルターまたは例外クラス |
| `backend/src/scan/scan.controller.spec.ts`（新規または編集） | Throttler モックテスト |

---

## Tests to add

### scan.controller.spec.ts

OCR エンドポイントは Gemini API コストに直結するため、テストを重点強化する。

#### POST /scan/ocr — コスト保護（重点）

| # | シナリオ | 期待結果 |
|---|----------|----------|
| 1 | 制限内（5 回目）のリクエスト | HTTP 200 を返す |
| 2 | 制限超過（6 回目）のリクエスト | HTTP 429 を返す |
| 3 | 429 レスポンスボディに `code: "TOO_MANY_REQUESTS"` が含まれる | JSON に `{ code: "TOO_MANY_REQUESTS" }` が存在する |
| 4 | 429 レスポンスボディのメッセージが日本語である | `message` フィールドが `"リクエストが多すぎます。しばらく待ってから再試行してください"` と一致する |
| 5 | TTL（60 秒）リセット後は再びリクエストが通る | Throttler の TTL を 0 に設定してリセット後、6 回目でも HTTP 200 を返す |
| 6 | 連続バースト（10 回）で 6 回目以降は全て 429 になる | リクエスト 1〜5 が HTTP 200、6〜10 が全て HTTP 429 |
| 7 | `/scan/ocr` の制限が `/scan/barcode` カウンターと独立している | barcode を 30 回叩いても ocr の残余カウントは減らない（ocr 5 回目は 200） |

#### POST /scan/barcode

| # | シナリオ | 期待結果 |
|---|----------|----------|
| 8 | 制限内（30 回目）のリクエスト | HTTP 200 を返す |
| 9 | 制限超過（31 回目）のリクエスト | HTTP 429 と `{ code: "TOO_MANY_REQUESTS" }` を返す |

#### 429 レスポンス形式（共通）

| # | シナリオ | 期待結果 |
|---|----------|----------|
| 10 | 429 レスポンスの `Content-Type` が `application/json` である | `Content-Type: application/json` ヘッダーが存在する |

---

## Completion criteria

- [ ] `@nestjs/throttler` が `backend/package.json` の `dependencies` に存在する（`grep "@nestjs/throttler" backend/package.json` でヒット）
- [ ] `backend/src/shared/throttler.constants.ts` が存在し、`THROTTLE_OCR_TTL`・`THROTTLE_OCR_LIMIT`・`THROTTLE_BARCODE_TTL`・`THROTTLE_BARCODE_LIMIT` の定数が定義されている（`grep "THROTTLE_OCR_TTL\|THROTTLE_OCR_LIMIT\|THROTTLE_BARCODE_TTL\|THROTTLE_BARCODE_LIMIT" backend/src/shared/throttler.constants.ts` でヒット 4件以上）
- [ ] `backend/src/shared/throttler.constants.ts` に Lambda メモリストア制限の注記コメントが存在する（`grep "インスタンス\|Lambda\|メモリ\|共有" backend/src/shared/throttler.constants.ts` でヒット）
- [ ] `backend/src/app.module.ts` に `ThrottlerModule` の import が存在する（`grep "ThrottlerModule" backend/src/app.module.ts` でヒット）
- [ ] `backend/src/app.module.ts` に `APP_GUARD` と `ThrottlerGuard` の登録が存在する（`grep "APP_GUARD\|ThrottlerGuard" backend/src/app.module.ts` でヒット）
- [ ] `backend/src/scan/scan.controller.ts` の `scanOcr` ハンドラに `@Throttle` デコレータが存在する（`grep "@Throttle" backend/src/scan/scan.controller.ts` でヒット 2件以上）
- [ ] `backend/src/scan/scan.controller.ts` に TTL・Limit のマジックナンバーが直書きされていない（`grep "@Throttle({\|@Throttle(6\|@Throttle(5\|@Throttle(30\|@Throttle(60\|@Throttle(3600" backend/src/scan/scan.controller.ts` でヒット件数 0）
- [ ] 429 レスポンスのメッセージが日本語化されており `code: "TOO_MANY_REQUESTS"` を含む実装が存在する（`grep "TOO_MANY_REQUESTS\|リクエストが多すぎます" backend/src/` の配下でヒット）
- [ ] `as any` が新規追加・編集ファイルに含まれない（`grep -r "as any" backend/src/shared/throttler.constants.ts backend/src/scan/scan.controller.ts backend/src/app.module.ts` でヒット件数 0）
- [ ] `console.log` が新規追加・編集ファイルに含まれない（`grep -r "console\.log" backend/src/shared/throttler.constants.ts backend/src/scan/scan.controller.ts backend/src/app.module.ts` でヒット件数 0）
- [ ] `pnpm --filter backend test` で新規追加した `scan.controller.spec.ts` のスロットリングテスト 10 シナリオが全て PASS する（FAIL 0件）
- [ ] `pnpm --filter backend typecheck` がエラー 0件で終了する

---

## Risks

| リスク | 回避方針 |
|--------|----------|
| Lambda 複数インスタンスでカウンターが共有されず期待通りにスロットリングされない | `throttler.constants.ts` にコメントで明記。Layer 1（API Gateway）をアプリ外の第1防衛ラインとして機能させる設計とする |
| `@nestjs/throttler` のバージョンが NestJS v11 と非互換 | `backend/package.json` の `@nestjs/common` バージョン（`^11.0.1`）と互換性のある `@nestjs/throttler` バージョンを generator が確認して採用する（TBD） |
| `ThrottlerModule.forRoot` の引数 API が `@nestjs/throttler` v4 と v5 以降で異なる | generator が採用バージョンの公式ドキュメントを参照して引数形式を確認する（TBD） |
| 00060・00091 が未実装で `HistoryController`・`UsersController` に `@Throttle` を追加できない | R10 に従い、generator が未実装箇所を `Implementation summary` に明記して残タスクとして次タスク実装者に申し送る |
| `@Throttle` デコレータ引数に直接リテラルを書くとマジックナンバー禁止規約に抵触する | `throttler.constants.ts` の定数を spread または直接参照して渡す（`coding_rules.md` SCREAMING_SNAKE_CASE 定数規約に従う） |

---

## Implementation summary

### Layer 1 ドキュメント（R1）

API Gateway グローバルスロットリング設定値:
- レート: 50 req/秒
- バースト: 200 req

### Phase 1: 定数ファイル新規作成

`backend/src/shared/throttler.constants.ts` を新規作成。
- `THROTTLE_OCR_TTL` / `THROTTLE_OCR_LIMIT`（60秒 / 5回）
- `THROTTLE_BARCODE_TTL` / `THROTTLE_BARCODE_LIMIT`（60秒 / 30回）
- `THROTTLE_USERS_INIT_TTL` / `THROTTLE_USERS_INIT_LIMIT`（3600秒 / 3回）
- `THROTTLE_HISTORY_TTL` / `THROTTLE_HISTORY_LIMIT`（60秒 / 60回）
- `THROTTLE_DEFAULT_TTL_MS` / `THROTTLE_DEFAULT_LIMIT`（グローバルデフォルト）
- Lambda インスタンス間でカウンターが共有されない旨のコメントを記載

### Phase 2: ThrottlerModule・ThrottlerGuard のグローバル設定

- `backend/package.json`: `@nestjs/throttler@^6.5.0` を dependencies に追加（NestJS v11 完全対応バージョン）
- `backend/src/app.module.ts`:
  - `ThrottlerModule.forRoot([{ ttl: THROTTLE_DEFAULT_TTL_MS, limit: THROTTLE_DEFAULT_LIMIT }])` を imports に追加（L17-L22）
  - `{ provide: APP_GUARD, useClass: ThrottlerGuard }` を providers に追加（L32-L35）
  - `{ provide: APP_FILTER, useClass: ThrottlerExceptionFilter }` を providers に追加（L36-L39）

### Phase 3: エンドポイントへの @Throttle デコレータ設定

- `backend/src/scan/scan.controller.ts` (L38, L43): `scanBarcode` と `scanOcr` に `@Throttle` 追加
- `backend/src/users/users.controller.ts` (L28): `POST /users/init` に `@Throttle` 追加（00091 実装済み確認）
- `backend/src/history/history.controller.ts` (L30): `GET /history` に `@Throttle` 追加（00060 実装済み確認）

### Phase 4: 429 エラーレスポンスの日本語化

`backend/src/scan/throttler-exception.filter.ts` を新規作成。
- `@Catch(ThrottlerException)` で 429 をキャッチ
- `{ message: "リクエストが多すぎます。しばらく待ってから再試行してください", code: "TOO_MANY_REQUESTS", statusCode: 429 }` を返す
- `APP_FILTER` でグローバル登録

### Phase 5: ユニットテスト追加

`backend/src/scan/scan.controller.spec.ts` を新規作成。
- `@nestjs/throttler` v6 の `getStorageToken()` でストレージ取得
- `TestThrottlerGuard` で IP ではなく固定キー "test-client" でトラッキング
- シナリオ 1〜10 全て PASS（10/10）

### 採用バージョン

`@nestjs/throttler@6.5.0`（NestJS v11 完全対応。peerDeps に `^11.0.0` を含む最新版）

### @Throttle デコレータ引数形式

`@nestjs/throttler` v6 の `@Throttle` は `Record<string, {ttl, limit}>` 形式。
例: `@Throttle({ default: { ttl: THROTTLE_OCR_TTL, limit: THROTTLE_OCR_LIMIT } })`

---

## Plan deviation

- `@nestjs/throttler` v6 の TTL 単位はミリ秒（v4 以前は秒）。定数ファイルで `SEC_TO_MS = 1000` を介してミリ秒に変換。
- `ThrottlerExceptionFilter` は `scan/throttler-exception.filter.ts` に作成したが、`APP_FILTER` 登録は `app.module.ts` に集約（スコープ的には scan 以外にも適用されるグローバルフィルターのため適切）。
- テストで `ThrottlerStorageService` を `module.get()` するには `getStorageToken()`（Symbol）を使う必要があり、クラス名では取得できなかった。
- シナリオ5（TTLリセット）の実装: `ThrottlerStorageService` の `_storage` (private Map) を `storageAsService._storage.clear()` でクリアすることで TTL リセットを模倣。内部実装依存だが、テスト目的のため許容。
- `scan.controller.spec.ts` で `supertest` は `import request from 'supertest'` を使用（`module: "nodenext"` + `esModuleInterop` 環境では default import が必要）。

### ラウンド2修正（evaluator FAIL 受領後）

1. `backend/src/scan/throttler-exception.filter.ts` → `backend/src/shared/throttler-exception.filter.ts` に移動。グローバルクロスカッティング関心事は `shared/` に集約するアーキテクチャ規約に準拠。
   - `backend/src/app.module.ts` L10 の import パスを `'./shared/throttler-exception.filter'` に更新。
   - `backend/src/scan/scan.controller.spec.ts` L14 の import パスを `'../shared/throttler-exception.filter'` に更新。
   - 旧ファイル `backend/src/scan/throttler-exception.filter.ts` を削除。
2. `backend/src/scan/scan.controller.spec.ts` ESLint エラー4件を修正:
   - L2: `ExecutionContext` の未使用 import を削除。
   - L41: `TestThrottlerGuard.getTracker` の `async` を削除し `Promise.resolve()` を返す形に変更。引数 `_req` も完全省略（TypeScript の引数縮小オーバーライドは型安全）。
   - L155: `res.body.message` を `(res.body as { message: string }).message` の型安全なアクセスに変更。

---

## Review comments

## 自動評価（2026-05-18 00:00） - ラウンド 1

### 総合判定
**FAIL** （Critical: 0 / High: 0 / Medium: 0 / Low: 3）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 12/12 通過、typecheck 0件、unit 62件全合格）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（10シナリオで新規ロジック全網羅）
- 4. 敵対的観点: ✅（Critical/High 0 件）
- 5. 保守性: ❌（アーキテクチャ/モジュール配置違反 1件、ESLint error 新規追加 4件）

### 不合格理由

#### 【Maintainability】[Module Architecture]
**【再現手順】**
1. `backend/src/app.module.ts` を開く
2. L10: `import { ThrottlerExceptionFilter } from './scan/throttler-exception.filter'` を確認
3. `backend/src/scan/scan.module.ts` を開き、`ThrottlerExceptionFilter` が providers/exports に存在しないことを確認

**【問題の詳細】**
`ThrottlerExceptionFilter` はグローバルレート制限フィルターであり `APP_FILTER` で全モジュールに適用されるクロスカッティング関心事です。にもかかわらず `backend/src/scan/` ディレクトリに置かれており、`app.module.ts` が `ScanModule` を迂回してそのディレクトリ内のファイルを直接 import しています。`scan.module.ts` の providers/exports にも登録されていないため、モジュール境界が実質的に破られています。

`architecture.md` の `src/shared/` は「HTTP通信・外部APIクライアント・共通ユーティリティ」の集約場所として定義されており、グローバルフィルターもここに置くべきです。

**【期待される修正案】**
- `backend/src/scan/throttler-exception.filter.ts` → `backend/src/shared/throttler-exception.filter.ts` へ移動
- `backend/src/app.module.ts` L10 の import パスを `'./shared/throttler-exception.filter'` に変更
- `backend/src/scan/scan.controller.spec.ts` L14 の import パスを `'../shared/throttler-exception.filter'` に変更

---

#### 【Maintainability】[ESLint errors in scan.controller.spec.ts]
**【再現手順】**
1. `pnpm --filter backend lint` を実行
2. `scan.controller.spec.ts` に起因する以下のエラーを確認:
   - L2: `'ExecutionContext' is defined but never used` (@typescript-eslint/no-unused-vars)
   - L41: `Async method 'getTracker' has no 'await' expression` (@typescript-eslint/require-await)
   - L42: `'_req' is defined but never used` (@typescript-eslint/no-unused-vars)
   - L155: `Unsafe member access .message on an 'any' value` (@typescript-eslint/no-unsafe-member-access)

**【期待される修正案】**
- `backend/src/scan/scan.controller.spec.ts` L2: `ExecutionContext` を import から削除
  ```typescript
  // Before
  import { INestApplication, ExecutionContext } from '@nestjs/common';
  // After
  import { INestApplication } from '@nestjs/common';
  ```
- L40-43: `getTracker` から `async` キーワードを削除し、`_req` を `__req` または未使用変数 ESLint 例外コメントで対処。または同期版に変更：
  ```typescript
  // Before
  protected override async getTracker(_req: Record<string, unknown>): Promise<string> {
    return 'test-client';
  }
  // After
  protected override getTracker(_req: Record<string, unknown>): Promise<string> {
    return Promise.resolve('test-client');
  }
  ```
  ただし `_req` の unused-vars については `eslint-disable-next-line` は禁止。代わりに `ThrottlerGuard` のシグネチャを確認して引数を完全省略できるか検討する。
- L155: `res.body` を型アサーションで明示化：
  ```typescript
  // Before
  expect(res.body.message).toBe(...)
  // After
  const body = res.body as { message: string };
  expect(body.message).toBe(...)
  ```

---

### 改善提案（次タスク繰越し可）

- [Security/Low] Lambda + API Gateway 環境では `req.ip` がすべてのリクエストで同一の内部アドレスになる可能性がある。`ThrottlerGuard` を継承して `getTracker` で Cookie の `userId` を tracking key として使用することで per-user レート制限を実現できる。ただし現状は Lambda の制約として constants に文書化されており、API Gateway Layer 1 が第1防衛ラインとして機能することが記述済みのため許容範囲内。
- [Maintainability/Info] `SEC_TO_MS = 1000` が `throttler.constants.ts` の非 export `const` として定義されている。`coding_rules.md` の「意図を持つリテラル値は名前付き定数として定義し、`*.constants.ts` に置く」に沿ってはいるが、ファイル内で閉じた計算補助定数として export しないのは設計として合理的。問題なし。
- [Test/Info] シナリオ5でプライベートフィールド `_storage` を `as unknown as` でアクセスしている。generator の Plan deviation に文書化済み。将来 `@nestjs/throttler` のバージョンアップで内部実装が変わるとテストが壊れるため、次バージョンアップ時に確認すること。

---

## 自動評価（2026-05-18） - ラウンド 2

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 0）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 12/12 通過、typecheck 0件、unit 62件全合格 / scan.controller.spec.ts 10シナリオ全 PASS）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（10シナリオで新規ロジック全網羅）
- 4. 敵対的観点: ✅（Critical/High 0 件）
- 5. 保守性: ✅（`ThrottlerExceptionFilter` が `shared/` に移動済み・ESLint error 0件）

### ラウンド2 検証結果

#### アーキテクチャ修正確認
- `backend/src/scan/throttler-exception.filter.ts` は削除済み（Glob で存在しないことを確認）
- `backend/src/shared/throttler-exception.filter.ts` が正しく作成されている
- `backend/src/app.module.ts` L10: `'./shared/throttler-exception.filter'` で import されている
- `backend/src/scan/scan.controller.spec.ts` L14: `'../shared/throttler-exception.filter'` で import されている

#### ESLint 修正確認
- `scan.controller.spec.ts` の 4 件の error が全て解消:
  - `ExecutionContext` 未使用 import 削除済み（L2）
  - `getTracker` の `async` 削除・`Promise.resolve()` 返却に変更済み（L41）
  - `_req` 引数完全省略済み（引数なしシグネチャ）
  - `res.body as { message: string }` 型アサーション追加済み（L153）
- 残存する ESLint 出力は warnings のみ（`no-unsafe-argument` 20件: supertest の `app.getHttpServer()` が `any` を返す既知パターン）。これらは `scan.controller.spec.ts` に対する警告だが、`error` レベルではなく `warning` のため保守性 Threshold に抵触しない
- 全体 lint の `error` 8件は `scan-history.repository.spec.ts` 6件・`gemini-prompt.builder.spec.ts` 2件・`main.ts` 1件（warning）のプレエグジスティング問題で本タスクの変更ファイルではない

### 改善提案（次タスク繰越し可）
- [Security/Info] `GET /scan/presigned-url` と `POST /history` は個別の `@Throttle` がなく、グローバルデフォルト（100 req/60s）のみ。`POST /history` は DB INSERT のため将来的に個別制限の検討余地あり。ただし本タスク仕様外のため要件違反ではない。
- [Test/Info] シナリオ5の `_storage` プライベートフィールドアクセス（`as unknown as`）は `@nestjs/throttler` の内部実装依存。バージョンアップ時に要確認。（ラウンド1から引継ぎ）
