# Task 00260: 履歴編集・削除（Edit / DELETE /history/:id + Frontend UI）

| Field | Value |
|-------|-------|
| Status | completed |
| Created | 2026-05-22 |
| Completed | 2026-05-22 |
| Depends on | 00070 (History Frontend), 00060 (History Backend) |

---

## Background

`backend/src/history/history.controller.ts` には `GET /history`・`POST /history`・`PATCH /history/:id`（location のみ）が実装されており、`DELETE /history/:id` は未実装。`PATCH /history/:id` も `product_name`・`store_name`・`memo` を受け付けない。

`backend/prisma/schema.prisma` の `ScanHistory` モデルに `memo` フィールドが存在しない。

フロントエンドでは `HistoryCard` に編集・削除ボタンがなく、`useHistory` Hook に mutation がなく、`history.api.ts` にも対応する関数がない。

---

## Requirements

### DB スキーマ
- R0: `backend/prisma/schema.prisma` の `ScanHistory` モデルに `memo String?` を追加し、`prisma migrate dev` でカラムを追加する（NULL 許容、ダウンタイムなし）

### Backend — PATCH 拡張
- R1: `backend/src/history/dto/patch-history.dto.ts`（新規）を作成し、以下を定義する
  - `@IsOptional() @IsString() @MaxLength(200) product_name?: string | null`
  - `@IsOptional() @IsString() @MaxLength(100) store_name?: string | null`
  - `@IsOptional() @IsString() @MaxLength(500) memo?: string | null`
  - `@IsOptional() @ValidateNested() location?:` （既存の location 更新との互換性維持）
- R2: `ScanHistoryRecord` 型に `memo: string | null` を追加する
- R3: `ScanHistoryRepository` に `update(id, data: { productName?, storeName?, memo? }): Promise<void>` を追加する。`storeName` が渡された場合、`location` JSONB の `store_name` のみ更新（lat/lng は既存値を維持。findById で取得した location を merge する）
- R4: `HistoryService` に `updateHistory(id, userId, data): Promise<void>` を追加する（ownership check → ForbiddenException、not found → NotFoundException）
- R5: `HistoryController` の `PATCH /history/:id` を新しい `PatchHistoryDto` で拡張する（既存の location 更新との互換性維持）

### Backend — DELETE 追加
- R6: `ScanHistoryRepository` に `deleteById(id: string): Promise<void>` を追加する（物理削除）
- R7: `HistoryService` に `deleteHistory(id, userId): Promise<void>` を追加する（ownership check）
- R8: `HistoryController` に `DELETE /history/:id` を追加する（Cookie なしで 401、他ユーザー 403、not found 404、成功 204）

### Frontend
- R9: `HistoryItem` 型に `memo: string | null` を追加する
- R10: `history.api.ts` に `patchHistory(id, data)` と `deleteHistory(id)` を追加する
- R11: `useHistory.ts` に `updateHistoryMutation`・`deleteHistoryMutation`（useMutation）を追加する。成功後に `queryClient.invalidateQueries({ queryKey: ['history'] })` を実行する
- R12: `HistoryCard.tsx` に以下を追加する
  - `onEdit?: (item: HistoryItem) => void` と `onDelete?: (id: string) => Promise<void>` Props
  - `isOwner: boolean` Props。`true` のときのみ編集・削除ボタンを表示
  - `memo` が存在する場合は表示
  - 削除ボタン: `window.confirm(t('deleteConfirm'))` → `onDelete(item.id)`
  - 編集ボタン: `onEdit(item)` を呼ぶ
- R13: `history/page.tsx` に編集モーダル（state + インラインフォーム）を追加する
  - 3フィールド: 商品名（text）・店舗名（text）・メモ（textarea）
  - 保存時: `updateHistoryMutation.mutate({ id, ...data })`
  - `userId` は既存の取得方法を確認すること（Cookie / useUser フック）
  - `HistoryCard` に `isOwner={item.userId === userId}`・`onEdit`・`onDelete={deleteHistoryMutation.mutate}` を渡す
