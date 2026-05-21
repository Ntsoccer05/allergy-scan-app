# Task 00060: History Backend (GET /history, POST /history)

| Field | Value |
|-------|-------|
| Status | completed |
| Created | 2026-05-16 |
| completed_date | 2026-05-18 |
| Depends on | 00050 (Scan Frontend UI) |

---

## Background

`backend/src/history/` には `ScanHistoryRepository`（INSERT のみ）と `HistoryModule` が存在するが、Controller・Service は未実装。`HistoryModule` は現在 `ScanHistoryRepository` を provide/export するのみで `AppModule` にも登録されていない（`backend/src/app.module.ts` は `PrismaModule` と `ScanModule` のみをインポート）。

`ScanHistoryRepository.create()` は `backend/src/history/scan-history.repository.ts` に実装済みだが、カーソルページネーション対応の `findByUser` メソッドは未実装。`GET /history` エンドポイントも未実装。

現在の `ScanService.processOcr()` は `scan_histories` への INSERT を `ScanHistoryRepository.create()` 経由で実行しているが、`POST /history` の独立エンドポイントは存在しない。スキャン結果の保存フロー（バーコード・OCR 双方からの履歴保存）をフロントエンドが `POST /history` 経由で行うための API を追加する。

設計の根拠となる正典:
- `.claude/rules/patterns.md` — パターン4（カーソルベースページネーション）
- `.claude/rules/architecture.md` — バックエンド層境界（Controller → Service → Repository）
- `.claude/rules/anti_patterns.md` — #5（Controller が Repository を直接呼ぶ禁止）・#6（Service に SQL を書く禁止）
- `backend/src/shared/types/db.types.ts` — `ScanHistoryLocation` 型・`UserAllergies` 型
- `backend/prisma/schema.prisma` — `ScanHistory` モデル定義（`judgment: String`・`detected: Json`・`location: Json?`）

---

## Requirements

- R1: `GET /history` は `cursor`（ISO8601 文字列、省略可）・`judgment`（`'all' | 'ng' | 'partial' | 'ok'`、省略時は `'all'`）のクエリパラメータを受け取り、`user_id`（ヘッダー `x-user-id`）でフィルタした scan_histories をカーソルページネーション（1ページ最大 20 件）で返す
- R2: `GET /history` のレスポンスは `{ items: ScanHistoryRecord[], next_cursor: string | null }` 形式で返す。`next_cursor` は次ページ先頭レコードの `scanned_at`（ISO8601 文字列）または最終ページなら `null`
- R3: `POST /history` は `{ product_id, product_name, judgment, detected, location?, thumbnail_url? }` を受け取り、`scan_histories` テーブルに INSERT し、作成されたレコードを返す。`user_id` はヘッダー `x-user-id` から取得する
- R4: `POST /history` で `user_id` がヘッダーに存在しない場合、400 と `{ message: 'x-user-id ヘッダーが必要です', code: 'MISSING_USER_ID' }` を返す
- R5: `ScanHistoryRepository` に `findByUser(userId, options)` メソッドを追加する。`options` は `{ cursor?: Date; judgment?: string; limit: number }` を受け取り、patterns.md パターン4のカーソルベースクエリを実装する
- R6: `HistoryService` を `backend/src/history/history.service.ts` に新規作成し、`getHistory`・`createHistory` のビジネスロジックを実装する。DB クエリは `ScanHistoryRepository` に委譲する（anti_patterns.md #6 遵守）
- R7: `HistoryController` を `backend/src/history/history.controller.ts` に新規作成し、`GET /history`・`POST /history` のルーティングとバリデーションを実装する。Repository への直接アクセスは禁止（anti_patterns.md #5 遵守）
- R8: `HistoryModule` に `HistoryController` と `HistoryService` を登録し、`AppModule` に `HistoryModule` をインポートする
- R9: リクエスト DTO を `backend/src/history/dto/` に定義する。`as any` / `@ts-ignore` は使用しない
- R10: `console.log` を使用しない。NestJS `Logger` を使用する

