# Task 00140: みんなのスキャン（他ユーザースキャン済み商品一覧）

## Metadata

| Field | Value |
|---|---|
| Status | completed |
| Priority | medium |
| Sprint | Week4 |
| Dependencies | 00110_settings_screen（`GET /users/me` 認証・allergen 設定取得が稼働済みであること） |

## Background

`products` テーブルは `user_id` を持たずクロスユーザーで共有される設計になっている（`UNIQUE(id_type, id_value)`）。現在は自分の `scan_histories` にある商品しか画面に表示されないが、他ユーザーがスキャン済みの商品も `products` テーブルに蓄積されている。

この機能により、ユーザーは自分でスキャンしなくても他のユーザーが読み取った商品のアレルゲン判定を確認できる。よく売られているお菓子・加工食品などは既に誰かがスキャン済みのことが多く、再スキャンのコストを削減できる。

## Requirements

- R1: 履歴ページ（`/history`）に「みんなのスキャン」タブ（または新規セクション）を追加する
- R2: `GET /products/others` エンドポイントを新規作成する（Controller → Service → Repository の層境界を守る）
- R3: エンドポイントは「`products` テーブル全体のうち、リクエストユーザーの `scan_histories` に `product_id` が存在しないもの」を返す
- R4: 結果は `updated_at DESC`（新しいスキャン順）で返す。カーソルベースページネーション（`cursor: updated_at`、`limit: 20`）を使う
- R5: レスポンスにはユーザーの allergen 設定に基づいた判定（`judgment: 'ng' | 'partial' | 'ok'`）を含める（サーバーサイドで `products.allergens` と `users.allergies` を照合）
- R6: `products.expires_at < NOW()` の商品は「情報が古い可能性」タグを付けて返す（除外はしない）
- R7: フロントエンドの履歴ページに「みんなのスキャン」タブを追加し、`GET /products/others` を呼び出す
- R8: 表示項目は履歴一覧と同じカード形式（商品名・判定バッジ・`expires_at` 期限切れタグ）
- R9: 自分でスキャン済みの商品は「みんなのスキャン」タブに表示しない（R3 の通り）
- R10: タブのラベルは i18n キー（`history.tabs.mine` / `history.tabs.others`）で管理する
- R11: i18n 実装は next-intl を使用する（next-i18next 禁止）
- R12: `history/page.tsx` は直接 `fetch` しない（`useHistory` Hook 経由）
- R13: `frontend/public/locales/ja/history.json` と `en/history.json` に新規キーを追加する

## Implementation plan

### Phase 1: バックエンド — Repository / Service / Controller

- `products.repository.ts`（または新規 `products-others.repository.ts`）に `findOthersForUser(userId, cursor, limit)` を追加
  - `products` と `scan_histories` を LEFT JOIN し、`scan_histories.user_id = $userId` で絞り込んで `scan_histories.id IS NULL` の商品を取得
  - カーソルは `updated_at` の値をそのまま使う（ISO 文字列）
- `scan.service.ts` または新規 `products.service.ts` に `getOthersScanned(userId, cursor, limit)` を追加
  - `products.allergens` と `users.allergies` を照合して `judgment` を算出（既存の `deriveOverallJudgment` ロジックを流用 / DRY 原則）
- `ProductsController`（または `ScanController`）に `GET /products/others` を追加（Cookie 認証ガード付き）

### Phase 2: フロントエンド — API クライアント・Hook 更新

- `frontend/src/lib/api/products.ts`（新規）に `getOthersScanned(cursor?)` 関数を追加
- `frontend/src/hooks/useHistory.ts`（既存）に `othersItems` / `loadMoreOthers` を追加、または新規 `useOthersScanned.ts` フックを作成
- 履歴ページの「タブ切り替え」状態を管理する

### Phase 3: フロントエンド — UI 追加

- `frontend/src/app/history/page.tsx` にタブ UI（「自分のスキャン」「みんなのスキャン」）を追加
- 「みんなのスキャン」タブ選択時に `getOthersScanned` を呼び出してカード一覧を表示
- カードは既存の履歴カード（`HistoryCard` 等）と同じコンポーネントを使い回す

