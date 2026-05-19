# Task 00094: GET /history の cursor パラメータを before に改名

| Field | Value |
|-------|-------|
| Status | completed |
| Created | 2026-05-18 |
| Depends on | 00060 (History Backend), 00070 (History Frontend) |

---

## Background

`GET /history` のクエリパラメータ名が `cursor`（ISO8601 文字列）であり、「この時刻より前の履歴を返す」という意味がパラメータ名から直感的に読み取れない。`before` に改名することで API の意図を明示する。

影響するファイルは以下の通り（すべて実装済み）:

- `backend/src/history/dto/get-history.dto.ts` L6–L7: `cursor?: string` フィールド
- `backend/src/history/history.service.ts` L31: `query.cursor` 参照・L56–L59: `next_cursor` キー名
- `backend/src/history/scan-history.repository.ts` L32: `FindByUserOptions.cursor?: Date`
- `frontend/src/app/history/history.types.ts` L14–L17: `HistoryListResponse.next_cursor`
- `frontend/src/lib/api/history.api.ts` L11–L12: `GetHistoryParams.cursor`・L21–L23: `query.set('cursor', ...)`
- `frontend/src/hooks/useHistory.ts` L37: `getNextPageParam` の `lastPage.next_cursor`
- 各テストファイル: `next_cursor` / `cursor` の参照箇所

レスポンスの `next_cursor` キー名も `next_before` に変更することでフロントエンド・バックエンド間の命名を統一する。

設計の根拠となる正典:
- `.claude/rules/architecture.md` — APIエンドポイント一覧（`GET /history` の仕様）
- `.claude/rules/patterns.md` — パターン4（カーソルベースページネーション）
- `.claude/rules/coding_rules.md` — 命名規約

---

## Requirements

- R1: `GetHistoryDto.cursor` を `before` に改名する（`backend/src/history/dto/get-history.dto.ts`）。`@IsISO8601()` デコレーターは維持する
- R2: `HistoryService.getHistory` 内の `query.cursor` 参照を `query.before` に変更し、`HistoryListResult.next_cursor` 型フィールドを `next_before` に改名する（`backend/src/history/history.service.ts`）
- R3: `FindByUserOptions.cursor?: Date` を `before?: Date` に改名する（`backend/src/history/scan-history.repository.ts`）。Repository 内部の `cursor` 変数参照もすべて `before` に統一する
- R4: `HistoryListResponse.next_cursor` を `next_before` に改名する（`frontend/src/app/history/history.types.ts`）
- R5: `GetHistoryParams.cursor` を `before` に改名し、`query.set('cursor', ...)` を `query.set('before', ...)` に変更する（`frontend/src/lib/api/history.api.ts`）
- R6: `useHistory` の `getNextPageParam` 内 `lastPage.next_cursor` を `lastPage.next_before` に変更する（`frontend/src/hooks/useHistory.ts`）
- R7: バックエンドのユニットテストファイル（`history.service.spec.ts` / `scan-history.repository.spec.ts`）内の `next_cursor` / `cursor` 参照をすべて `next_before` / `before` に変更する
- R8: フロントエンドのテストファイル（`useHistory.test.ts`）内の `next_cursor` 参照を `next_before` に変更する
- R9: `pnpm --filter backend typecheck` がエラー 0件で終了する
- R10: `pnpm --filter frontend typecheck` がエラー 0件で終了する
- R11: `as any` / `@ts-ignore` を新規追加しない
- R12: `console.log` を新規追加しない

---

## Implementation plan

### Phase 1: バックエンド DTO 変更

- `get-history.dto.ts` の `cursor` フィールドを `before` に改名する
- クエリパラメータ名を `@ApiProperty` 等で明示している場合は `before` に変更する（TBD: generator が `@ApiProperty` の有無を確認すること）

### Phase 2: バックエンド Service / Repository 変更

- `history.service.ts`: `query.cursor` を `query.before` に、`HistoryListResult.next_cursor` 型定義を `next_before` に、`next_cursor` 変数を `next_before` に変更する
- `scan-history.repository.ts`: `FindByUserOptions.cursor` を `before` に、内部変数 `cursor` を `before` に変更する

### Phase 3: フロントエンド変更

- `history.types.ts`: `HistoryListResponse.next_cursor` を `next_before` に変更する
- `history.api.ts`: `GetHistoryParams.cursor` を `before` に、`query.set('cursor', ...)` を `query.set('before', ...)` に変更する
- `useHistory.ts`: `getNextPageParam` の `lastPage.next_cursor` を `lastPage.next_before` に変更する

### Phase 4: テストファイルの変更

