# Task 00070: History Frontend (/history page, useHistory Hook, HistoryCard)

| Field | Value |
|-------|-------|
| Status | completed |
| Created | 2026-05-16 |
| Completed | 2026-05-18 |
| Depends on | 00060 (History Backend) |

---

## Background

タスク 00060 で `GET /history` と `POST /history` が実装される。本タスクでは、その API を呼び出す `/history` ページと関連コンポーネント・Hook を実装する。

本タスクで `@tanstack/react-query` を導入する。`useInfiniteQuery` を使うことで `/history` の無限スクロール（カーソルページネーション）が簡潔に実装でき、`queryClient.invalidateQueries` によりスキャン完了後の履歴自動再取得も自然に扱える。

現在のフロントエンドの状態（00050 完了後）:
- `frontend/src/components/BottomNav.tsx` の `/history` タブが存在するが、`/history` ページ（`frontend/src/app/history/`）は未実装
- `frontend/src/lib/api/scan.api.ts` に `postBarcode`・`getPresignedUrl`・`uploadToS3`・`postOcr` が実装済み
- `frontend/src/hooks/useScanApi.ts` が `postOcr`・`postBarcode` を呼び出す Hook として実装済み
- `frontend/src/lib/cache.ts` にクライアントキャッシュ（TTL: 2時間）が実装済み
- スキャン完了後に `POST /history` を呼び出す実装は未実装（`useScanApi.ts` 拡張が必要）
- `@tanstack/react-query` は未導入

設計の根拠となる正典:
- `.claude/rules/architecture.md` — フロントエンド層境界（Page → Hook → API クライアント関数 → UI コンポーネント）
- `.claude/rules/anti_patterns.md` — #7（UI コンポーネントが fetch を直接呼ぶ禁止）
- `.claude/rules/patterns.md` — パターン8（アレルギー設定の表示順）、パターン4（カーソルページネーション）
- `.claude/rules/implementation_rules.md` — モバイルファーストで実装する

---

## Requirements

- R0: `@tanstack/react-query` を `frontend/package.json` の `dependencies` に追加する。`QueryClientProvider` を `frontend/src/app/providers.tsx` に実装し、`frontend/src/app/layout.tsx` でラップする。`'use client'` ディレクティブを `providers.tsx` に付与する
- R1: `frontend/src/lib/api/history.api.ts` を新規作成し、`getHistory(params)`（`GET /history`）と `postHistory(body)`（`POST /history`）の fetch ラッパー関数を実装する。直接 fetch を Hook・コンポーネントに書かない（architecture.md ルール）
- R2: `useHistory` Hook を `frontend/src/hooks/useHistory.ts` に実装する。`@tanstack/react-query` の `useInfiniteQuery` を使ってカーソルページネーションと追加ロードを管理する。`queryKey` は `['history', filter]` とする
- R3: `useHistory` Hook は `items`（全ページのフラット配列）・`isLoading`・`isFetchingNextPage`・`hasNextPage`・`fetchNextPage`・`filter`・`setFilter` を返す。`filter` は `'all' | 'ng' | 'partial' | 'ok'` のいずれか
- R4: `HistoryCard` コンポーネントを `frontend/src/components/HistoryCard.tsx` に実装する。1件の履歴レコードを受け取り、`judgment`・`product_name`・`detected`・`scanned_at` を表示する。ロジックを持たず Props で受け取るだけにする（architecture.md ルール）
- R5: `HistoryCard` は `judgment` に応じて絵文字を表示する（`ng` → `🔴`・`partial` → `🟡`・`ok` → `✅`）
- R6: `/history` ページ（`frontend/src/app/history/page.tsx`）を `'use client'` ページとして実装する。`useHistory` Hook を使って履歴一覧を表示し、フィルタタブ（すべて・NG・一部含む・OK）と `HistoryCard` の一覧を表示する
- R7: `/history` ページに「もっと見る」ボタンを設置し、`useHistory.fetchNextPage()` を呼び出す。`hasNextPage` が `false` のとき「もっと見る」ボタンを非表示にする
- R8: `/history` ページで `isLoading` が `true` のときはローディングインジケータ（スピナー等）を表示する
- R9: `useScanApi.ts` に `saveHistory(body)` 関数を追加し、スキャン完了後（`useScan.ts` の `'RESULT'` dispatch 直後）に `POST /history` を自動呼び出しする。保存成功後は `queryClient.invalidateQueries({ queryKey: ['history'] })` を呼び出し、履歴リストを自動再取得する。保存失敗はサイレントに握りつぶさず `console.error` を出力する（フロントエンドには NestJS Logger がないため `console.error` を例外として許容する）
- R10: `useScanApi.ts` への `saveHistory` 追加に伴い、`useScan.ts` の `runOcrFlow` と `tick`（バーコードフロー）の両方で `'RESULT'` dispatch 後に `saveHistory` を呼び出す
- R11: モバイルファーストで実装する。`max-width: 480px` を基準にレイアウトを組む
- R12: `as any` / `@ts-ignore` を使用しない
- R13: `console.log` を新規追加ファイルに書かない（R9 の `console.error` は許容）