---

## Implementation plan

### Phase 1: Repository 拡張（findByUser）

- `ScanHistoryRepository.findByUser(userId, options)` を追加する
- patterns.md パターン4のカーソルベースクエリを Prisma の `where` 句で実装する
- `judgment` フィルタは `options.judgment === 'all'` のとき条件なし、それ以外は `judgment` カラムと一致するものを返す
- `limit + 1` 件取得して次ページ有無を判定する方針を取る

### Phase 2: DTO 定義

- `backend/src/history/dto/get-history.dto.ts`: `cursor?`（string）・`judgment?`（string）のクエリ DTO
- `backend/src/history/dto/create-history.dto.ts`: `product_id?`・`product_name?`・`judgment`（`'ng' | 'partial' | 'ok'`）・`detected`（string[]）・`location?`（`ScanHistoryLocation`）・`thumbnail_url?` のボディ DTO

### Phase 3: HistoryService 実装

- `getHistory(userId, query)`: `ScanHistoryRepository.findByUser` を呼び出し、`next_cursor` を計算して返す
- `createHistory(userId, body)`: `ScanHistoryRepository.create` を呼び出す

### Phase 4: HistoryController 実装

- `GET /history`: `@Headers('x-user-id')` と `@Query()` から取得し `HistoryService.getHistory` を呼ぶ
- `POST /history`: `@Headers('x-user-id')` が存在しない場合 `BadRequestException` を throw。`HistoryService.createHistory` を呼ぶ

### Phase 5: HistoryModule 更新 + AppModule 登録

- `HistoryModule` に `HistoryController` / `HistoryService` を追加し、`PrismaModule` はグローバルなので import 不要
- `backend/src/app.module.ts` に `HistoryModule` を import 追加

### Phase 6: Unit テスト

- `backend/src/history/history.service.spec.ts`: `getHistory`・`createHistory` のビジネスロジックを `ScanHistoryRepository` をモックして検証
- `backend/src/history/scan-history.repository.spec.ts`: `findByUser` のカーソルページネーションロジックを `PrismaService` をモックして検証

---

## Files to modify

| File | Action |
|------|--------|
| `backend/src/history/scan-history.repository.ts`（編集） | `findByUser` メソッド追加 |
| `backend/src/history/dto/get-history.dto.ts`（新規） | GET /history クエリ DTO |
| `backend/src/history/dto/create-history.dto.ts`（新規） | POST /history ボディ DTO |
| `backend/src/history/history.service.ts`（新規） | HistoryService |
| `backend/src/history/history.controller.ts`（新規） | HistoryController |
| `backend/src/history/history.module.ts`（編集） | Controller / Service 登録追加 |
| `backend/src/app.module.ts`（編集） | HistoryModule を import 追加 |
| `backend/src/history/history.service.spec.ts`（新規） | HistoryService 単体テスト |
| `backend/src/history/scan-history.repository.spec.ts`（新規） | findByUser 単体テスト |

---

## Tests to add

### history.service.spec.ts

| シナリオ | 期待結果 |
|----------|----------|
| `getHistory` カーソルなし・judgment=all | 最大20件返却・`next_cursor` が null またはISO8601文字列 |
| `getHistory` カーソルあり | cursor 未満の `scanned_at` レコードのみ返却 |
| `getHistory` judgment=ng フィルタ | `judgment === 'ng'` のレコードのみ返却 |
| `createHistory` 正常系 | `ScanHistoryRepository.create` が1回呼ばれ作成レコードが返る |

### scan-history.repository.spec.ts

| シナリオ | 期待結果 |
|----------|----------|
| `findByUser` cursor なし | `scannedAt DESC` 順で最大 limit+1 件返却 |
| `findByUser` cursor あり | `scannedAt < cursor` の条件が Prisma クエリに含まれる |
| `findByUser` judgment フィルタ | `judgment` 条件が Prisma クエリに含まれる |

---

## Completion criteria