- R14: i18n — `ja/history.json` と `en/history.json` に以下のキーを追加する
  - `editButton`・`deleteButton`
  - `deleteConfirm`・`deleteDeleting`
  - `editModal.title`・`editModal.productName`・`editModal.storeName`・`editModal.memo`・`editModal.save`・`editModal.cancel`
  - `memoLabel`
- R15: `as any` / `@ts-ignore` を使用しない。`console.log` をバックエンドに書かない（Logger 使用）
- R16: `docs/design/api.md` に `DELETE /history/:id` と拡張された `PATCH /history/:id` の仕様を追記する

---

## Implementation plan

### Phase 1: DB マイグレーション
- `schema.prisma` の `ScanHistory` モデルに `memo String?` を追加
- `pnpm --filter backend prisma migrate dev --name add_memo_to_scan_histories` を実行

### Phase 2: Backend — dto / repository / service / controller
- `dto/patch-history.dto.ts` 新規作成
- `scan-history.repository.ts` に `update` と `deleteById` を追加、`ScanHistoryRecord` に `memo` 追加
- `history.service.ts` に `updateHistory` と `deleteHistory` を追加
- `history.controller.ts` に `PATCH :id` 拡張と `DELETE :id` 追加

### Phase 3: Backend テスト
- `history.service.spec.ts` に `updateHistory`・`deleteHistory` のテスト追加
- `scan-history.repository.spec.ts` に `update`・`deleteById` のテスト追加

### Phase 4: Frontend 型・API・Hook
- `history.types.ts` に `memo` 追加
- `history.api.ts` に `patchHistory`・`deleteHistory` 追加
- `useHistory.ts` に mutation 2件追加

### Phase 5: Frontend UI
- `HistoryCard.tsx` に編集・削除ボタン + memo 表示追加
- `history/page.tsx` に編集モーダル追加

### Phase 6: i18n + docs
- `ja/history.json`・`en/history.json` にキー追加
- `docs/design/api.md` に仕様追記

---

## Files to modify

| File | Action |
|------|--------|
| `backend/prisma/schema.prisma` | `memo String?` 追加 |
| `backend/src/history/dto/patch-history.dto.ts` | 新規作成 |
| `backend/src/history/scan-history.repository.ts` | `ScanHistoryRecord.memo` + `update` + `deleteById` 追加 |
| `backend/src/history/history.service.ts` | `updateHistory` + `deleteHistory` 追加 |
| `backend/src/history/history.controller.ts` | PATCH 拡張 + DELETE 追加 |
| `backend/src/history/history.service.spec.ts` | テスト追加 |
| `backend/src/history/scan-history.repository.spec.ts` | テスト追加 |
| `frontend/src/app/history/history.types.ts` | `memo` 追加 |
| `frontend/src/lib/api/history.api.ts` | `patchHistory` + `deleteHistory` 追加 |
| `frontend/src/hooks/useHistory.ts` | mutation 2件追加 |
| `frontend/src/components/HistoryCard.tsx` | 編集・削除ボタン + memo 表示 |
| `frontend/src/app/history/page.tsx` | 編集モーダル + isOwner/onEdit/onDelete を HistoryCard に渡す |
| `frontend/public/locales/ja/history.json` | i18n キー追加 |
| `frontend/public/locales/en/history.json` | i18n キー追加 |
| `docs/design/api.md` | PATCH 拡張 + DELETE 仕様追記 |

---

## Tests to add

### history.service.spec.ts
| シナリオ | 期待結果 |
|----------|----------|
| `updateHistory` 正常系 | `repository.update` が呼ばれる |
| `updateHistory` not found | `NotFoundException` |
| `updateHistory` 他ユーザー | `ForbiddenException` |
| `deleteHistory` 正常系 | `repository.deleteById` が呼ばれる |
| `deleteHistory` not found | `NotFoundException` |
| `deleteHistory` 他ユーザー | `ForbiddenException` |

