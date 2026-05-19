# Task 00100: ボトムナビゲーション実装

## Metadata

| Field | Value |
|---|---|
| Status | completed |
| Priority | high |
| Sprint | Week4 |
| Dependencies | なし（Week3 履歴機能完了済みを前提） |
| completed_date | 2026-05-19 |

## Background

`frontend/src/app/` 配下に App Router のルートレイアウト (`layout.tsx`) が存在する想定。現在はスキャン・履歴・設定の各画面間を遷移するナビゲーションが存在しない。全画面で共通のボトムナビゲーションが必要。

影響ファイル:
- `frontend/src/app/layout.tsx` — ルートレイアウト（ボトムナビ追加先）
- `frontend/src/components/BottomNav.tsx` — 新規作成（ナビゲーション UI コンポーネント）
- `frontend/public/locales/ja/common.json` — i18n キー追加
- `frontend/public/locales/en/common.json` — i18n キー追加

## Requirements

- R1: スキャン（`/scan` or `/`）・履歴（`/history`）・設定（`/settings`）の3タブをボトムナビとして全画面に表示する
- R2: 現在のルートに対応するタブをアクティブ状態（視覚的なハイライト）で表示する
- R3: ボトムナビのラベルテキストはすべて i18n キー経由で取得する（ハードコード禁止）
- R4: i18n キーは `common.nav.scan` / `common.nav.history` / `common.nav.settings` を使用する
- R5: `frontend/public/locales/ja/common.json` と `frontend/public/locales/en/common.json` に上記3キーを追加する
- R6: i18n の実装は next-intl を使用する（next-i18next 禁止）
- R7: `BottomNav` コンポーネントはビジネスロジックを持たない（Props またはフックから現在パスを受け取るだけ）
- R8: UIコンポーネントが fetch を直接呼ぶことを禁止する（`anti_patterns.md` #7）

## Implementation plan

### Phase 1: i18n ロケールファイルへのキー追加
- `frontend/public/locales/ja/common.json` に `nav.scan` / `nav.history` / `nav.settings` キーを追加
- `frontend/public/locales/en/common.json` に同キーを英語値で追加

### Phase 2: BottomNav コンポーネント作成
- `frontend/src/components/BottomNav.tsx` を新規作成
- next-intl の `useTranslations('common')` を使って i18n キーを参照
- Next.js の `usePathname()` で現在のパスを取得し、アクティブタブをハイライト
- `<Link>` コンポーネントで各タブへの遷移を実装

### Phase 3: ルートレイアウトへの組み込み
- `frontend/src/app/layout.tsx` に `<BottomNav>` を追加
- オンボーディング画面 (`/onboarding`) では非表示にする（オンボーディング完了前にナビを表示しない）

## Files to modify

| ファイル | 変更種別 |
|---|---|
| `frontend/src/app/layout.tsx` | 変更（BottomNav 追加） |
| `frontend/src/components/BottomNav.tsx` | 新規作成 |
| `frontend/public/locales/ja/common.json` | 変更（キー追加）または新規作成 |
| `frontend/public/locales/en/common.json` | 変更（キー追加）または新規作成 |

## Tests to add

- `frontend/src/components/__tests__/BottomNav.test.tsx` を新規作成
  - `/scan` パスのとき scan タブのみがアクティブスタイルを持つことを検証
  - `/history` パスのとき history タブのみがアクティブスタイルを持つことを検証
  - `/settings` パスのとき settings タブのみがアクティブスタイルを持つことを検証
  - i18n キーが `t('nav.scan')` 等の形式で呼ばれていることを検証

## Completion criteria