- [ ] `GET /history` に `x-user-id: test-user` ヘッダーを付けてリクエストすると 200 と `{ items: [], next_cursor: null }` 形式のレスポンスを返す（curl またはテストで確認、`items` は配列・`next_cursor` は文字列または null）
- [ ] `GET /history?judgment=ng` に `x-user-id` ヘッダーを付けてリクエストすると 200 を返し、`items` 内の全要素の `judgment` が `'ng'` である（空配列は許容）
- [ ] `GET /history?cursor=2026-01-01T00:00:00.000Z` に `x-user-id` ヘッダーを付けてリクエストすると 200 を返す（cursor クエリが受け付けられる）
- [ ] `POST /history` に `x-user-id` ヘッダーなしでリクエストすると 400 と `{ code: 'MISSING_USER_ID' }` を返す（`grep "MISSING_USER_ID" backend/src/history/history.controller.ts` でヒット）
- [ ] `POST /history` に有効ペイロードと `x-user-id` ヘッダーを付けてリクエストすると 201 と作成されたレコード（`id`・`scanned_at` を含む）を返す
- [ ] `backend/src/history/scan-history.repository.ts` に `findByUser` メソッドが存在する（`grep "findByUser" backend/src/history/scan-history.repository.ts` でヒット）
- [ ] `backend/src/history/history.controller.ts` が `ScanHistoryRepository` を直接 import していない（`grep "ScanHistoryRepository" backend/src/history/history.controller.ts` でヒット件数 0）
- [ ] `backend/src/history/history.service.ts` が SQL クエリ（`$queryRaw`・`$executeRaw`）を直接記述していない（`grep "queryRaw\|executeRaw" backend/src/history/history.service.ts` でヒット件数 0）
- [ ] `backend/src/app.module.ts` が `HistoryModule` を import している（`grep "HistoryModule" backend/src/app.module.ts` でヒット）
- [ ] `as any` が新規追加ファイルに含まれない（`grep -r "as any" backend/src/history/` でヒット件数 0）
- [ ] `console.log` が新規追加・編集ファイルに含まれない（`grep -r "console\.log" backend/src/history/` でヒット件数 0）
- [ ] `pnpm --filter backend test` で `history.service.spec.ts`・`scan-history.repository.spec.ts` の全テストが PASS する（FAIL 0件）
- [ ] `pnpm --filter backend typecheck` がエラー 0件で終了する

---

## Risks

| リスク | 回避方針 |
|--------|----------|
| `cursor` が不正な日付文字列の場合の例外 | `HistoryService.getHistory` で `new Date(cursor)` が `NaN` のとき `BadRequestException` を throw する |
| `detected` JSONB の型安全 | `ScanHistoryRepository` 内でのみ `as unknown as string[]` を使用。Controller / Service では `string[]` 型として扱う（db.types.ts のパターンに倣う） |
| `PrismaModule` の二重 import | `PrismaModule` は `@Global()` なので `HistoryModule` に import 不要 |
| `POST /history` と `ScanService.processOcr` の重複保存 | `ScanService.processOcr` は引き続き内部で `ScanHistoryRepository.create` を呼ぶ。`POST /history` はフロントエンドから独立して呼ばれる API。00070 のフロント実装で使い分けを確定する（TBD: generator 確認） |

---

## Implementation summary

### Phase 1: Repository 拡張（findByUser）
- `backend/src/history/scan-history.repository.ts` に `FindByUserOptions` 型と `findByUser` メソッドを追加（L29–L80）
- Prisma の `where` 句で `judgment !== 'all'` 時のみ judgment フィルタを適用、`cursor` が存在する時のみ `scannedAt < cursor` 条件を適用
- `limit + 1` 件取得して次ページ有無を判定するパターンに従った

### Phase 2: DTO 定義
- `backend/src/history/dto/get-history.dto.ts`（新規）: `cursor?`（ISO8601）・`judgment?`（'all'|'ng'|'partial'|'ok'）
- `backend/src/history/dto/create-history.dto.ts`（新規）: `judgment`・`detected`・省略可能フィールド群