---

## Implementation plan

### Phase 1: @tanstack/react-query セットアップ

- `frontend/package.json` に `@tanstack/react-query` を追加する
- `frontend/src/app/providers.tsx`（新規）: `'use client'` で `QueryClientProvider` をラップするコンポーネントを実装する
- `frontend/src/app/layout.tsx`（編集）: `<Providers>` で子要素をラップする

### Phase 2: API クライアント関数

- `frontend/src/lib/api/history.api.ts`（新規）: `getHistory` / `postHistory` の fetch ラッパーを実装する
- レスポンス型 `HistoryListResponse`（`{ items: HistoryItem[], next_cursor: string | null }`）と `HistoryItem` 型を `frontend/src/app/history/history.types.ts` に定義する

### Phase 3: useHistory Hook

- `frontend/src/hooks/useHistory.ts`（新規）: `useInfiniteQuery` を使って `GET /history` のカーソルページネーションを管理する
- `queryKey: ['history', filter]` とし、`filter` 変更時にキャッシュを自動無効化する
- `getNextPageParam` は `lastPage.next_cursor` が `null` なら `undefined`、それ以外はそのまま返す
- `items` は `data.pages.flatMap(p => p.items)` で全ページをフラット化して返す

### Phase 4: HistoryCard コンポーネント

- `frontend/src/components/HistoryCard.tsx`（新規）: `HistoryItem` 型を Props で受け取り、`judgment`・`product_name`・`detected`・`scanned_at` を表示する純粋 UI コンポーネント

### Phase 5: /history ページ

- `frontend/src/app/history/page.tsx`（新規）: `'use client'` ページ。`useHistory` Hook を呼び出し、フィルタタブ・`HistoryCard` リスト・「もっと見る」ボタン・ローディングインジケータを配置する

### Phase 6: useScanApi / useScan 拡張

- `frontend/src/hooks/useScanApi.ts`（編集）: `saveHistory(body)` 関数を追加する。`postHistory` 呼び出し後に `queryClient.invalidateQueries({ queryKey: ['history'] })` を実行する
- `frontend/src/hooks/useScan.ts`（編集）: `runOcrFlow`（OCR フロー）と `tick`（バーコードフロー）の `'RESULT'` dispatch 後に `saveHistory` を呼び出す

### Phase 7: Unit テスト

- `frontend/src/hooks/useHistory.test.ts`（新規）: `useHistory` の初回取得・フィルタ変更・`fetchNextPage` の動作を `@testing-library/react` の `renderHook` でテストする。`@tanstack/react-query` の `wrapper` に `QueryClientProvider` をセットしてテスト用 `QueryClient` を渡す。`getHistory` をモックする
- `frontend/src/components/HistoryCard.test.tsx`（新規）: `judgment` ごとの絵文字表示・`product_name`・`detected` の表示を検証する

---

## Files to modify

| File | Action |
|------|--------|
| `frontend/package.json`（編集） | `@tanstack/react-query` を dependencies に追加 |
| `frontend/src/app/providers.tsx`（新規） | `QueryClientProvider` ラッパー（`'use client'`） |
| `frontend/src/app/layout.tsx`（編集） | `<Providers>` で子要素をラップ |
| `frontend/src/app/history/history.types.ts`（新規） | `HistoryItem` / `HistoryListResponse` 型定義 |
| `frontend/src/lib/api/history.api.ts`（新規） | GET /history・POST /history fetch ラッパー |
| `frontend/src/hooks/useHistory.ts`（新規） | `useInfiniteQuery` ベースの履歴取得 Hook |
| `frontend/src/components/HistoryCard.tsx`（新規） | 履歴カード UI コンポーネント |
| `frontend/src/app/history/page.tsx`（新規） | /history ページ |
| `frontend/src/hooks/useScanApi.ts`（編集） | `saveHistory` 追加・`invalidateQueries` 呼び出し |
| `frontend/src/hooks/useScan.ts`（編集） | `saveHistory` 呼び出し追加 |
| `frontend/src/hooks/useHistory.test.ts`（新規） | useHistory 単体テスト（QueryClient wrapper 付き） |
| `frontend/src/components/HistoryCard.test.tsx`（新規） | HistoryCard 単体テスト |