- [ ] `/scan`（または `/`）にアクセスするとスキャンタブがアクティブ状態（他タブと視覚的に区別可能な CSS クラス）で表示される
- [ ] `/history` にアクセスすると履歴タブがアクティブ状態で表示される
- [ ] `/settings` にアクセスすると設定タブがアクティブ状態で表示される
- [ ] ボトムナビの各タブをタップすると対応するルートに遷移する（`<Link href="/scan">` 等）
- [ ] `BottomNav.tsx` 内にハードコードされた日本語・英語テキストが存在しない（`grep -r "スキャン\|履歴\|設定\|Scan\|History\|Settings" frontend/src/components/BottomNav.tsx` がマッチしない）
- [ ] `frontend/public/locales/ja/common.json` に `nav.scan` / `nav.history` / `nav.settings` キーが存在する（`grep "nav.scan" frontend/public/locales/ja/common.json` がマッチする）
- [ ] `frontend/public/locales/en/common.json` に同じ3キーが存在する
- [ ] `/onboarding` パスではボトムナビが DOM に存在しない
- [ ] `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter frontend test` がエラー 0 件で終了する（新規テストを含む）
- [ ] `BottomNav.tsx` 内に `fetch(` または `axios.` の呼び出しが存在しない

## Risks

| リスク | 回避方針 |
|---|---|
| next-intl の Provider 設定が未整備 | `layout.tsx` に `NextIntlClientProvider` が存在しない場合は Phase 1 でセットアップを追加する |
| `/onboarding` 以外にも将来ナビ非表示ページが増える | `layout.tsx` で非表示パスを定数配列で管理し、条件を1箇所に集約する |

---

## Implementation summary

### Phase 1: i18n ロケールファイルへのキー追加
- `frontend/public/locales/ja/common.json` に `nav.scan`（スキャン）/ `nav.history`（履歴）/ `nav.settings`（設定）を追加
- `frontend/public/locales/en/common.json` に同キーを英語値（Scan / History / Settings）で追加

### Phase 2: i18n/request.ts の更新
- `frontend/src/i18n/request.ts`（全体）: `common.json` も読み込み、`messages.common` 名前空間として提供するよう修正
  - `scan.json` + `common.json` を `Promise.all` で並列取得し、`{ ...scanMessages, common: commonMessages }` として返却

### Phase 3: BottomNav.tsx の改修
- `frontend/src/components/BottomNav.tsx`（全体）: ハードコードラベルを `useTranslations('common')` 経由に変更
  - `NAV_ITEMS` の `label: string` を `labelKey: 'nav.scan' | 'nav.history' | 'nav.settings'` に変更し型安全化
  - `HIDDEN_PATHS: string[]` 定数配列を定義し `/onboarding` を管理（将来拡張を1箇所に集約）
  - `pathname` が `HIDDEN_PATHS` に含まれる場合は `null` を返却（ナビ非表示）

### Phase 4: テストファイルの作成
- `frontend/src/components/__tests__/BottomNav.test.tsx`（新規）: 9ケースを実装
  - `/scan` / `/` / `/history` / `/settings` それぞれのアクティブタブ検証
  - `/onboarding` でのナビ非表示検証
  - i18n キー経由での表示文字列検証（ja: スキャン/履歴/設定）
  - 各タブのリンク先 `href` 検証

### Phase 5（ラウンド2再修正）: aria-label の i18n 対応
- `frontend/public/locales/ja/common.json`: `nav` オブジェクトに `"label": "ボトムナビゲーション"` を追加
- `frontend/public/locales/en/common.json`: `nav` オブジェクトに `"label": "Bottom navigation"` を追加
- `frontend/src/components/BottomNav.tsx`:34: `aria-label="ボトムナビゲーション"` を `aria-label={t('nav.label')}` に変更

## Plan deviation

- `i18n/request.ts` の修正が実装範囲に追加された（`Files to modify` 外）。`scan.json` のみを読み込む実装では `common` 名前空間が参照できず `useTranslations('common')` が動作しないため、必要最小限の変更として実施。影響は `common.json` の内容をメッセージに追加するだけであり、既存の `scan.json` 参照は維持した。
- タスクでは `__tests__/BottomNav.test.tsx` と指定されていたが、プロジェクト既存テストは `src/components/` 直下に配置されている。タスク指定通り `__tests__` サブディレクトリに配置した（jest.config.ts の `testRegex` はどちらでも対応済み）。
- ラウンド2再修正: evaluator FAIL（anti_patterns.md #17 違反）を受け、`aria-label` の日本語ハードコードを `t('nav.label')` に修正。`nav.label` キーを ja/en 両ロケールファイルに追加した。

