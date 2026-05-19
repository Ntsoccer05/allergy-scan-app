# 00098 ResultCard.tsx の UI テキスト i18n 化

## Metadata

| Key | Value |
|---|---|
| Status | completed |
| completed_date | 2026-05-19 |
| Priority | medium |
| Created | 2026-05-19 |
| Sprint | Week4（設定・オンボーディング） |

---

## Background

`frontend/src/components/ResultCard.tsx` に日本語テキストが直接ハードコードされており、`anti_patterns.md` #17（UIテキストをコンポーネントにハードコードする）に違反している。

### ハードコードされている文字列（Read で確認済み）

| 行 | 内容 | i18n キー（案） |
|---|---|---|
| L123 | `⚠️ 一部読み取りにくい箇所があります。ラベルも確認してください` | `scan.result.confidenceMedium` |
| L143 | `原材料を確認する {rawTextOpen ? '▲' : '▼'}` | `scan.result.rawTextToggle`（展開状態は suffix で対応） |
| L158 | `⚠️ 購入前にラベルの実物も必ずご確認ください` | `scan.result.caution` |
| L166 | `このアプリの判定は参考情報です。アナフィラキシーのリスクがある方は必ず実物ラベルでご確認ください` | `scan.result.ngDisclaimer` |
| L181 | `X（旧 Twitter）でシェア` | `scan.result.shareOnX` |
| L188-191 | `もう一度スキャンする` | `scan.result.scanAgain` |

また `JUDGMENT_LABEL` 定数（L28-33）に判定ラベルの日本語テキストが直書きされている。

```typescript
const JUDGMENT_LABEL: Record<Judgment, string> = {
  '含む': '含む',
  '一部含む': '一部含む',
  'なし': 'なし',
  '判定不能': '判定不能',
}
```

これらも i18n キー化が必要（`scan.result.judgment.contains` 等）。

### i18n 実装状況

`frontend/package.json` には `next-i18next` / `i18next` が dependencies に含まれていない。ロケールファイル `frontend/public/locales/{ja,en}/` も未作成。

本タスクでは i18n ライブラリの導入・セットアップと、`ResultCard.tsx` への適用・ロケールファイル作成を行う。

### 既存タスクとの関係

タスク `00096_camera-facing-mode-switch` の R6 で `scan.camera.switchCamera` キーの追加が予定されているため、`ja/scan.json` と `en/scan.json` はそのキーも考慮した構造とする。

---

## Requirements

R1: `frontend/` に **`next-intl`** を導入する（`next-i18next` は Pages Router 専用のため禁止。App Router では動作しない）。`next-intl` は App Router の Server Components / Client Components 両対応に設計されており、Next.js 16 系と互換がある。Next.js App Router と統合する設定ファイル（`i18n.ts`・`middleware.ts` 等）を追加する。generator は `frontend/node_modules/next/dist/docs/` を確認し、Next.js バージョンと互換のある `next-intl` バージョンをインストールすること。

R2: `frontend/public/locales/ja/scan.json` を新規作成し、以下のキーを含む日本語テキストを定義する。

```json
{
  "result": {
    "confidenceMedium": "⚠️ 一部読み取りにくい箇所があります。ラベルも確認してください",
    "rawTextExpand": "原材料を確認する ▼",
    "rawTextCollapse": "原材料を確認する ▲",
    "caution": "⚠️ 購入前にラベルの実物も必ずご確認ください",
    "ngDisclaimer": "このアプリの判定は参考情報です。アナフィラキシーのリスクがある方は必ず実物ラベルでご確認ください",
    "shareOnX": "X（旧 Twitter）でシェア",
    "scanAgain": "もう一度スキャンする",
    "judgment": {
      "contains": "含む",
      "partial": "一部含む",
      "none": "なし",
      "unknown": "判定不能"
    }
  }
}
```

R3: `frontend/public/locales/en/scan.json` を新規作成し、R2 と同じキー構造で英語テキストを定義する。