---

## Tests to add

### useHistory.test.ts

| シナリオ | 期待結果 |
|----------|----------|
| 初回マウント | `isLoading` が `true` → `getHistory` 呼び出し → `isLoading` が `false`・`items` に取得データが反映 |
| `filter` を `'ng'` に変更 | `getHistory({ judgment: 'ng' })` が呼ばれ `items` がリセットされる |
| `fetchNextPage()` 呼び出し（`hasNextPage: true`） | `getHistory({ cursor: nextCursor })` が呼ばれ `items` に追加 |
| `fetchNextPage()` 呼び出し（`hasNextPage: false`） | `getHistory` が呼ばれない |

### HistoryCard.test.tsx

| シナリオ | 期待結果 |
|----------|----------|
| `judgment: 'ng'` | `🔴` が表示される |
| `judgment: 'partial'` | `🟡` が表示される |
| `judgment: 'ok'` | `✅` が表示される |
| `product_name` あり | `product_name` のテキストが表示される |
| `detected` に要素あり | 検出アレルギー名が表示される |

---

## Completion criteria

- [ ] `@tanstack/react-query` が `frontend/package.json` の `dependencies` に存在する（`grep "@tanstack/react-query" frontend/package.json` でヒット）
- [ ] `frontend/src/app/providers.tsx` が存在し `QueryClientProvider` を export している（`grep "QueryClientProvider" frontend/src/app/providers.tsx` でヒット）
- [ ] `frontend/src/app/layout.tsx` が `Providers` でラップしている（`grep "Providers" frontend/src/app/layout.tsx` でヒット）
- [ ] `frontend/src/app/history/page.tsx` が存在し `'use client'` ディレクティブを含む（`grep "'use client'" frontend/src/app/history/page.tsx` でヒット）
- [ ] `frontend/src/lib/api/history.api.ts` に `getHistory` と `postHistory` が export されている（`grep "export.*getHistory\|export.*postHistory" frontend/src/lib/api/history.api.ts` でヒット件数 2）
- [ ] `frontend/src/hooks/useHistory.ts` が `useInfiniteQuery` を使っている（`grep "useInfiniteQuery" frontend/src/hooks/useHistory.ts` でヒット）
- [ ] `frontend/src/hooks/useHistory.ts` に `useHistory` が export されており、`fetchNextPage`・`hasNextPage`・`setFilter`・`isLoading`・`items`・`filter` を返す（`grep "fetchNextPage\|hasNextPage\|setFilter\|isLoading" frontend/src/hooks/useHistory.ts` でヒット件数 4 以上）
- [ ] `frontend/src/components/HistoryCard.tsx` が `judgment`・`product_name`・`detected`・`scanned_at` を Props で受け取る実装になっており、fetch を含まない（`grep "fetch\|getHistory\|postHistory" frontend/src/components/HistoryCard.tsx` でヒット件数 0）
- [ ] `HistoryCard.tsx` で `judgment === 'ng'` のとき `🔴` を表示する条件分岐が存在する（`grep "🔴\|ng.*🔴\|judgment.*ng" frontend/src/components/HistoryCard.tsx` でヒット）
- [ ] `/history` ページに `hasNextPage` が `false` のとき「もっと見る」ボタンを非表示にする条件分岐が存在する（`grep "hasNextPage\|fetchNextPage" frontend/src/app/history/page.tsx` でヒット）
- [ ] `frontend/src/hooks/useScanApi.ts` に `saveHistory` が export されており、`invalidateQueries` が呼ばれる（`grep "saveHistory\|invalidateQueries" frontend/src/hooks/useScanApi.ts` でヒット件数 2 以上）
- [ ] `frontend/src/hooks/useScan.ts` で `saveHistory` が `'RESULT'` dispatch 後に呼び出される（`grep "saveHistory" frontend/src/hooks/useScan.ts` でヒット）
- [ ] `HistoryCard.tsx` が `fetch` を直接呼ばない（`grep "fetch(" frontend/src/components/HistoryCard.tsx` でヒット件数 0）
- [ ] `as any` が新規追加・編集ファイルに含まれない（`grep -r "as any" frontend/src/app/history/ frontend/src/components/HistoryCard.tsx frontend/src/hooks/useHistory.ts` でヒット件数 0）
- [ ] `console.log` が新規追加・編集ファイルに含まれない（`grep -rn "console\.log" frontend/src/app/history/ frontend/src/components/HistoryCard.tsx frontend/src/hooks/useHistory.ts` でヒット件数 0）
- [ ] `pnpm --filter frontend test` で `useHistory.test.ts`（4件以上）・`HistoryCard.test.tsx`（5件以上）が全 PASS する（FAIL 0件）
- [ ] `pnpm --filter frontend typecheck` がエラー 0件で終了する