### scan-history.repository.spec.ts
| シナリオ | 期待結果 |
|----------|----------|
| `update` 正常系 | `prisma.scanHistory.update` が呼ばれる |
| `deleteById` 正常系 | `prisma.scanHistory.delete` が `{ where: { id } }` で呼ばれる |

---

## Completion criteria

- [ ] `grep "memo" backend/prisma/schema.prisma` でヒット件数 1 以上
- [ ] `grep "patch-history.dto" backend/src/history/history.controller.ts` でヒット件数 1 以上
- [ ] `grep "updateHistory\|deleteHistory" backend/src/history/history.service.ts` でヒット件数 2 以上
- [ ] `grep "Delete\|DELETE" backend/src/history/history.controller.ts` でヒット件数 1 以上
- [ ] `grep "ScanHistoryRepository" backend/src/history/history.controller.ts` でヒット件数 0（Controller が Repository を直接 import していない）
- [ ] `grep "memo" frontend/src/app/history/history.types.ts` でヒット件数 1 以上
- [ ] `grep "patchHistory\|deleteHistory" frontend/src/lib/api/history.api.ts` でヒット件数 2 以上
- [ ] `grep "updateHistoryMutation\|deleteHistoryMutation" frontend/src/hooks/useHistory.ts` でヒット件数 2 以上
- [ ] `grep "onDelete\|onEdit\|isOwner" frontend/src/components/HistoryCard.tsx` でヒット件数 3 以上
- [ ] `grep "editModal\|deleteButton\|deleteConfirm" frontend/public/locales/ja/history.json` でヒット件数 3 以上
- [ ] `grep "editModal\|deleteButton\|deleteConfirm" frontend/public/locales/en/history.json` でヒット件数 3 以上
- [ ] `HistoryCard.tsx` が `fetch` を直接呼ばない（`grep "fetch(" frontend/src/components/HistoryCard.tsx` でヒット件数 0）
- [ ] `grep "DELETE.*history" docs/design/api.md` でヒット件数 1 以上
- [ ] `as any` が新規・編集ファイルに含まれない
- [ ] `console.log` がバックエンド編集ファイルに含まれない
- [ ] `pnpm --filter backend test` で `history.service.spec.ts`・`scan-history.repository.spec.ts` の全テストが PASS
- [ ] `pnpm --filter backend typecheck` がエラー 0 件
- [ ] `pnpm --filter frontend typecheck` がエラー 0 件
- [ ] `pnpm --filter frontend test` が全テスト PASS

---

## Risks

| リスク | 回避方針 |
|--------|----------|
| `storeName` 更新で lat/lng を失う | `repository.update` で `storeName` 指定時は `findById` して既存 location を merge する |
| 既存 `PATCH /history/:id`（location のみ）との後方互換 | `PatchHistoryDto` で `location` もオプショナルで受け付ける |
| `window.confirm` が iOS Safari でブロックされる場合がある | MVP では `window.confirm` を使用。後続タスクでカスタムモーダルに置き換え可能な設計（Props インターフェースは変えない） |
| `onDelete` を渡していない「みんなのスキャン」タブの `HistoryCard` | `onDelete?`・`onEdit?`・`isOwner` を Optional にし、false/undefined のときボタン非表示 |

---

## Implementation summary

### Phase 1: DB マイグレーション
- `backend/prisma/schema.prisma` の `ScanHistory` モデルに `memo String?` を追加（L95）
- `backend/prisma/migrations/20260522000000_add_memo_to_scan_histories/migration.sql` を手動作成（ALTER TABLE ADD COLUMN IF NOT EXISTS）
- ローカル DB が不正な状態のため `prisma migrate dev` は実行不可のため migration SQL ファイルを直接作成した（Plan deviation 参照）

