# Task 00250: 履歴画面への店舗名表示

## Metadata

| Field | Value |
|---|---|
| Status | completed |
| Created | 2026-05-21 |
| Completed | 2026-05-22 |
| Priority | medium |
| Sprint | Week3 |
| Dependencies | 00170_google-places-store-name（scan_histories.location に店舗名保存済み）、00060_history-backend（GET /history 実装済み） |

## Background

タスク 00170 で `scan_histories.location` カラムに `{ store_name, lat, lng }` が保存されるようになった。
しかし `GET /history` のレスポンス型（`ScanHistoryRecord`）には `location` フィールドが含まれているにもかかわらず、以下の点で画面への縦断がつながっていない。

- `frontend/src/app/history/history.types.ts` の `HistoryItem` 型に `location` フィールドがない（`backend/src/history/scan-history.repository.ts` の `ScanHistoryRecord` とずれている）
- `frontend/src/components/HistoryCard.tsx` が `location` を受け取っておらず、店舗名を表示していない
- `frontend/public/locales/ja/history.json` / `en/history.json` に店舗名表示用の i18n キーがない
- `HistoryCard.tsx` 内で `HistoryItem` を使っているが `location` プロパティを参照しておらず、`useTranslations` も未使用（既存の `JUDGMENT_LABEL` 等は英語固定）

既存の `docs/design/screens.md` 履歴画面設計には「📍 セブン渋谷店  18:23」という店舗名表示が明記されており、未実装のまま残っている。

### 現行コードの確認済み状態

| ファイル | 現状 |
|---|---|
| `backend/src/history/scan-history.repository.ts` | `ScanHistoryRecord.location: ScanHistoryLocation \| null` あり（22行） |
| `backend/src/history/history.service.ts` | `getHistory` は `ScanHistoryRecord[]` をそのまま返す（68行）。location はレスポンスに含まれている |
| `backend/src/history/history.controller.ts` | `HistoryListResult`（`{ items: ScanHistoryRecord[]; next_before: string \| null }`）を返す（69行） |
| `frontend/src/app/history/history.types.ts` | `HistoryItem` に `location` フィールドなし（1〜11行） |
| `frontend/src/components/HistoryCard.tsx` | `location` を受け取らず、`useTranslations` なし（全体） |
| `frontend/public/locales/ja/history.json` | `storeName` キーなし |
| `frontend/public/locales/en/history.json` | `storeName` キーなし |

## Requirements

