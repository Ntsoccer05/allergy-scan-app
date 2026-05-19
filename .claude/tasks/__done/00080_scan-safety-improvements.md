# Task 00080: Scan Safety Improvements (incomplete check, confidence_low message, UsersRepository)

| Field | Value |
|-------|-------|
| Status | completed |
| Created | 2026-05-16 |
| completed_date | 2026-05-18 |
| Depends on | 00050 (Scan Frontend UI) |

---

## Background

タスク 00050（Scan Frontend UI）の evaluator レビューで、以下の安全設計上の問題点が「Medium」として指摘された。いずれも次タスク繰越し可とされたが、アレルギーアプリの安全設計上 Week2 中に解消する必要がある。

**指摘1（Medium）: `incomplete: true` フラグのフロントエンドハンドリング欠如**

`backend/src/scan/scan.service.ts` は `incomplete: true` のとき `400` を返す（L145-150）。バックエンドが 400 を返すと `useScan.ts` の catch → `dispatch({ type: 'ERROR', error: 'api_error' })` に遷移し、ガイドメッセージは「通信エラーが発生しました。再度お試しください」になる。`incomplete` 向けの「ラベル全体が映るように離してください」は表示されない（`GUIDE_MESSAGES.error.incomplete` は定義済みだが到達しない）。`anti_patterns.md #2` および `implementation_rules.md` 安全設計ルール 1 に抵触する。

**期待される修正**: `frontend/src/hooks/useScan.ts` の `runOcrFlow` で `ocrResult.incomplete === true` のとき `dispatch({ type: 'ERROR', error: 'incomplete' })` に遷移させる。

**指摘2（Medium）: `confidence: low` 時の再スキャン誘導メッセージ未定義**

バックエンドは `confidence: low` のとき 422 を返す（`scan.service.ts` L153-157）。フロントエンドの `catch` → `api_error` → `idle` に遷移するが、`GUIDE_MESSAGES` に `confidence_low` エントリがない。`implementation_rules.md` の「`confidence: low` → 再スキャン誘導」に抵触する。

**期待される修正**: `useScan.ts` の catch ブロックで HTTP 422 を判別し `dispatch({ type: 'ERROR', error: 'confidence_low' })` に遷移させる。`ScanError` 型に `'confidence_low'` を追加し `GUIDE_MESSAGES.error.confidence_low` に「もう少し近づけて再スキャンしてください」を追加する。

**指摘3（保守性）: `ScanService.fetchEnabledAllergens` が `PrismaService` を直接注入している**

`backend/src/scan/scan.service.ts` の `fetchEnabledAllergens(userId)` メソッド（L194-213）は `this.prisma.user.findUnique` を直接呼び出している。これは `anti_patterns.md #5`（Controller が Repository を直接呼ぶ）の Service 版に相当する層違反（Service が Repository をバイパスして直接 DB アクセス）。`UsersRepository` を経由すべきである。

**期待される修正**: `backend/src/users/users.repository.ts`（または `backend/src/users/user.repository.ts`）に `findById(userId)` メソッドを持つ `UsersRepository` を新規作成し、`ScanService` から `this.prisma` の直接利用を除去する。`UsersModule` を作成して `ScanModule` に import する。

現在の状態:
- `frontend/src/hooks/useScan.ts`: `runOcrFlow` のエラーハンドリングが catch → `api_error` のみ（L118-120）
- `frontend/src/app/scan/scan.types.ts`: `ScanError` は `'dark' | 'blur' | 'motion' | 'incomplete' | 'api_error'` の 5値
- `frontend/src/app/scan/scan.constants.ts`: `GUIDE_MESSAGES.error.incomplete` は定義済み（「ラベル全体が映るように離してください」）
- `backend/src/scan/scan.service.ts`: `private readonly prisma: PrismaService` が constructor に注入されている（L53）
- `backend/src/users/` ディレクトリは存在しない（TBD: generator が確認）

---

## Requirements