## Review comments

## 自動評価（2026-05-19 00:00） - ラウンド 1

### 総合判定
**FAIL** （Critical: 0 / High: 0 / Medium: 0 / Low: 1）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 11/11 通過、typecheck 0件、unit 79件全合格）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（9ケースのテストが全て通過、新規ロジックをカバー）
- 4. 敵対的観点: ✅（破壊的操作なし、fetch/axios なし、IDOR/DoS リスクなし）
- 5. 保守性: ❌（アンチパターン #17 違反 1 件）

### 不合格理由（generator への差戻しフィードバック）

#### 【種別】Maintainability
**【再現手順】**
1. `frontend/src/components/BottomNav.tsx` を開く
2. 34行目を確認する
3. `aria-label="ボトムナビゲーション"` という日本語文字列がコンポーネントに直書きされていることを確認する

**【期待される修正案】**
- `frontend/src/components/BottomNav.tsx`:34 の `aria-label="ボトムナビゲーション"` を `aria-label={t('nav.label')}` に変更する
- `frontend/public/locales/ja/common.json` に `"label": "ボトムナビゲーション"` を `nav` オブジェクト内に追加する
- `frontend/public/locales/en/common.json` に `"label": "Bottom navigation"` を `nav` オブジェクト内に追加する
- 参照: `.claude/rules/anti_patterns.md` #17「UIテキストをコンポーネントにハードコードする」、`.claude/rules/coding_rules.md` i18n セクション

**【根拠】**
`aria-label` はスクリーンリーダーが読み上げるUI文字列であり、ユーザー向けテキストに該当する。`coding_rules.md` の i18n セクションは「UIテキストをコンポーネントに直書きしない。すべて `t('キー名')` で管理する」と定める。`anti_patterns.md` #17 は `<p>購入前に...` 等の可視テキストを例示しているが、アクセシビリティ文字列（aria-label）も同様に多言語化が必要なUIテキストである。既存の `CameraView.tsx` は `aria-label={t('videoLabel')}` / `aria-label={t('zoomLabel')}` で正しく i18n キーを使用しており、新規実装の `BottomNav.tsx` だけが例外になっている。

### 改善提案（次タスク繰越し可）
- [Info] `metadata.title` が `"Create Next App"` のままであり、アプリ名に更新することを推奨する（`frontend/src/app/layout.tsx`:22）

## 自動評価（2026-05-19 10:00） - ラウンド 2

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 0）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 11/11 通過、typecheck 0件、unit 79件全合格）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（9ケースのテストが全て通過、新規ロジックをカバー）
- 4. 敵対的観点: ✅（fetch/axios なし、DB直呼びなし、IDOR/DoS リスクなし）
- 5. 保守性: ✅（層違反 0 / アンチパターン 0 / マジックナンバー 0 / 冗長コメント 0）

### ラウンド2 PASS の根拠

- `BottomNav.tsx`:34 の `aria-label` が `aria-label={t('nav.label')}` に修正済み（ラウンド1指摘の修正確認）
- `frontend/public/locales/ja/common.json` に `nav.label: "ボトムナビゲーション"` 追加済み
- `frontend/public/locales/en/common.json` に `nav.label: "Bottom navigation"` 追加済み
- E2E確認: `/scan` でスキャンタブが `text-blue-600 + aria-current="page"`, `/history` で履歴タブ, `/settings` で設定タブがそれぞれアクティブ
- `/onboarding` で `<nav>` 要素が DOM に存在しないことを curl で確認（count=0）
- `BottomNav.tsx` 内に `fetch(` / `axios.` の呼び出しが存在しない
- コード上の日本語文字はコメント行（`// /onboarding パスではボトムナビを非表示にする`）のみ。UIテキストのハードコードなし
- `NAV_ITEMS` / `HIDDEN_PATHS` を名前付き定数として集約。型安全な `labelKey` Union型定義あり

### 改善提案（次タスク繰越し可）
- [Info] `metadata.title` が `"Create Next App"` のままであり、アプリ名に更新することを推奨する（`frontend/src/app/layout.tsx`:22）