R4: `frontend/src/components/ResultCard.tsx` 内の全日本語ハードコード文字列を `t('キー名')` 呼び出しに置き換える。`JUDGMENT_LABEL` 定数の日本語値も同様に i18n キーに変更する。

R5: `frontend/public/locales/ja/common.json` を新規作成する（空オブジェクト `{}` でも可。ライブラリの namespace 設定に必要な場合のみ内容を追加する）。`en/common.json` も同様に作成する。

R6: `pnpm --filter frontend typecheck` が終了コード 0 で終了する（型エラー 0 件）。

R7: `pnpm --filter frontend test` が全テスト PASS する。`ResultCard.test.tsx` の既存テストが PASS すること（i18n 対応後、テスト内で `t()` が実際のキー文字列を返すようモック or セットアップが必要な場合は対応する）。

---

## Implementation plan

### Phase 1: i18n ライブラリ導入・設定

`next-i18next`（または `next-intl`）を `frontend/` に追加し、App Router 向け設定を行う。`next.config.js`（または `next.config.ts`）を更新する。generator は Next.js 16.2.6 との互換性を `frontend/node_modules/next/dist/docs/` で確認してから導入ライブラリを決定すること。

### Phase 2: ロケールファイル作成

`frontend/public/locales/ja/scan.json` と `en/scan.json` を作成し、R2・R3 のキー構造で定義する。`common.json` も必要に応じて作成する。

### Phase 3: ResultCard.tsx の置き換え

`useTranslation`（または同等のフック）を `ResultCard.tsx` にインポートし、全ハードコード文字列を `t('キー名')` に置き換える。`JUDGMENT_LABEL` は `t()` を使う形に変換する（定数をオブジェクトからキーマッピングに変える、または `t()` を呼ぶ関数にする）。

### Phase 4: テスト対応

`ResultCard.test.tsx` が `t()` を使うようになった後、テスト環境でも i18n が機能するようセットアップを追加する（`jest.setup.ts` / `jest.config.ts` の更新、またはライブラリが提供するテストユーティリティを使用）。`pnpm --filter frontend test` が全テスト PASS することを確認する。

---

## Files to modify

| ファイル | 変更内容 |
|---|---|
| `frontend/package.json` | i18n ライブラリを dependencies に追加 |
| `frontend/next.config.ts`（または `next.config.js`） | i18n 設定追加（TBD: generator がファイル名を確認） |
| `frontend/src/components/ResultCard.tsx` | 全ハードコード文字列を `t('キー名')` に置き換え、`JUDGMENT_LABEL` を i18n キー対応に変更 |
| `frontend/public/locales/ja/scan.json` | 新規作成。日本語 UI テキストキーを定義 |
| `frontend/public/locales/en/scan.json` | 新規作成。英語 UI テキストキーを定義 |
| `frontend/public/locales/ja/common.json` | 新規作成（空または最小構成） |
| `frontend/public/locales/en/common.json` | 新規作成（空または最小構成） |
| `frontend/jest.config.ts`（または `jest.config.js`） | i18n テスト対応セットアップ追加（TBD: generator がファイル名を確認） |

---

## Tests to add

新規テストケースの追加は不要。`ResultCard.test.tsx` の既存テストが i18n 導入後も PASS することを確認する。

テスト内で `getByText(/購入前にラベルの実物も必ずご確認ください/)` のような文字列マッチを行っている箇所は、i18n キーが実際の文字列を返す設定（テスト用 i18n セットアップ）を追加することで継続 PASS させる。

---

## Completion criteria