### Phase 2: Backend
- `backend/src/history/dto/patch-history.dto.ts` を新規作成（PatchHistoryDto・PatchLocationDto）
- `backend/src/history/scan-history.repository.ts`:
  - `ScanHistoryRecord` に `memo: string | null` を追加（L33）
  - `UpdateScanHistoryData` 型を追加（L6-10）
  - `findByUser`・`findById`・`create` の select / マッピングに `memo` を追加
  - `update()` メソッドを追加（storeName 更新時は findById で lat/lng を保持して merge）（L186-212）
  - `deleteById()` メソッドを追加（L214-223）
- `backend/src/history/history.service.ts`:
  - `updateHistory()` メソッドを追加（ownership check → update → location update 後方互換）（L98-132）
  - `deleteHistory()` メソッドを追加（ownership check → deleteById）（L134-154）
- `backend/src/history/history.controller.ts`:
  - インライン DTO を廃止し `PatchHistoryDto` を使用するよう変更
  - `PATCH :id` を `updateHistory` に更新
  - `DELETE :id` を追加（`@HttpCode(HttpStatus.NO_CONTENT)` で 204 返却）

### Phase 3: Backend テスト
- `history.service.spec.ts`: `updateHistory`・`deleteHistory` の6テストケース追加（24件全 PASS）
- `scan-history.repository.spec.ts`: `update`・`deleteById` のテストケース追加
- `history.controller.spec.ts`: `makeRecord` に `memo` 追加、`updateLocation` → `updateHistory` に更新、`DELETE /history/:id` テスト追加

### Phase 4: Frontend 型・API・Hook
- `frontend/src/app/history/history.types.ts`: `HistoryItem.memo: string | null` 追加・`PatchHistoryBody` 型追加
- `frontend/src/lib/api/history.api.ts`: `patchHistory`・`deleteHistory` 関数を追加
- `frontend/src/hooks/useHistory.ts`: `updateHistoryMutation`・`deleteHistoryMutation` を追加（成功後 `queryClient.invalidateQueries({ queryKey: ['history'] })`）

### Phase 5: Frontend UI
- `frontend/src/components/HistoryCard.tsx`: `isOwner?`・`onEdit?`・`onDelete?` Props 追加、memo 表示、編集・削除ボタン追加
- `frontend/src/app/history/page.tsx`: `getUser()` で userId 取得、編集モーダル（インライン）追加、`HistoryCard` に `isOwner`・`onEdit`・`onDelete` を渡す

### Phase 6: i18n + docs
- `frontend/public/locales/ja/history.json`: `editButton`・`deleteButton`・`deleteConfirm`・`deleteDeleting`・`memoLabel`・`editModal.*` を追加
- `frontend/public/locales/en/history.json`: 同上（英語）
- `docs/design/api.md`: `PATCH /history/:id` の拡張仕様と `DELETE /history/:id` の仕様を追記

### テスト修正（型エラー起因）
- `frontend/src/hooks/useHistory.test.ts`: `makeItem` に `memo: null` を追加
- `frontend/src/components/HistoryCard.test.tsx`: `makeItem` に `memo: null` を追加

## Plan deviation

- **prisma migrate dev 未実行**: ローカル DB（shadow database）が不整合状態でマイグレーションコマンドが `P3006` エラーで失敗した。既存マイグレーションのパターンに倣い、`20260522000000_add_memo_to_scan_histories/migration.sql` を手動作成した。本番環境へのデプロイ時には `prisma migrate deploy` を実行すること。
- **history.controller.spec.ts を変更**: `Files to modify` に含まれていないが、`history.controller.ts` で `updateLocation` → `updateHistory` への変更に伴い既存テストが壊れるため、最小限の修正（`makeRecord` に `memo` 追加、mock 参照名変更、DELETE テスト追加）を行った。
- **HistoryCard.test.tsx を変更**: `Files to modify` に含まれていないが、`HistoryItem.memo` 必須フィールド追加で型エラーが発生するため `memo: null` を追加した。
- **既存 `gemini-prompt.builder.spec.ts` の4件失敗**: 本タスクの変更とは無関係（既存の不具合）。本タスクのスコープ外のため対処しない。

## Review comments

## 自動評価（2026-05-22 14:00） - ラウンド 1

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 1 / Info: 4）