---

## Risks

| リスク | 回避方針 |
|--------|----------|
| `POST /history` の二重送信（バーコードと OCR でそれぞれ呼ぶ） | `useScan.ts` の `runOcrFlow` は OCR フロー完了後に 1 回のみ `saveHistory` を呼ぶ。バーコードフロー（`found: true`）でも 1 回のみ呼ぶ。`isProcessingRef` による二重送信防止ロジックは既存のまま維持する |
| `useScan.ts` 編集による既存スキャンフローへの影響 | `saveHistory` の失敗はスキャン状態に影響させない（`try/catch` で握りつぶし `console.error` のみ）。スキャン結果の `dispatch({ type: 'RESULT' })` は `saveHistory` の完了を待たない（`void` で呼び出す） |
| `/history` ページで SSR エラー | `'use client'` ディレクティブを付与する |
| `HistoryItem` 型と `ScanHistoryRecord`（バックエンド型）の不一致 | `HistoryItem` はフロントエンド独自型として `frontend/src/app/history/history.types.ts` に定義する。バックエンドレスポンスとの一致は generator が API 仕様を確認して調整する（TBD: generator 確認） |

---

## Implementation summary

### Phase 1: @tanstack/react-query セットアップ
- `frontend/package.json` に `"@tanstack/react-query": "^5.80.2"` を追加（L14）
- `frontend/src/app/providers.tsx`（新規）: `QueryClientProvider` ラッパーを `'use client'` で実装（L1-L26）
- `frontend/src/app/layout.tsx`（編集）: `<Providers>` で children と BottomNav をラップ（L33-L36）

### Phase 2: API クライアント関数と型定義
- `frontend/src/app/history/history.types.ts`（新規）: `HistoryItem` / `HistoryListResponse` / `CreateHistoryBody` / `HistoryFilter` 型を定義（L1-L36）
  - `HistoryItem.scannedAt` は `string`（バックエンド `ScanHistoryRecord.scannedAt: Date` が JSON シリアライズされるため）
  - `HistoryItem` フィールドは camelCase（バックエンドレスポンスと整合）
- `frontend/src/lib/api/history.api.ts`（新規）: `getHistory` / `postHistory` fetch ラッパーを実装（L1-L47）
  - `credentials: 'include'` で Cookie 送信

### Phase 3: useHistory Hook
- `frontend/src/hooks/useHistory.ts`（新規）: `useInfiniteQuery` ベースの Hook（L1-L52）
  - `queryKey: ['history', filter]`
  - `select: (data) => data.pages` で `HistoryListResponse[]` に変換
  - `items`: `data.flatMap(page => page.items)` でフラット化

### Phase 4: HistoryCard コンポーネント
- `frontend/src/components/HistoryCard.tsx`（新規）: 純粋 UI コンポーネント（L1-L50）
  - `judgment` → `🔴` / `🟡` / `✅` 表示
  - `productName` / `detected` / `scannedAt` を表示
  - fetch は一切含まない

### Phase 5: /history ページ
- `frontend/src/app/history/page.tsx`（新規）: `'use client'` ページ（L1-L92）
  - フィルタタブ（すべて / NG / 一部含む / OK）
  - ローディングスピナー（`isLoading` 時）
  - `HistoryCard` 一覧
  - 「もっと見る」ボタン（`hasNextPage` が false のとき非表示）
  - `max-w-[480px]` モバイルファーストレイアウト