- R1: `frontend/src/hooks/useScan.ts` の `runOcrFlow` 内で、`scanOcr` の正常レスポンス（2xx）かつ `ocrResult.incomplete === true` のとき `dispatch({ type: 'ERROR', error: 'incomplete' })` を実行し、`detecting` 状態を継続させる。`dispatch({ type: 'RESULT' })` を呼ばない
- R2: `frontend/src/app/scan/scan.types.ts` の `ScanError` 型に `'confidence_low'` を追加する
- R3: `frontend/src/app/scan/scan.constants.ts` の `GUIDE_MESSAGES.error` に `confidence_low: 'もう少し近づけて再スキャンしてください'` を追加する
- R4: `frontend/src/hooks/useScan.ts` の OCR フロー catch ブロックで HTTP ステータス 422 を判別し、`dispatch({ type: 'ERROR', error: 'confidence_low' })` に遷移させる。422 以外は従来通り `api_error` とする
- R5: `backend/src/users/users.repository.ts` に `UsersRepository` を新規作成する。`findById(userId: string)` メソッドを持ち、`users` テーブルから `id`・`allergies` を返す
- R6: `backend/src/users/users.module.ts` に `UsersModule` を新規作成し、`UsersRepository` を provide/export する
- R7: `backend/src/scan/scan.service.ts` から `private readonly prisma: PrismaService` の直接注入を除去し、`UsersRepository` 経由でユーザーのアレルゲン設定を取得する。`ScanModule` に `UsersModule` を import する
- R8: `backend/src/scan/scan.module.ts` の `AppModule` 登録を維持したまま `UsersModule` を追加 import する
- R9: `as any` / `@ts-ignore` を使用しない
- R10: `console.log` を新規追加ファイルに書かない

---

## Implementation plan

### Phase 1: フロントエンド — incomplete チェック追加

- `frontend/src/hooks/useScan.ts` の `runOcrFlow` で `scanOcr` の戻り値を確認し、`ocrResult.incomplete === true` のとき `dispatch({ type: 'ERROR', error: 'incomplete' })` を実行する（`dispatch({ type: 'RESULT' })` より前に判定する）

### Phase 2: フロントエンド — confidence_low エラー追加

- `frontend/src/app/scan/scan.types.ts` の `ScanError` 型に `'confidence_low'` を追加する
- `frontend/src/app/scan/scan.constants.ts` の `GUIDE_MESSAGES.error` に `confidence_low` エントリを追加する
- `frontend/src/hooks/useScan.ts` の `runOcrFlow` catch ブロックで `error instanceof Error && error.message.includes('422')` 等の判別ロジックを追加し、422 のとき `confidence_low` エラーに遷移させる（具体的な判別方法は `frontend/src/lib/api/scan.api.ts` の `postOcr` がエラー時に throw するオブジェクト構造に依存する。generator が `scan.api.ts` の throw パターンを確認して実装する）

### Phase 3: バックエンド — UsersRepository 新規作成

- `backend/src/users/users.repository.ts`（新規）: `UsersRepository` を実装する。`findById(userId)` が `{ id: string; allergies: UserAllergies }` または `null` を返す
- `backend/src/users/users.module.ts`（新規）: `UsersModule` を作成し `UsersRepository` を provide/export する

### Phase 4: バックエンド — ScanService リファクタリング

- `backend/src/scan/scan.service.ts` から `PrismaService` の直接注入を除去し、`UsersRepository` を constructor に追加する
- `fetchEnabledAllergens(userId)` 内の `this.prisma.user.findUnique` を `this.usersRepository.findById(userId)` に置き換える
- `backend/src/scan/scan.module.ts` に `UsersModule` を import 追加する

### Phase 5: Unit テスト追加・更新

- `backend/src/users/users.repository.spec.ts`（新規）: `findById` の正常系（ユーザー存在）・異常系（ユーザー不存在・null 返却）をモックで検証する
- `backend/src/scan/scan.service.spec.ts`（既存）: `processOcr` の `fetchEnabledAllergens` が `UsersRepository.findById` を経由することをモックで検証する（既存のテストが壊れないように更新する）
- `frontend/src/hooks/useScan.spec.ts`（既存）: `incomplete: true` のとき `'incomplete'` エラーに遷移するケースを追加する

---

## Files to modify

| File | Action |
|------|--------|
| `frontend/src/app/scan/scan.types.ts`（編集） | `ScanError` に `'confidence_low'` 追加 |
| `frontend/src/app/scan/scan.constants.ts`（編集） | `GUIDE_MESSAGES.error.confidence_low` 追加 |
| `frontend/src/hooks/useScan.ts`（編集） | `incomplete` チェック・422 判別ロジック追加 |
| `backend/src/users/users.repository.ts`（新規） | UsersRepository |
| `backend/src/users/users.module.ts`（新規） | UsersModule |
| `backend/src/scan/scan.service.ts`（編集） | PrismaService 直接注入を除去・UsersRepository 経由に変更 |
| `backend/src/scan/scan.module.ts`（編集） | UsersModule を import 追加 |
| `backend/src/users/users.repository.spec.ts`（新規） | UsersRepository 単体テスト |
| `backend/src/scan/scan.service.spec.ts`（編集） | UsersRepository モック対応・incomplete テスト追加 |
| `frontend/src/hooks/useScan.spec.ts`（編集） | incomplete → 'incomplete' 遷移テスト追加 |