### Phase 3: HistoryService 実装
- `backend/src/history/history.service.ts`（新規）: `getHistory`・`createHistory` を実装（L1–L74）
- `HISTORY_PAGE_LIMIT = 20` を名前付き定数として定義（マジックナンバー禁止遵守）
- 不正な cursor 文字列は `BadRequestException` を throw

### Phase 4: HistoryController 実装
- `backend/src/history/history.controller.ts`（新規）: `GET /history`・`POST /history`（L1–L52）
- `x-user-id` ヘッダー未送信時に `{ message: 'x-user-id ヘッダーが必要です', code: 'MISSING_USER_ID' }` で 400 を返す
- `ScanHistoryRepository` を直接 import せず、`HistoryService` 経由のみでアクセス

### Phase 5: HistoryModule 更新 + AppModule 登録
- `backend/src/history/history.module.ts`（編集）: `HistoryController`・`HistoryService` を追加（L1–L11）
- `backend/src/app.module.ts`（編集）: `HistoryModule` を imports 配列に追加（L7, L11）

### Phase 6: Unit テスト
- `backend/src/history/history.service.spec.ts`（新規）: HistoryService の全シナリオをモックでカバー
- `backend/src/history/scan-history.repository.spec.ts`（新規）: findByUser の cursor/judgment 条件を PrismaService モックで検証

---

## Plan deviation

none

---

## Review comments

## 自動評価（2026-05-18 00:00） - ラウンド 1

### 総合判定
**[PASS]** （Critical: 0 / High: 0 / Medium: 0 / Low: 2 / Info: 1）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 13/13 通過、typecheck 0件、unit 43件 PASS）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（history.service.spec.ts 7件 / scan-history.repository.spec.ts 6件 — 新規ロジック網羅）
- 4. 敵対的観点: ✅（Critical/High 0 件）
- 5. 保守性: ✅（層違反 0 / アンチパターン 0 / マジックナンバー 0 / 冗長コメント 0）

### 改善提案（PASS / 次タスク繰越し可）

#### [Low] POST /history の detected 配列・product_name にサイズ制限なし
**ファイル**: `backend/src/history/dto/create-history.dto.ts`

`detected` に `@ArrayMaxSize(50)`、`product_name` に `@MaxLength(200)` 等の上限を追加すると
巨大ペイロードによる DB INSERT 負荷を抑止できる。
既存 scan DTO（`BarcodeScandDto` / `OcrScanDto`）は `@Matches` で入力を制限しているため、
同水準の防御を揃えることを推奨。

```typescript
// create-history.dto.ts
import { ..., ArrayMaxSize, MaxLength } from 'class-validator';

@IsArray()
@IsString({ each: true })
@ArrayMaxSize(50)  // 追加
detected!: string[];

@IsOptional()
@IsString()
@MaxLength(200)    // 追加
product_name?: string;
```

#### [Low] `history.service.ts` のログに userId を平文出力
**ファイル**: `backend/src/history/history.service.ts` L41, L62

```typescript
this.logger.log(`履歴取得: userId=${userId}, judgment=${judgment}`);
```

`userId` はユーザー識別情報であり、ログ収集基盤への平文出力はプライバシーリスクになりうる。
`implementation_rules.md` 「ログにアレルギー設定の具体値を出力しない（マスク処理が必要）」に準拠し、
userId のマスク（例: `userId=${userId.slice(0, 8)}...`）を検討すること。

#### [Info] `history.controller.ts` が `ScanHistoryRecord` 型を `scan-history.repository` から直接 import
**ファイル**: `backend/src/history/history.controller.ts` L16

```typescript
import type { ScanHistoryRecord } from './scan-history.repository';
```

これは `import type`（型のみ）であり実行時依存はない。Completion criteria の
「`ScanHistoryRepository` を直接 import していない」要件は PASS（`ScanHistoryRecord` 型と
`ScanHistoryRepository` クラスは別物）。
将来的には `ScanHistoryRecord` 型を `history.service.ts` から re-export すれば
Controller が Repository ファイルを参照しない設計にできる。