### Phase 6: useScanApi / useScan 拡張
- `frontend/src/hooks/useScanApi.ts`（編集）:
  - `saveHistory(body: CreateHistoryBody)` を追加（L75-L86）
  - `postHistory` 呼び出し後に `queryClient.invalidateQueries({ queryKey: ['history'] })`（L79）
  - 保存失敗は `console.error` を出力してサイレント処理（L81）
- `frontend/src/hooks/useScan.ts`（編集）:
  - `buildHistoryBody(result: ScanResult)` ヘルパーを追加（L67-L93）
  - OCR フロー（`runOcrFlow`）の `dispatch({ type: 'RESULT' })` 後に `void saveHistory(historyBody)`（L150-L153）
  - バーコードフロー（`tick`）の `dispatch({ type: 'RESULT' })` 後に `void saveHistory(historyBody)`（L181-L184）
  - `saveHistory` 失敗はスキャン状態に影響しない設計を維持

### Phase 7: Unit テスト
- `frontend/src/hooks/useHistory.test.ts`（新規）: 4件 PASS
  - `QueryClientProvider` wrapper 付き `renderHook` でテスト
  - 初回マウント / filter 変更 / fetchNextPage（hasNextPage: true） / fetchNextPage（hasNextPage: false）
- `frontend/src/components/HistoryCard.test.tsx`（新規）: 7件 PASS
  - ng/partial/ok の絵文字表示 / productName 表示・非表示 / detected 表示・非表示

---

## Plan deviation

none

---

## Review comments

## 自動評価（2026-05-18 17:00） - ラウンド 1

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 2 / Info: 2）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 全 17 項目通過、typecheck 0件、unit 48件全 PASS、production build 成功）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（useHistory 4件 / HistoryCard 7件、いずれも最低ラインを満たす）
- 4. 敵対的観点: ✅（IDOR・DoS・XSS の Critical/High 0件。CSRF は Cookie SameSite=Strict で backend 側が担保する前提で許容）
- 5. 保守性: ✅（層違反 0 / アンチパターン再導入 0 / マジックナンバー 0 / 冗長コメント 0）

### 改善提案（PASS / 次タスク繰越し可）

#### [Info] i18n ハードコード（既存コードベース全体の踏襲）
`frontend/src/app/history/page.tsx` の「スキャン履歴」「すべて」「NG」「一部含む」「OK」「履歴がありません」「もっと見る」「読み込み中...」と、`frontend/src/components/HistoryCard.tsx` の「含む」「一部含む」「なし」は日本語文字列がハードコードされている。`coding_rules.md` / `anti_patterns.md` #17 の規約違反。ただし `ResultCard.tsx` / `BottomNav.tsx` など既存コンポーネントも同様の違反を持ち、`frontend/public/locales/` ディレクトリ自体が未作成、i18n ライブラリも未導入。本タスク単独の問題ではなくコードベース全体の技術的負債であるため、評価では「次タスク繰越し可」の Info 扱いとする。Week4（設定・オンボーディング）で i18n 基盤を導入する際に一括対応することを推奨する。

#### [Low] `scan.api.ts` に `credentials: 'include'` が存在しない（既存コードの問題）
`frontend/src/lib/api/scan.api.ts` の `getPresignedUrl` / `postBarcode` / `postOcr` は `credentials: 'include'` を指定していない。`history.api.ts` では正しく指定されている。本タスクのスコープ外だが、バックエンドが Cookie 認証を要求する際に `scan.api.ts` 経由のリクエストが認証エラーになるリスクがある。次タスクで修正を推奨。

#### [Low] `HistoryCard` の実行時 `judgment` 無効値に対するフォールバックなし
`JUDGMENT_EMOJI[judgment]` と `JUDGMENT_LABEL[judgment]` の lookup はバックエンドから予期外の値が来た場合に `undefined` を返す。TypeScript 型は `'ng' | 'partial' | 'ok'` で守られているが、実行時の防衛として `?? ''` のフォールバックを付けることを推奨する。重大度 Low（型保証があるため実際のクラッシュは想定しにくい）。

#### [Info] `useHistory.ts` の `'use client'` ディレクティブはプロジェクトの既存慣例に従っている
Next.js App Router で `useState` / `useInfiniteQuery` を使う Hook は Client Component 境界の内側で動作する必要がある。本プロジェクトでは `useCamera.ts` / `useScan.ts` 等の既存 Hook も全て `'use client'` を付与しており、一貫したパターンに合致する。
