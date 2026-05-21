# Task 00160: SNS 共有機能 — Web Share API への移行

## Metadata

| Field | Value |
|---|---|
| Status | completed |
| Created | 2026-05-20 |
| Completed | 2026-05-20 |
| Priority | medium |
| Sprint | Week4 |
| Dependencies | 00050_scan-frontend-ui（ResultCard が存在すること） |

## Background

`frontend/src/components/ResultCard.tsx` の SNS 共有ボタンは現在 `<a href={twitterUrl} target="_blank">` で実装されており、X（旧 Twitter）専用の固定 URL を生成している（L145, L250-261）。

この実装には以下の問題がある:

1. **Web Share API 未使用**: ネイティブのシェアシートが使えず、X 以外の SNS に共有できない
2. **未対応ブラウザ対応**: `navigator.share` が存在しないデスクトップ等では非表示にする仕様だが、現在は `<a>` タグが常時表示されている
3. **i18n キー `result.shareOnX`**: 「X でシェア」固有の文言になっており、Web Share API への移行後は不整合になる

`anti_patterns.md` #4: NG・一部含む判定では共有ボタンを表示しない — この制約は既存実装で遵守済み（`canShare = judgment === 'なし'`）。本タスクでもこの制約を維持する。

関連ファイル:
- `frontend/src/components/ResultCard.tsx` — 変更対象（L51-L59: `buildShareText`、L145: `shareUrl`、L250-261: 共有ボタン）
- `frontend/public/locales/ja/scan.json` — `result.shareOnX` キーを `result.share` に変更
- `frontend/public/locales/en/scan.json` — 同上
- `frontend/src/components/ResultCard.test.tsx` — テスト追加

## Requirements