### Phase 4: i18n キー追加

- `frontend/public/locales/ja/history.json` に `tabs.mine` / `tabs.others` / `expiredTag`（既存なら確認）を追加
- `frontend/public/locales/en/history.json` に同キーを追加

## Files to modify

| ファイル | 変更種別 |
|---|---|
| `backend/src/products/product.repository.ts`（または該当 repository） | 変更（`findOthersForUser` 追加） |
| `backend/src/products/products.service.ts`（または該当 service） | 変更（`getOthersScanned` 追加） |
| `backend/src/products/products.controller.ts`（または該当 controller） | 変更（`GET /products/others` 追加） |
| `frontend/src/lib/api/products.ts` | 新規作成 |
| `frontend/src/hooks/useHistory.ts` または `useOthersScanned.ts` | 変更または新規作成 |
| `frontend/src/app/history/page.tsx` | 変更（タブ追加） |
| `frontend/public/locales/ja/history.json` | 変更（キー追加） |
| `frontend/public/locales/en/history.json` | 変更（キー追加） |

> **注意**: 実際のファイルパスは generator が Glob で特定すること（history 関連 repository / service / controller が複数ある場合がある）。

## Tests to add

### バックエンド

- `backend/src/products/__tests__/products.service.spec.ts`（または該当 spec）
  - 自分がスキャン済みの `product_id` を持つ `scan_histories` があるとき、その商品が結果に含まれないことを検証
  - `expires_at < NOW()` の商品が結果に含まれ、かつ `is_expired: true` フラグが付くことを検証
  - `products.allergens.contains` に `users.allergies` の enabled アレルゲンが含まれるとき、`judgment: 'ng'` が返ることを検証

### フロントエンド

- `frontend/src/lib/api/__tests__/products.test.ts`
  - `getOthersScanned` が `GET /products/others` に `credentials: 'include'` で呼ばれることを検証
  - `cursor` 引数があるとき URL に `?cursor=<値>` が付くことを検証

## Completion criteria

- [ ] `GET /products/others` を有効な Cookie 付きで呼ぶと 200 とページネーション付き商品一覧が返る
- [ ] 返却データに自分が `scan_histories` に持つ `product_id` の商品が含まれない（モックまたは DB で確認）
- [ ] `expires_at < NOW()` の商品が返却され、レスポンスに `is_expired: true` が含まれる
- [ ] 返却データに `judgment: 'ng' | 'partial' | 'ok'` が含まれ、ユーザーの allergen 設定に基づいて算出されている
- [ ] Cookie なしで `GET /products/others` を呼ぶと 401 を返す
- [ ] 履歴ページに「自分のスキャン」「みんなのスキャン」タブが表示される
- [ ] 「みんなのスキャン」タブ選択時に `GET /products/others` が呼ばれ商品一覧が表示される
- [ ] `history/page.tsx` 内に `fetch(` の直接呼び出しが存在しない
- [ ] `history/page.tsx` 内にハードコードされた日本語・英語 UI テキストが存在しない
- [ ] `frontend/public/locales/ja/history.json` に `tabs.mine` / `tabs.others` キーが存在する
- [ ] `frontend/public/locales/en/history.json` に同キーが存在する
- [ ] `pnpm --filter backend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter backend test` がエラー 0 件で終了する（新規テストを含む）
- [ ] `pnpm --filter frontend test` がエラー 0 件で終了する（新規テストを含む）

## Risks

| リスク | 回避方針 |
|---|---|
| `products` テーブルが大量になったとき LEFT JOIN が遅い | `scan_histories(user_id, product_id)` に複合インデックスを追加する（`CREATE INDEX CONCURRENTLY`）。MVP 段階ではデータ量が少ないため許容 |
| 他ユーザーの商品データが個人情報に該当するか | `products` テーブルには `user_id` を持たず誰のスキャンか追跡不能。商品名・アレルゲン情報は公開情報のため問題なし |
| 「みんなのスキャン」が空のとき（初期状態） | 「まだスキャンされた商品がありません」を i18n キーで表示する（空リストのハンドリング） |