- `history.service.spec.ts`: `next_cursor` の参照（L57, L78, L79）を `next_before` に変更する。`cursor:` のプロパティ参照を `before:` に変更する
- `scan-history.repository.spec.ts`: `cursor` / `before` の変数名が該当する箇所を変更する（Repository 型定義変更に追従）
- `useHistory.test.ts`: `next_cursor` の参照（`makeResponse` 関数の `next_cursor` キー L26-L29、mock 返却値）を `next_before` に変更する

---

## Files to modify

| File | Action |
|------|--------|
| `backend/src/history/dto/get-history.dto.ts`（編集） | `cursor` → `before` |
| `backend/src/history/history.service.ts`（編集） | `query.cursor` → `query.before`、`next_cursor` → `next_before` |
| `backend/src/history/scan-history.repository.ts`（編集） | `FindByUserOptions.cursor` → `before`、内部変数 `cursor` → `before` |
| `frontend/src/app/history/history.types.ts`（編集） | `HistoryListResponse.next_cursor` → `next_before` |
| `frontend/src/lib/api/history.api.ts`（編集） | `GetHistoryParams.cursor` → `before`、クエリパラメータ名 `'cursor'` → `'before'` |
| `frontend/src/hooks/useHistory.ts`（編集） | `lastPage.next_cursor` → `lastPage.next_before`、`cursor: pageParam` → `before: pageParam` |
| `backend/src/history/history.service.spec.ts`（編集） | `next_cursor` → `next_before`、`cursor:` → `before:` の参照変更 |
| `backend/src/history/scan-history.repository.spec.ts`（編集） | 型定義変更に追従した変数名変更 |
| `frontend/src/hooks/useHistory.test.ts`（編集） | `next_cursor` → `next_before` の参照変更 |

---

## Tests to add

新規テストの追加は不要。既存テストを R7・R8 の通り更新する。

---

## Completion criteria

- [ ] `backend/src/history/dto/get-history.dto.ts` に `cursor` フィールドが存在しない（`grep "cursor" backend/src/history/dto/get-history.dto.ts` でヒット件数 0）
- [ ] `backend/src/history/dto/get-history.dto.ts` に `before` フィールドが存在する（`grep "before" backend/src/history/dto/get-history.dto.ts` でヒット）
- [ ] `backend/src/history/history.service.ts` に `next_cursor` が存在しない（`grep "next_cursor" backend/src/history/history.service.ts` でヒット件数 0）
- [ ] `backend/src/history/history.service.ts` に `next_before` が存在する（`grep "next_before" backend/src/history/history.service.ts` でヒット）
- [ ] `backend/src/history/scan-history.repository.ts` の `FindByUserOptions` 型に `cursor` フィールドが存在しない（`grep "cursor\?" backend/src/history/scan-history.repository.ts` でヒット件数 0）
- [ ] `frontend/src/app/history/history.types.ts` に `next_cursor` が存在しない（`grep "next_cursor" frontend/src/app/history/history.types.ts` でヒット件数 0）
- [ ] `frontend/src/app/history/history.types.ts` に `next_before` が存在する（`grep "next_before" frontend/src/app/history/history.types.ts` でヒット）
- [ ] `frontend/src/lib/api/history.api.ts` に `query.set('cursor'` が存在しない（`grep "'cursor'" frontend/src/lib/api/history.api.ts` でヒット件数 0）
- [ ] `frontend/src/lib/api/history.api.ts` に `query.set('before'` が存在する（`grep "'before'" frontend/src/lib/api/history.api.ts` でヒット）
- [ ] `frontend/src/hooks/useHistory.ts` に `next_cursor` が存在しない（`grep "next_cursor" frontend/src/hooks/useHistory.ts` でヒット件数 0）
- [ ] `pnpm --filter backend test` で `history.service.spec.ts`・`scan-history.repository.spec.ts` の全テストが PASS する（FAIL 0件）
- [ ] `pnpm --filter frontend test` で `useHistory.test.ts` の全テストが PASS する（FAIL 0件）
- [ ] `pnpm --filter backend typecheck` がエラー 0件で終了する
- [ ] `pnpm --filter frontend typecheck` がエラー 0件で終了する
- [ ] `as any` が編集ファイルに新規追加されていない（`grep -r "as any" backend/src/history/ frontend/src/app/history/ frontend/src/lib/api/history.api.ts frontend/src/hooks/useHistory.ts` でヒット件数が変更前から増加していない）

---

## Risks