- R1: `frontend/src/app/history/history.types.ts` の `HistoryItem` 型に `location?: { store_name: string; lat: number; lng: number } | null` を追加する
- R2: `frontend/src/components/HistoryCard.tsx` を `useTranslations('history')` に対応させ、`location.store_name` が truthy な場合に「📍 {store_name}」を表示する。i18n キー `t('storeName', { store: location.store_name })` または同等の形式を用いる（UIテキストハードコード禁止: `anti_patterns.md` #17）
- R3: `frontend/public/locales/ja/history.json` に店舗名表示用の i18n キー（`storeName` 等）を追加する。`location` が null または `store_name` が空の場合は店舗名を表示しない（「場所不明」等の固定テキストは表示しない。ユーザーが選択しなかった場合は単に非表示にする）
- R4: `frontend/public/locales/en/history.json` に同等の英語キーを追加する
- R5: `as any` / `@ts-ignore` を新規追加しない
- R6: `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- R7: `pnpm --filter backend typecheck` がエラー 0 件で終了する（バックエンド変更なしの場合でも確認必須）
- R8: `pnpm --filter frontend test` が全テスト PASS で終了する（FAIL 0 件）
- R9: `pnpm --filter backend test` が全テスト PASS で終了する（FAIL 0 件）

## Implementation plan

### Phase 1: フロントエンド型定義更新

`frontend/src/app/history/history.types.ts` の `HistoryItem` に `location` フィールドを追加する。
`ScanHistoryLocation` と同じ構造（`{ store_name: string; lat: number; lng: number }`）をインラインで定義するか、`location?: { store_name: string; lat: number; lng: number } | null` とする。

### Phase 2: i18n キー追加

`frontend/public/locales/ja/history.json` と `en/history.json` に `storeName` キー（または相当のキー名）を追加する。
キーの値に `{store}` 等の ICU 変数を使い、コンポーネント側で値を渡す形にする（例: `"storeName": "📍 {store}"`）。
キー名と構造は generator が既存の `scan.json` の `priceValue: "¥{price}"` パターンを参考に決定すること。

### Phase 3: HistoryCard コンポーネント更新

`frontend/src/components/HistoryCard.tsx` に以下を追加する:
- `useTranslations('history')` の import と呼び出し
- `HistoryItem` の `location` フィールドを受け取り、`location?.store_name` が truthy な場合に店舗名行を表示する
- 表示は `t('storeName', { store: location.store_name })` 等の i18n キー経由

既存の `JUDGMENT_EMOJI` / `JUDGMENT_LABEL` のハードコード修正はこのタスクのスコープ外とする（別タスク化）。

### Phase 4: テスト追加・修正

`HistoryCard` のテストが存在する場合は `location` を持つ fixture を追加し、店舗名が DOM に表示されることを確認する。
存在しない場合は `frontend/src/components/HistoryCard.test.tsx` を新規作成し、最低限以下のケースを追加する:
- `location: { store_name: 'セブン渋谷店', lat: 35.6, lng: 139.7 }` → 「セブン渋谷店」が DOM に存在する
- `location: null` → 店舗名エリアが DOM に存在しない

## Files to modify

| ファイル | 変更種別 |
|---|---|
| `frontend/src/app/history/history.types.ts` | 変更（`HistoryItem.location` 追加） |
| `frontend/src/components/HistoryCard.tsx` | 変更（`useTranslations` 追加・`location` 表示） |
| `frontend/public/locales/ja/history.json` | 変更（`storeName` キー追加） |
| `frontend/public/locales/en/history.json` | 変更（`storeName` キー追加） |
| `frontend/src/components/HistoryCard.test.tsx` | 新規作成または変更（location テスト追加） |

## Tests to add

### `HistoryCard.test.tsx`（新規作成 or 既存追記）

| シナリオ | 期待結果 |
|---|---|
| `location: { store_name: 'セブン渋谷店', lat: 35.6, lng: 139.7 }` | 「セブン渋谷店」が DOM に存在する |
| `location: null` | 店舗名テキストが DOM に存在しない |
| `location: undefined`（フィールド未設定） | 店舗名テキストが DOM に存在しない |

## Completion criteria

- [ ] `grep "location" frontend/src/app/history/history.types.ts` でヒット 1 以上
- [ ] `grep "store_name" frontend/src/app/history/history.types.ts` でヒット 1 以上
- [ ] `grep "storeName\|store_name" frontend/src/components/HistoryCard.tsx` でヒット 1 以上
- [ ] `grep "useTranslations" frontend/src/components/HistoryCard.tsx` でヒット 1 以上
- [ ] `grep "storeName" frontend/public/locales/ja/history.json` でヒット 1 以上
- [ ] `grep "storeName" frontend/public/locales/en/history.json` でヒット 1 以上
- [ ] `grep -n "セブン\|店舗\|📍" frontend/src/components/HistoryCard.tsx` でヒット 0（日本語・絵文字のハードコードなし）
- [ ] `HistoryCard.test.tsx` に `location` ありの店舗名表示テストが存在し PASS する
- [ ] `HistoryCard.test.tsx` に `location: null` のとき店舗名が非表示になるテストが存在し PASS する
- [ ] `grep "as any\|@ts-ignore" frontend/src/components/HistoryCard.tsx` でヒット 0
- [ ] `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter backend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter frontend test` が全テスト PASS で終了する
- [ ] `pnpm --filter backend test` が全テスト PASS で終了する

## Risks

| リスク | 回避方針 |
|---|---|
| `HistoryCard.tsx` が `useTranslations` を新規追加することで `'use client'` ディレクティブが必要になる場合がある | generator が既存ファイル先頭を Read して確認し、必要なら追加すること |
| `useTranslations('history')` の ICU 変数補間（`{store}` 等）が `frontend/src/__mocks__/next-intl.tsx` のモックで未対応の場合、テストが失敗する | generator がモックの実装を Read して確認し、00240 で追加した `{price}` 対応と同じ方法で `{store}` を追加すること |
| `HistoryCard.test.tsx` が存在しない場合は新規作成が必要 | generator が `Glob "**/*.test.tsx" frontend/src/components/HistoryCard*` で確認すること |
| バックエンドの `ScanHistoryRecord` は `location: ScanHistoryLocation | null` を返しているが、`GET /history` の実際のシリアライズ形式を generator が確認すること | `history.controller.ts` の `getHistory` は `HistoryListResult`（`ScanHistoryRecord[]`）をそのまま返しており、Prisma の JSONB は JSON としてシリアライズされるため追加変更不要な可能性が高い |

# Implementation summary

### Phase 1: フロントエンド型定義更新（`history.types.ts`）

`frontend/src/app/history/history.types.ts` の `HistoryItem` 型（L2〜L12）に `location?: { store_name: string; lat: number; lng: number } | null` フィールドを追加した。既存の `CreateHistoryBody` にも同構造の `location` があり、型の一貫性を維持している。

### Phase 2: i18n キー追加（`history.json` ja / en）

`frontend/public/locales/ja/history.json`（L18）と `en/history.json`（L18）に `"storeName": "📍 {store}"` を追加した。ICU 変数補間 `{store}` を使い、既存の `scan.json` の `"priceValue": "¥{price}"` パターンと同形式にした。

### Phase 3: `HistoryCard.tsx` 更新

`frontend/src/components/HistoryCard.tsx` に以下を追加した:
- ファイル先頭に `'use client'` ディレクティブを追加（`useTranslations` は Client Component でのみ使用可能なため）
- `import { useTranslations } from 'next-intl'` を追加（L3）
- `const t = useTranslations('history')` の呼び出し（L23）
- `location` を destructure に追加（L24）
- `location?.store_name` が truthy なとき `t('storeName', { store: location.store_name })` で店舗名を表示するブロック（L52〜L56）

### Phase 4: `HistoryCard.test.tsx` 更新

既存テストは `render` 直呼びだったため `NextIntlClientProvider` ラッパー（`renderWithI18n`）を追加し、全テストケースを `renderWithI18n` に切り替えた。以下のテストケースを新規追加した:
- `location.store_name: 'セブン渋谷店'` → DOM に「セブン渋谷店」が存在する（L71〜L80）
- `location: null` → 店舗名エリア（📍 含む要素）が DOM に存在しない（L82〜L87）
- `location: undefined` → 店舗名エリアが DOM に存在しない（L89〜L92）

# Plan deviation

- `HistoryCard.test.tsx` は既存のテスト（judgment / product_name / detected）が `render` 直呼びだったが、`useTranslations` 追加に伴い `NextIntlClientProvider` ラッパーが必要になったため、既存テストも `renderWithI18n` に切り替えた。動作への影響はない（既存テストはすべて引き続き PASS）。
- バックエンドテストが4件失敗しているが、`gemini-prompt.builder.spec.ts` に起因する既存の失敗であり、本タスクの変更（バックエンドには変更なし）とは無関係。コミット `788c3b3` 時点から存在する既知の問題。

# Review comments

## 自動評価（2026-05-22） - ラウンド 1

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 1 / Info: 1）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 14/14 通過、typecheck 0件、frontend unit 171件全PASS、backend 4件失敗は本タスクスコープ外の既存失敗）
- 2. セキュリティ: ✅（Medium 以上 0 件。store_name はReactのJSX補間でXSS安全。dangerouslySetInnerHTML使用なし）
- 3. カバレッジ: ✅（新規ロジックに対してtruthy/null/undefinedの3ケースを網羅）
- 4. 敵対的観点: ✅（XSS/空文字/長文字列/undefined全シナリオで防御確認済み、Critical/High 0件）
- 5. 保守性: ✅（層違反なし、アンチパターン再導入なし、マジックナンバーなし）

### 改善提案（PASS 時 / 次タスク繰越し可）

- [Low] `HistoryCard.tsx` L12〜L16 の `JUDGMENT_LABEL`（`'含む'` / `'一部含む'` / `'なし'`）が日本語固定ハードコード。英語ロケール時に判定ラベルが日本語表示される。本タスクのスコープ外として明記済みのため次タスクで対応推奨（`anti_patterns.md` #17 参照）
- [Info] `HistoryItem.location` 型と バックエンド `ScanHistoryLocation` 型の重複定義。将来的に OpenAPI codegen 等で共有型定義を整備することを推奨