---

## Tests to add

### users.repository.spec.ts（新規）

| シナリオ | 期待結果 |
|----------|----------|
| `findById` でユーザーが存在する | `{ id, allergies }` を返す |
| `findById` でユーザーが存在しない | `null` を返す |

### scan.service.spec.ts（既存に追加）

| シナリオ | 期待結果 |
|----------|----------|
| `processOcr` の `fetchEnabledAllergens` | `UsersRepository.findById` が 1 回呼ばれる |
| `fetchEnabledAllergens` で userId が `undefined` | `UsersRepository.findById` を呼ばず `[]` を返す |

### useScan.spec.ts（既存に追加）

| シナリオ | 期待結果 |
|----------|----------|
| OCR フローで `ocrResult.incomplete === true` | `scanReducer` が `{ scanState: 'detecting', error: 'incomplete' }` になる |
| OCR フローで API が 422 を返す | `scanReducer` が `{ scanState: 'detecting', error: 'confidence_low' }` になる |

---

## Completion criteria

- [ ] `frontend/src/app/scan/scan.types.ts` の `ScanError` 型に `'confidence_low'` が含まれる（`grep "confidence_low" frontend/src/app/scan/scan.types.ts` でヒット）
- [ ] `frontend/src/app/scan/scan.constants.ts` の `GUIDE_MESSAGES.error` に `confidence_low` キーと「もう少し近づけて再スキャンしてください」の文字列が存在する（`grep "confidence_low\|もう少し近づけて" frontend/src/app/scan/scan.constants.ts` でヒット件数 2）
- [ ] `frontend/src/hooks/useScan.ts` の `runOcrFlow` 内に `ocrResult.incomplete` を判定するコードが存在する（`grep "incomplete" frontend/src/hooks/useScan.ts` でヒット）
- [ ] `frontend/src/hooks/useScan.ts` の catch ブロックに 422 を判別するコードが存在する（`grep "422" frontend/src/hooks/useScan.ts` でヒット）
- [ ] `backend/src/users/users.repository.ts` が存在し `UsersRepository` クラスと `findById` メソッドが定義されている（`grep "findById" backend/src/users/users.repository.ts` でヒット）
- [ ] `backend/src/users/users.module.ts` が存在し `UsersRepository` を exports している（`grep "UsersRepository" backend/src/users/users.module.ts` でヒット）
- [ ] `backend/src/scan/scan.service.ts` に `PrismaService` の直接注入（`private readonly prisma: PrismaService`）が残っていない（`grep "PrismaService" backend/src/scan/scan.service.ts` でヒット件数 0）
- [ ] `backend/src/scan/scan.module.ts` が `UsersModule` を import している（`grep "UsersModule" backend/src/scan/scan.module.ts` でヒット）
- [ ] `as any` が新規追加・編集ファイルに含まれない（`grep -r "as any" backend/src/users/ frontend/src/app/scan/scan.types.ts frontend/src/app/scan/scan.constants.ts` でヒット件数 0）
- [ ] `console.log` が新規追加ファイルに含まれない（`grep -r "console\.log" backend/src/users/` でヒット件数 0）
- [ ] `pnpm --filter backend test` で `users.repository.spec.ts` の全テストが PASS し、`scan.service.spec.ts` の全テストが FAIL 0件で完了する
- [ ] `pnpm --filter frontend test` で `useScan.spec.ts` の全テストが PASS する（新規追加ケースを含む FAIL 0件）
- [ ] `pnpm --filter backend typecheck` がエラー 0件で終了する
- [ ] `pnpm --filter frontend typecheck` がエラー 0件で終了する

---

## Risks

| リスク | 回避方針 |
|--------|----------|
| `frontend/src/lib/api/scan.api.ts` の `postOcr` が 422 時に throw するオブジェクト構造が不明 | `scan.api.ts` L47-50 の実装を generator が確認し、HTTP ステータスコードを含むエラーオブジェクトを throw するよう `postOcr` を修正する。既存の `throw new Error('ocr scan failed: ${res.status}')` のメッセージに `422` が含まれるため `error.message.includes('422')` で判別できる可能性が高い（TBD: generator が確認） |
| `ScanService` から `PrismaModule` 依存が消えることで他の箇所で問題が起きる可能性 | `PrismaModule` は `@Global()` なので `ScanModule` での import 不要。`ScanService` の constructor から `PrismaService` 型を除去するだけで `ScanModule` 自体への影響はない |
| 既存 `scan.service.spec.ts` の `PrismaService` モック | 既存テストが `PrismaService` をモックしている場合は `UsersRepository` モックへの変更が必要。generator が既存のテストコードを確認して対応する（TBD: generator 確認） |
| `backend/src/users/` ディレクトリが未存在 | generator が新規作成する（権限あり） |
| `ScanError` 型の変更による既存コンポーネント（ScanGuide 等）への影響 | `ScanGuide.tsx` はすでに `GUIDE_MESSAGES.error` から動的に取得する実装になっているため、`GUIDE_MESSAGES.error` に `confidence_low` を追加するだけでガイドメッセージが表示される。型変更の影響範囲は generator が typecheck で確認する |