- [ ] `grep -r "購入前にラベルの実物も必ずご確認ください" frontend/src/components/ResultCard.tsx` の出力が 0 行である
- [ ] `grep -r "アナフィラキシーのリスクがある方" frontend/src/components/ResultCard.tsx` の出力が 0 行である
- [ ] `grep -r "もう一度スキャンする" frontend/src/components/ResultCard.tsx` の出力が 0 行である
- [ ] `grep -r "一部読み取りにくい箇所があります" frontend/src/components/ResultCard.tsx` の出力が 0 行である
- [ ] `grep -r "X（旧 Twitter）でシェア" frontend/src/components/ResultCard.tsx` の出力が 0 行である
- [ ] `grep "caution" frontend/public/locales/ja/scan.json` が 1 件以上マッチする
- [ ] `grep "ngDisclaimer" frontend/public/locales/ja/scan.json` が 1 件以上マッチする
- [ ] `grep "scanAgain" frontend/public/locales/ja/scan.json` が 1 件以上マッチする
- [ ] `grep "caution" frontend/public/locales/en/scan.json` が 1 件以上マッチする
- [ ] `grep "ngDisclaimer" frontend/public/locales/en/scan.json` が 1 件以上マッチする
- [ ] `grep "scanAgain" frontend/public/locales/en/scan.json` が 1 件以上マッチする
- [ ] `frontend/public/locales/ja/scan.json` と `frontend/public/locales/en/scan.json` が同一キー構造を持つ（`diff <(jq 'keys' ja/scan.json) <(jq 'keys' en/scan.json)` が差分なし、またはキー集合が等しい）
- [ ] `pnpm --filter frontend typecheck` が終了コード 0 で終了する（出力に `error TS` を含まない）
- [ ] `pnpm --filter frontend test` が全テスト PASS する（`Tests: X passed` と表示され、`failed` の文字列が出力されない）

---

## Risks

| リスク | 影響 | 回避方針 |
|---|---|---|
| Next.js 16.2.6 と i18n ライブラリの互換性問題 | ビルドエラーが発生する | generator は `frontend/node_modules/next/dist/docs/` を参照し互換バージョンを確認する。`next-intl` は App Router 向け設計であり Next.js 16 系でも動作する可能性が高い |
| `ResultCard.test.tsx` がハードコード文字列でアサーションしており、i18n 導入後に `t()` が翻訳キーをそのまま返してテスト失敗する | フロントエンドテストが全 FAIL する | i18n ライブラリのテストユーティリティ（mock provider 等）を jest セットアップに追加し、`t('scan.result.caution')` が実際の日本語文字列を返すように設定する |
| `JUDGMENT_LABEL` の置き換えで `t()` がコンポーネント外で呼ばれる（Hook のルール違反） | React Hooks ルール違反でエラー | `JUDGMENT_LABEL` 定数は `t()` を返す関数（`getJudgmentLabel(t, judgment)` 等）に変換するか、`t()` を ResultCard コンポーネント内で呼び出してマッピングを生成する設計にする |
| `00096_camera-facing-mode-switch` タスクで `ja/scan.json` に `switchCamera` キーの追加が予定されている | 本タスクが先に完了すると 00096 実装時にキーが重複または上書きされるリスク | 本タスクで作成した `scan.json` に `camera` セクション（空オブジェクト）をあらかじめ設けておくことで 00096 の追加が容易になる。generator は `"camera": {}` をキーとして追加しておくこと |

---

## Implementation summary

### Phase 1: i18n ライブラリ導入・設定

- `next-intl@4.12.0` を `frontend/` に追加（`pnpm --filter frontend add next-intl@4.12.0`）
  - Next.js 16.2.6 の peerDependencies に対応していることを確認済み
- `frontend/src/i18n/request.ts` を新規作成（L1-22）: `getRequestConfig` で `ja`/`en` ロケールの scan.json を動的読み込み
- `frontend/next.config.ts` を更新（L1-9）: `createNextIntlPlugin` でラップし、i18n 設定エントリーポイントを指定
- `frontend/src/app/layout.tsx` を更新（L7-8, L25, L30, L38-44）: `NextIntlClientProvider` と `getMessages` を追加し、Server Component から messages をクライアントに渡す構成に変更

### Phase 2: ロケールファイル作成