---

## Implementation summary

### Phase 1: バックエンド — Repository / Service / Controller

- `backend/src/products/product.repository.ts`（L7-22、L138-193）: `OthersProductRecord` / `FindOthersOptions` 型追加、`findOthersForUser` メソッド追加。Prisma の `$queryRawUnsafe` で LEFT JOIN クエリを実行。cursor は `updated_at < $2::timestamptz` 条件で実現。
- `backend/src/products/products.constants.ts`（新規）: `OTHERS_PAGE_LIMIT = 20` 定数定義。
- `backend/src/products/products.service.ts`（新規）: `ProductsService.getOthersScanned` を実装。`deriveJudgment` で `products.allergens` と `users.allergies` を照合して `judgment: 'ng' | 'partial' | 'ok'` を算出（R5）。`expiresAt < now` 判定で `is_expired` フラグを付与（R6）。
- `backend/src/products/products.controller.ts`（新規）: `GET /products/others` エンドポイント。Cookie なしは `UnauthorizedException`（401）を返す。`THROTTLE_HISTORY_TTL / LIMIT` レート制限付き。
- `backend/src/products/products.module.ts`: `ProductsService`・`ProductsController`・`UsersModule` を追加。
- `backend/src/app.module.ts`: `ProductsModule` を imports に追加。
- `backend/src/products/__tests__/products.service.spec.ts`（新規）: 7ケースのユニットテスト追加（自スキャン除外・is_expired・judgment=ng/partial/ok・不正cursor・ページネーション）。

### Phase 2: フロントエンド — 型定義・API クライアント・Hook

- `frontend/src/app/history/history.types.ts`（L31-51）: `OthersProductItem` / `OthersProductListResponse` 型を追加。
- `frontend/src/lib/api/products.ts`（新規）: `getOthersScanned(cursor?)` 関数を実装。`credentials: 'include'` で Cookie 送信、cursor ありの場合 `?cursor=<値>` を付与（R4）。
- `frontend/src/hooks/useOthersScanned.ts`（新規）: `useInfiniteQuery` を使った `useOthersScanned` Hook。`queryKey: ['products-others']`、`next_cursor` でページネーション。
- `frontend/src/lib/api/__tests__/products.test.ts`（新規）: 3ケースのユニットテスト追加（credentials・cursor URL付与・エラー時 throw）。

### Phase 3: フロントエンド — UI 追加

- `frontend/src/app/history/page.tsx`: 「自分のスキャン」「みんなのスキャン」タブを追加（R1・R7・R8）。ハードコードテキストをすべて `t('history.*')` で置換（R10・R12）。`fetch` 直接呼び出しなし（R12）。期限切れタグは `item.is_expired` フラグで条件表示（R6・R8）。

### Phase 4: i18n キー追加

- `frontend/public/locales/ja/history.json`（新規）: `tabs.mine` / `tabs.others` / `expiredTag` 等を追加（R13）。
- `frontend/public/locales/en/history.json`（新規）: 同キーの英語訳を追加（R13）。
- `frontend/src/i18n/request.ts`: `history.json` を `historyMessages` として動的 import に追加し、`messages.history` にマージ。

## Plan deviation

- `completed_date`: 2026-05-19
- `findOthersForUser` の実装を Prisma の `$queryRawUnsafe` で行った。Prisma の標準 API（`findMany`）では LEFT JOIN の `IS NULL` フィルタが記述困難なため生 SQL を使用。これは DRY 原則の範囲内であり、Repository 層に閉じた変更のため層境界違反はない。
- history/page.tsx の既存ハードコード日本語テキスト（「スキャン履歴」「すべて」「NG」等）を i18n キー対応に変換した。これはタスク R10 の範囲内で必要な修正。
- `ProductsModule` を `app.module.ts` に追加した（`Files to modify` 外だが必要最小限）。

## Review comments

TBD（evaluator が記入）