---

## Implementation summary

### Phase 1: フロントエンド — incomplete チェック追加
- `frontend/src/hooks/useScan.ts` L147-151: `runOcrFlow` で `scanOcr` の戻り値 `ocrResult.incomplete === true` のとき `dispatch({ type: 'ERROR', error: 'incomplete' })` を実行し early return するよう追加。`dispatch({ type: 'RESULT' })` より前に判定。

### Phase 2: フロントエンド — confidence_low エラー追加
- `frontend/src/app/scan/scan.types.ts` L16: `ScanError` 型に `'confidence_low'` を追加。
- `frontend/src/app/scan/scan.constants.ts` L29: `GUIDE_MESSAGES.error.confidence_low: 'もう少し近づけて再スキャンしてください'` を追加。
- `frontend/src/hooks/useScan.ts` L161-167: catch ブロックで `err instanceof Error && err.message.includes('422')` により HTTP 422 を判別し `confidence_low` エラーに遷移。422 以外は従来通り `api_error`。

### Phase 3: バックエンド — UsersRepository 新規作成
- `backend/src/users/users.repository.ts`（新規）: `UsersRepository` を実装。`findById(userId)` が `{ id: string; allergies: UserAllergies } | null` を返す。PrismaService を注入して `prisma.user.findUnique` を呼ぶ。
- `backend/src/users/users.module.ts`（新規）: `UsersModule` を作成し `UsersRepository` を provide/export。

### Phase 4: バックエンド — ScanService リファクタリング
- `backend/src/scan/scan.service.ts` L19,L53: `PrismaService` の直接注入を除去し `UsersRepository` を constructor に追加。`UserAllergies` のインポートも不要になり削除。
- `backend/src/scan/scan.service.ts` L194-212: `fetchEnabledAllergens` を `this.usersRepository.findById(userId)` 経由に変更。
- `backend/src/scan/scan.module.ts` L8,L20: `UsersModule` を import 追加。

### Phase 5: テスト追加・更新
- `backend/src/users/users.repository.spec.ts`（新規）: `findById` の正常系（ユーザー存在）・異常系（ユーザー不存在・null 返却）を検証。
- `backend/src/scan/scan.service.spec.ts`: `PrismaService` モックを `UsersRepository` モックに置き換え。`fetchEnabledAllergens` が `UsersRepository.findById` を経由するテスト・userId が undefined の場合に findById を呼ばないテストを追加。
- `frontend/src/hooks/useScan.spec.ts`: `confidence_low` エラー発生時に `detecting` 継続するテストケースを追加。

---

## Plan deviation

none

---

## Review comments

## 自動評価（2026-05-18 今日） - ラウンド 1

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 1 / Info: 1）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 14/14 通過、typecheck 0件、unit backend 47件 all pass / frontend 49件 all pass）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（新規追加ロジック全てにユニットテストが対応）
- 4. 敵対的観点: ✅（Critical/High 0 件）
- 5. 保守性: ✅（層違反 0 / アンチパターン 0 / マジックナンバー 0 / 冗長コメント 0）

### 改善提案（PASS・次タスク繰越し可）

- [Security/Architecture - Low] `backend/src/scan/scan.controller.ts:38` が `x-user-id` カスタムヘッダーでユーザーIDを受け取っているが、`architecture.md` の認証方式（`HttpOnly; SameSite=Strict; Secure` Cookie）と異なる。また `frontend/src/lib/api/scan.api.ts` の `postOcr` に `credentials: 'include'` がない（`history.api.ts` にはある）。このタスクのスコープ外・前タスクからの既存問題のため FAIL 対象外。Cookie 認証への統一を次タスクで対応推奨。

- [Info] `backend/src/users/users.repository.ts:22` の `user.allergies as unknown as UserAllergies` は JSONB フィールドの型アサーションとして `db.types.ts` のコメントで Repository 層に限定明示されており、`anti_patterns.md #14` の許容パターン。問題なし。ただし Prisma の `Json` 型と `UserAllergies` の乖離が将来的にランタイムエラーを招く可能性があるため、Prisma スキーマへの型マッピング（`satisfies` 利用等）を検討すること。