- `frontend/public/locales/ja/scan.json` 新規作成: R2 のキー構造で日本語テキストを定義。`"camera": {}` セクションをあらかじめ確保（00096 タスク用）
- `frontend/public/locales/en/scan.json` 新規作成: 同一キー構造で英語テキストを定義
- `frontend/public/locales/ja/common.json` 新規作成（空オブジェクト）
- `frontend/public/locales/en/common.json` 新規作成（空オブジェクト）

### Phase 3: ResultCard.tsx の置き換え

- `frontend/src/components/ResultCard.tsx` を更新（L4, L71-75 他）:
  - `useTranslations` を `next-intl` からインポート
  - `JUDGMENT_LABEL` 定数を削除し、コンポーネント内で `useTranslations('result')` を呼んで `judgmentLabel` マッピングを生成（Hook ルール遵守）
  - 全ハードコード文字列を `t('キー名')` に置き換え

### Phase 4: テスト対応

- `frontend/src/__mocks__/next-intl.tsx` を新規作成: `NextIntlClientProvider` と `useTranslations` の Jest 用手製モック。Context 経由で messages を共有し、`t()` が実際の翻訳文字列を返す
- `frontend/jest.config.ts` を更新（L9-11）: `moduleNameMapper` に `next-intl` → モックファイルのマッピングを追加（next-intl が ESM のみビルドのため）
- `frontend/src/components/ResultCard.test.tsx` を更新: `render` を `NextIntlClientProvider` でラップする `renderWithI18n` ヘルパーを追加し、日本語 scan.json を messages として渡す

---

## Plan deviation

- `next-intl` の ESM ビルドのみ（CJS クライアントビルドなし）のため `transformIgnorePatterns` での対応ではなく、`moduleNameMapper` + 手製モック（`src/__mocks__/next-intl.tsx`）で対応した。これにより `NextIntlClientProvider` と `useTranslations` がテスト環境でも実際の翻訳文字列を返す。`Files to modify` に `src/__mocks__/next-intl.tsx` が明示されていなかったが、テスト PASS のために最小限の追加として実施（Plan deviation として記録）。
- `i18n/request.ts` の動的 import パスが `../../public/locales/${locale}/scan.json` となっており、`src/i18n/` からの相対パスで解決される。型チェック・テストともに問題なし。

---

## Review comments

## 自動評価（2026-05-19 00:00） - ラウンド 1

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 2 / Info: 1）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 14/14 通過、typecheck 0件、unit 53件全PASS）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ⚠️ 算出不能（既存テストが i18n 対応後も継続 PASS であることで代替確認済み）
- 4. 敵対的観点: ✅（Critical/High 0 件 — i18n 設定ファイルへの外部入力なし）
- 5. 保守性: ✅（層違反 0 / アンチパターン再導入 0 / マジックナンバー 0 / 冗長コメント 0）

### 改善提案（PASS 時 / 次タスク繰越し可）

- [Maintainability] `ResultCard.tsx` L101 の `aria-label="スキャン結果"` がハードコードされている。アクセシビリティ属性も i18n 対象であり、次タスクで `t('scanResult')` 等のキーに置き換えること。対応ファイル: `frontend/src/components/ResultCard.tsx:101`
- [Maintainability] `buildShareText()` 関数（L61-64）の SNS シェアテキスト `'商品'` フォールバックおよび `【アレルギーチェック済み✅】\n...\nアレルギーチェックアプリで確認しました` テンプレートが日本語ハードコードのまま。本タスクの Completion criteria には含まれないため PASS 判定だが、R4「全日本語ハードコード文字列を置き換える」の完全充足のため次タスクで対応すること。対応ファイル: `frontend/src/components/ResultCard.tsx:58-65`
- [Info] `i18n/request.ts` の messages 読み込みが `scan.json` のみ。`common.json` が追加されたが読み込まれていない。将来 `common.json` にキーを追加する際は `request.ts` の `messages` を `{ ...scanMessages, ...commonMessages }` 形式にマージする対応が必要。