| リスク | 回避方針 |
|--------|----------|
| テストの `cursor` / `next_cursor` 参照の見落としによるコンパイルエラー | generator は変更後に `pnpm -r typecheck` と `pnpm -r test` を実行し、エラーが出た箇所をすべて修正してから完了とする |
| `useHistory.ts` の `getNextPageParam` 型引数（`string \| undefined`）が `next_before` を参照できない | `HistoryListResponse` 型の変更（R4）が先行していれば型推論が追従する。Phase 3 は `history.types.ts` → `history.api.ts` → `useHistory.ts` の順で変更する |
| `useHistory.test.ts` の `makeResponse` がオブジェクトリテラルで `next_cursor` キーを直書きしている | L26–L29 の `makeResponse` 関数を `next_before` キーに変更することで、`HistoryListResponse` 型との整合性が型チェックで担保される |

---

## Implementation summary

completed_date: 2026-05-19

### Phase 1: バックエンド DTO 変更
- `backend/src/history/dto/get-history.dto.ts` L7: `cursor?: string` を `before?: string` に改名。`@IsISO8601()` デコレーターは維持。

### Phase 2: バックエンド Service / Repository 変更
- `backend/src/history/history.service.ts` L10: `HistoryListResult.next_cursor` を `next_before` に改名
- `backend/src/history/history.service.ts` L30-61: `query.cursor` → `query.before`、ローカル変数 `cursor` → `before`、`next_cursor` → `next_before`
- `backend/src/history/scan-history.repository.ts` L31: `FindByUserOptions.cursor?: Date` を `before?: Date` に改名
- `backend/src/history/scan-history.repository.ts` L48-54: 分割代入変数 `cursor` → `before`、`lt: cursor` → `lt: before`

### Phase 3: フロントエンド変更
- `frontend/src/app/history/history.types.ts` L16: `HistoryListResponse.next_cursor` を `next_before` に改名
- `frontend/src/lib/api/history.api.ts` L11: `GetHistoryParams.cursor` を `before` に改名、L22: `query.set('cursor', ...)` を `query.set('before', ...)` に変更
- `frontend/src/hooks/useHistory.ts` L35: `cursor: pageParam` → `before: pageParam`、L37: `lastPage.next_cursor` → `lastPage.next_before`

### Phase 4: テストファイルの変更
- `backend/src/history/history.service.spec.ts`: `next_cursor` → `next_before`（L57, L77-80）、`cursor:` → `before:`（L59, L93, L110）、`{ cursor: 'invalid-date' }` → `{ before: 'invalid-date' }`（L120）、describe テキスト更新
- `backend/src/history/scan-history.repository.spec.ts`: `{ cursor, limit: 20 }` → `{ before, limit: 20 }`（L72）、変数名 `cursor` → `before`（L70,74,78）、describe テキスト更新（L40, L67）
- `frontend/src/hooks/useHistory.test.ts`: `makeResponse` 引数 `next_cursor` → `next_before`（L24-29）、`cursor: undefined` → `before: undefined`（L89）、変数名 `cursor` → `before`（L94,96,117）、テスト description 更新（L93）

---

## Plan deviation

none

---

## Review comments

## 自動評価（2026-05-19 00:00） - ラウンド 1

### 総合判定
**[PASS]** （Critical: 0 / High: 0 / Medium: 0 / Low: 0 / Info: 1）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 全15項目通過、typecheck backend 0件・frontend 0件、unit tests 17件全PASS）
- 2. セキュリティ: ✅（Medium 以上 0件）
- 3. カバレッジ: ✅（既存テスト更新タスク、新規ロジックなし）
- 4. 敵対的観点: ✅（`before` フィールドは `@IsISO8601()` + `isNaN` 二重防御。Critical/High 0件）
- 5. 保守性: ✅（層違反 0 / アンチパターン 0 / マジックナンバー 0 / 冗長コメント 0）

### 改善提案（PASS 時 / 次タスク繰越し可）
- [Info][docs] `docs/design/api.md` L107 に `cursor: string` の記述が残っている。`before: string` に更新を推奨（`docs/api/openapi.yaml` L164 の `name: cursor` および L397 の `nextCursor` も同様）。本タスクの Files to modify に含まれていなかったため FAIL 対象外。次タスクで spec-docs-syncer に委譲するか手動修正を推奨。
- [Info][lint] `backend/src/history/scan-history.repository.spec.ts` L103/L112 に `@typescript-eslint/no-unsafe-assignment` エラー（`prisma.scanHistory.findMany.mock.calls[0][0]` パターン）が 6件。本タスクの rename 変更とは無関係な判定フィルターテストの既存コードに起因する。`expect.objectContaining` を使う形に統一すれば解消可能。