- R1: `ResultCard` コンポーネントの共有ボタンを `navigator.share()` を使った Web Share API 実装に変更する
- R2: `typeof navigator !== 'undefined' && typeof navigator.share === 'function'` が `false` の環境では共有ボタン自体を DOM から除外する（フォールバック UI 不要）
- R3: Web Share API の共有コンテンツは `title`（アプリ名）と `text`（`${productName} はアレルギーなし（アレルギースキャンアプリ調べ）` 相当）のみとする。URL フィールドは任意（TBD: generator が適切な値を判断すること）
- R4: 共有ボタンは `judgment === 'なし'`（OK 判定）かつ Web Share API 対応環境のときのみ表示する。`含む` / `一部含む` 判定では表示しない（`anti_patterns.md` #4 遵守）
- R5: `navigator.share()` の呼び出しをユーザー操作（`onClick`）イベントハンドラ内で行う（非ユーザー操作での呼び出しはブラウザにより拒否されるため）
- R6: `navigator.share()` が例外を投げた場合（ユーザーキャンセル含む）はエラーを握りつぶさず、キャンセル（`AbortError`）は無視し、それ以外は `console.error` 等で記録する（ユーザー向けエラー表示は不要）
- R7: i18n キー `result.shareOnX` を `result.share` に変更する（`ja` / `en` 両ロケールのJSONファイルを更新する）。旧キー `result.shareOnX` は削除する
- R8: 変更後の `ResultCard` コンポーネントで `t('result.shareOnX')` を使用しない（`t('result.share')` に変更）
- R9: `as any` / `@ts-ignore` を新規追加しない
- R10: `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- R11: `pnpm --filter frontend test` が全テスト PASS で終了する（FAIL 0 件）

## Implementation plan

### Phase 1: ResultCard の共有ロジック変更

`frontend/src/components/ResultCard.tsx` を以下の方針で変更する:

- `shareUrl` 変数（L145）と `buildShareText` 関数（L51-L59）を削除または改修し、`navigator.share()` に渡す `title` / `text` を構築する関数に置き換える
- 共有ボタンの `<a>` タグを `<button type="button">` に変更し、`onClick` で `navigator.share()` を呼ぶ
- Web Share API 対応チェック（`supportsShare` 変数）を `useState` の初期値またはコンポーネントトップレベルで評価し、`canShare && supportsShare` を満たすときのみボタンを描画する
- `navigator.share()` は Promise を返すため `async` 関数内で `await` し、`AbortError` を無視するエラーハンドリングを追加する

影響範囲: `frontend/src/components/ResultCard.tsx`

### Phase 2: i18n キー更新

`frontend/public/locales/ja/scan.json` と `frontend/public/locales/en/scan.json` の `result.shareOnX` キーを `result.share` に変更する。
`ResultCard.tsx` 内の `t('result.shareOnX')` を `t('result.share')` に変更する。

影響範囲: `frontend/public/locales/ja/scan.json`、`frontend/public/locales/en/scan.json`

### Phase 3: テスト追加・既存テスト修正

`frontend/src/components/ResultCard.test.tsx` に以下のケースを追加する:

- `navigator.share` が存在する環境 + OK 判定 → 共有ボタンが DOM に存在する
- `navigator.share` が存在しない環境 + OK 判定 → 共有ボタンが DOM に存在しない
- `navigator.share` が存在する環境 + NG 判定（`含む`）→ 共有ボタンが DOM に存在しない
- 共有ボタンクリック → `navigator.share` が正しい `title` / `text` で呼ばれる

## Files to modify

| ファイル | 変更種別 |
|---|---|
| `frontend/src/components/ResultCard.tsx` | 変更（共有ボタンを Web Share API に変更、`buildShareText` / `shareUrl` 改修） |
| `frontend/public/locales/ja/scan.json` | 変更（`result.shareOnX` → `result.share`） |
| `frontend/public/locales/en/scan.json` | 変更（`result.shareOnX` → `result.share`） |
| `frontend/src/components/ResultCard.test.tsx` | 変更（Web Share API 対応テスト追加） |

## Tests to add

### フロントエンド（`ResultCard.test.tsx`）

| シナリオ | 期待結果 |
|---|---|
| `navigator.share` が関数として存在 + `judgment === 'なし'` | 共有ボタンが DOM に描画される |
| `navigator.share` が `undefined` + `judgment === 'なし'` | 共有ボタンが DOM に描画されない |
| `navigator.share` が関数として存在 + `judgment === '含む'` | 共有ボタンが DOM に描画されない |
| 共有ボタンをクリック | `navigator.share` が `title` / `text` を含むオブジェクトで呼ばれる |
| `navigator.share` が `AbortError` を投げる | エラーがユーザーに表示されない（UI 変化なし） |

## Completion criteria

- [ ] `frontend/src/components/ResultCard.tsx` に `navigator.share` の呼び出しが存在する（`grep "navigator.share" frontend/src/components/ResultCard.tsx` でヒット件数 1 以上）
- [ ] `frontend/src/components/ResultCard.tsx` に `href` で Twitter/X URL を組み立てるコードが存在しない（`grep "twitter.com/intent" frontend/src/components/ResultCard.tsx` でヒット件数 0）
- [ ] `frontend/src/components/ResultCard.tsx` に `t('result.shareOnX')` が存在しない（`grep "shareOnX" frontend/src/components/ResultCard.tsx` でヒット件数 0）
- [ ] `frontend/src/components/ResultCard.tsx` に `t('result.share')` が存在する（`grep "result.share" frontend/src/components/ResultCard.tsx` でヒット件数 1 以上）
- [ ] `frontend/public/locales/ja/scan.json` に `shareOnX` キーが存在しない（`grep "shareOnX" frontend/public/locales/ja/scan.json` でヒット件数 0）
- [ ] `frontend/public/locales/ja/scan.json` に `share` キーが存在する（`grep '"share"' frontend/public/locales/ja/scan.json` でヒット件数 1 以上）
- [ ] `frontend/public/locales/en/scan.json` に `shareOnX` キーが存在しない（`grep "shareOnX" frontend/public/locales/en/scan.json` でヒット件数 0）
- [ ] `frontend/public/locales/en/scan.json` に `share` キーが存在する（`grep '"share"' frontend/public/locales/en/scan.json` でヒット件数 1 以上）
- [ ] `ResultCard.test.tsx` に「`navigator.share` が undefined のとき共有ボタンが描画されない」テストケースが存在し PASS する（`pnpm --filter frontend test -- --testPathPattern ResultCard` で該当テストが PASS）
- [ ] `ResultCard.test.tsx` に「OK 判定かつ `navigator.share` が関数のとき共有ボタンが描画される」テストケースが存在し PASS する
- [ ] `ResultCard.test.tsx` に「NG 判定のとき共有ボタンが描画されない」テストケースが存在し PASS する
- [ ] `ResultCard.test.tsx` に「共有ボタンクリック時に `navigator.share` が呼ばれる」テストケースが存在し PASS する
- [ ] `frontend/src/components/ResultCard.tsx` に `as any` が新規追加されていない（`grep "as any" frontend/src/components/ResultCard.tsx` でヒット件数 0）
- [ ] `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter frontend test` が全テスト PASS で終了する（FAIL 0 件）

## Risks

| リスク | 回避方針 |
|---|---|
| `navigator.share` の型定義が TypeScript の `lib.dom.d.ts` に存在するバージョン依存がある | `typeof navigator.share === 'function'` でランタイムチェックを行い、型アサーションなしでコンパイルが通ることを確認する。必要に応じて `(navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share` と型拡張する |
| `navigator.share` は HTTPS 環境でのみ動作する（localhost 開発時に動かない場合がある） | テストは `navigator.share` をモックして実施するため影響なし。開発時の動作確認はブラウザの実装依存であることをコメントに明記する |
| `result.shareOnX` キーを削除すると他箇所で参照している場合に typecheck エラーが発生する | `grep -r "shareOnX"` で全ファイルを確認してから削除する（TBD: generator が確認すること） |
| `navigator.share()` はユーザージェスチャー（click）からのみ呼べるため、テスト環境での `userEvent.click` シミュレーションが必要 | Testing Library の `userEvent.click` を使いユーザー操作をシミュレートする |

# Implementation summary
（generator が記入）

# Plan deviation
（generator が記入）

# Review comments

## evaluator R1: PASS（2026-05-20）

総合判定: **PASS**（Critical: 0 / High: 0 / Medium: 0 / Low: 2 / Info: 1）
typecheck: 0件 / unit: 147/147 PASS

### 繰越し改善（Low・次タスク対応可）

- **[Low]** `ResultCard.tsx:165` の `vibrateIfAndroid(50)` がマジックナンバー。`scan.constants.ts` に `VIBRATE_SHARE_MS = 50` として定数化すること
- **[Low]** `buildShareContent` 内の `title: 'アレルギースキャンアプリ'` が日本語ハードコード。コンポーネント外関数のため `t()` 不可という設計上制約だが、英語ロケール対応時に引数で翻訳済み文字列を受け取る設計に変更すること