### Threshold 達成状況
- 1. 動作性: OK（typecheck 0件・unit test 全PASS報告。Completion criteria grep 全件クリア）
- 2. セキュリティ: OK（Medium 以上 0 件）
- 3. カバレッジ: OK（service.spec / repository.spec / controller.spec にスコープ内全シナリオあり）
- 4. 敵対的観点: OK（IDOR: 所有権チェックあり / DoS: グローバルスロットラー 60秒100回）
- 5. 保守性: OK（アーキテクチャ層違反 0 / アンチパターン再導入 0 / マジックナンバー 0）

---

### Low / Info（PASS 維持・次タスク繰越し可能）

#### [Info-1] HistoryCard.tsx の JUDGMENT_LABEL がハードコード（既存コードからの継続）
`frontend/src/components/HistoryCard.tsx:12-15`
```typescript
const JUDGMENT_LABEL: Record<'ng' | 'partial' | 'ok', string> = {
  ng: '含む',
  partial: '一部含む',
  ok: 'なし',
}
```
本タスクで `HistoryCard.tsx` を変更したが、既存の `JUDGMENT_LABEL` を i18n キーに置き換えなかった。
`anti_patterns.md` #17 / `coding_rules.md` i18n セクション違反。既存コードからの継続のため本タスクスコープ内の新規導入ではないが、将来の英語化時に漏れるリスクがある。
- 修正案: `history.json` に `judgment.ng` / `judgment.partial` / `judgment.ok` を追加し、`t('judgment.ng')` 等で参照する。

#### [Info-2] deleteDeleting i18n キーが定義されているが未使用
`frontend/public/locales/ja/history.json:22` / `en/history.json:22` に `deleteDeleting` キーが追加されているが、`HistoryCard.tsx` でも `page.tsx` でも削除中のローディング表示に使われていない。
- 修正案: `HistoryCard.tsx` の削除ボタンを `deleteHistoryMutation.isPending` で disabled にし `t('deleteDeleting')` 表示を追加する（ただし `onDelete` は `Promise<void>` のため mutation の状態を Props 経由で渡す必要がある）。MVP では未使用のまま残しても実害はない。

#### [Low-1] repository.update() で storeName: null を渡すと location JSONB が不完全な状態になる
`backend/src/history/scan-history.repository.ts:197-201`
```typescript
updateData.location = {
  store_name: data.storeName,   // null になりうる
  lat: existingLocation?.lat ?? 0,
  lng: existingLocation?.lng ?? 0,
};
```
`store_name` に `null` を代入した場合、`{ store_name: null, lat: X, lng: Y }` という中途半端な JSONB が保存される。また既存 location が `null` の場合 lat/lng が `0` になる（経度0・緯度0 = ギニア湾沖）。
- 修正案: `storeName` が `null` の場合は `updateData.location = null` とすることを検討。ただし要件（R3）に「store_name のみ更新」とあるため、null クリアが本当に求められるか仕様確認が先決。現状 MVP 的には許容範囲。

#### [Info-3] history.controller.ts が scan-history.repository から型 import している（architecture.md 境界の灰色地帯）
`history.controller.ts:23` の `import type { ScanHistoryRecord } from './scan-history.repository'`
実行時依存ではなく型 import のため直接的なアーキテクチャ違反ではないが、理想的には `history.service.ts` 側で `ScanHistoryRecord` を re-export して Controller から Repository への型依存を切ることが望ましい。

#### [Info-4] getUser() 失敗時にエラーハンドリングがない
`frontend/src/app/history/page.tsx:38`
```typescript
void getUser().then((user) => { setUserId(user.id) })
```
`.catch()` がないため、Cookie 切れ等で API が 401 を返した場合にコンソールエラーが残る。`userId` は `null` のままになるため `isOwner` が `false` になり編集・削除ボタンが表示されないので安全ではあるが、ユーザーへのフィードバックがない。
- 修正案: `.catch(() => {/* userId は null のまま: isOwner=false で編集不可 */})` を追加する。

