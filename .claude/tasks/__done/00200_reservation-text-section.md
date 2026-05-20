# Task 00200: 設定画面「お店予約用テキスト」セクション追加

## Metadata

| Field | Value |
|---|---|
| Status | completed |
| Priority | medium |
| Sprint | Week4 補完 |
| completed_date | 2026-05-20 |
| Dependencies | 00110_settings_screen（設定画面・useSettings 完了済み） |

## Background

設定画面 (`frontend/src/app/settings/page.tsx`, L236〜L515) は既実装済みで、アレルゲン設定リスト・言語設定・バックアップコード・データリセットの各セクションが存在する。`useSettings` フック (`frontend/src/hooks/useSettings.ts`) が `allergies: AllergySettings` を返しており、`enabled: true` の品目一覧はフロントエンドのみで導出できる。

本タスクは以下を追加する:
- アレルゲン設定リストの直下（言語設定セクションの上）に「お店予約用テキスト」セクションを追加
- `allergies` の `enabled: true` 品目を結合して固定フォーマットの予約用テキストを自動生成する純粋フロントエンド機能
- バックエンド変更・新規 API なし

関連ファイルの現状:
- `frontend/src/app/settings/page.tsx` — 設定画面（L161〜L515）。アレルゲンセクションは L253〜L269。
- `frontend/src/hooks/useSettings.ts` — `allergies: AllergySettings` を返す（L138）
- `frontend/src/app/settings/settings.types.ts` — `AllergySettings = Record<string, AllergenSetting>`, `AllergenItem` 型定義済み
- `frontend/public/locales/ja/settings.json` — 既存キー群あり（L1〜L62）。`reservationText` キーは未定義
- `frontend/public/locales/en/settings.json` — 既存キー群あり（L1〜L62）。`reservationText` キーは未定義

## Requirements

- R1: `useSettings` が返す `allergies` から `enabled: true` の品目名（`allergens.name`）を抽出し、ロケール別の固定フォーマット文字列に組み込んだ予約用テキストを生成する。テキスト生成ロジックは `frontend/src/lib/reservation-text.util.ts` に集約する（DRY 原則）
- R2: `enabled: true` の品目が 0 件のときはセクション全体を DOM から除去する（`null` を返す）
- R3: 生成されたテキストを `<textarea>` に表示し、ユーザーが自由に編集できる（controlled input）
- R4: 「再生成」ボタンを配置し、押下時にユーザー編集内容を破棄して自動生成テキストに戻す
- R5: `allergies` または `locale` が変化したとき、textarea の内容が自動生成テキストに追従する（設定変更後も常に最新の自動生成テキストが起点となる）
- R6: 「コピーする」ボタンで `navigator.clipboard.writeText()` を呼ぶ。コピー成功後 2 秒間はボタンテキストをコピー完了表示に切り替え、その後元のラベルに戻す
- R7: `navigator.clipboard` が使えない環境（非 HTTPS・PermissionError 等）でも画面がクラッシュしない。`try/catch` で例外を捕捉し、失敗時は i18n キーで定義したエラーメッセージを一時表示する
- R8: セクションタイトル・ボタンラベル・フォーマット文字列・エラーメッセージをすべて i18n キーで管理する。`settings.json` の `reservationText` 配下に定義する（UIテキストをコンポーネントにハードコード禁止）
- R9: `frontend/src/app/settings/page.tsx` に `fetch(` の直接呼び出しを追加しない
- R10: `as any` / `@ts-ignore` を新規追加しない
- R11: `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- R12: `pnpm --filter frontend test` が全 PASS（新規テストを含む）で終了する

## Implementation plan

### Phase 1: テキスト生成ロジック
- `frontend/src/lib/reservation-text.util.ts` を新規作成
  - 関数 `buildReservationText(enabledNames: string[], locale: 'ja' | 'en'): string` を定義
  - ja: `私は{品目}・{品目}・{品目}アレルギーがあります。食事の際はご配慮をお願いいたします。`
  - en: `I have the following food allergies: {item}, {item}, {item}. Please take this into account when preparing my meal.`
  - 品目区切りは locale により異なる（ja: `・`, en: `, `）
  - **注意**: フォーマット文字列の前後固定部分は i18n キー（`reservationText.format.prefix` / `suffix` 等）で管理する場合と util で定義する場合の選択を generator が判断する。どちらでも R8 の「ハードコード禁止」が満たされればよい（util 内での日本語・英語テキスト直書きは R8 違反となるため、必ず i18n キー経由にすること）
- テスト: `frontend/src/lib/__tests__/reservation-text.util.test.ts` を新規作成
  - 品目が 3 件の場合の ja/en フォーマット出力を検証
  - 品目が 1 件の場合の出力を検証

### Phase 2: i18n キー追加
- `frontend/public/locales/ja/settings.json` に `reservationText` オブジェクトを追加
  - `title`, `description`, `copyButton`, `copiedButton`, `regenerateButton`, `copyError`, フォーマット関連キー
- `frontend/public/locales/en/settings.json` に同構造の英語キーを追加

### Phase 3: 設定画面 UI 追加
- `frontend/src/app/settings/page.tsx` のアレルゲン設定セクション（L253〜L269）直後、言語設定セクション（L271〜L292）の前に `<ReservationTextSection>` を挿入する（TBD: generator が実際の挿入行を確認すること）
- `ReservationTextSection` コンポーネントは `page.tsx` 内に定義してよい（または `ReservationTextSection.tsx` に分離してもよい）
- コンポーネントの Props: `allergies: AllergySettings`, `allergenGroups: AllergenGroup[]`, `locale: 'ja' | 'en'`, `t: TranslateFn`
  - `allergenGroups` から品目の `display_name` を引いて予約用テキストに使う（`allergens.name` ではなく表示名を使う）か `allergens.name` をそのまま使うかは仕様上定められていないため、generator が `display_name` を使うよう実装する（ユーザー向けの自然言語テキストのため）
- 内部 state: `text: string`（textarea の現在値）, `isCopied: boolean`（コピー完了フラグ）, `copyError: string | null`
- `allergies` または `locale` が変わるたびに `text` を自動生成テキストにリセットする（`useEffect` を使う）

### Phase 4: テスト
- `frontend/src/lib/__tests__/reservation-text.util.test.ts` （Phase 1 で作成）
- `frontend/src/app/settings/__tests__/ReservationTextSection.test.tsx` を新規作成
  - `enabled: true` 品目 0 件のとき null を返す（セクションが DOM にない）ことを検証
  - `enabled: true` 品目 2 件のとき textarea に生成テキストが表示されることを検証
  - 再生成ボタンを押すと textarea が自動生成テキストにリセットされることを検証
  - コピーボタンを押すと `navigator.clipboard.writeText` が呼ばれることを検証
  - `navigator.clipboard.writeText` が reject したときにクラッシュせずエラー表示になることを検証

## Files to modify

| ファイル | 変更種別 |
|---|---|
| `frontend/src/lib/reservation-text.util.ts` | 新規作成 |
| `frontend/src/lib/__tests__/reservation-text.util.test.ts` | 新規作成 |
| `frontend/public/locales/ja/settings.json` | 変更（`reservationText` キー追加） |
| `frontend/public/locales/en/settings.json` | 変更（`reservationText` キー追加） |
| `frontend/src/app/settings/page.tsx` | 変更（`ReservationTextSection` 追加・挿入） |
| `frontend/src/app/settings/__tests__/ReservationTextSection.test.tsx` | 新規作成 |

## Tests to add

- `frontend/src/lib/__tests__/reservation-text.util.test.ts`
  - `buildReservationText(['卵', '乳', '小麦'], 'ja')` が `私は卵・乳・小麦アレルギーがあります…` を返すことを検証
  - `buildReservationText(['egg', 'milk'], 'en')` が英語フォーマットを返すことを検証
  - `buildReservationText([], 'ja')` が空文字または想定済み空値を返すことを検証（R2 の 0 件判定はコンポーネント側）

- `frontend/src/app/settings/__tests__/ReservationTextSection.test.tsx`
  - `allergies` が全件 `enabled: false` のとき、コンポーネントが `null` を返し DOM に何も描画されないことを検証
  - `enabled: true` 品目が存在するとき、`<textarea>` が DOM に存在し自動生成テキストを値として持つことを検証
  - `enabled: true` 品目が存在するとき、「再生成」ボタンが存在することを検証
  - textarea を編集後に「再生成」ボタンを押すと textarea の値が自動生成テキストに戻ることを検証
  - `navigator.clipboard.writeText` をモックして「コピーする」ボタン押下時に呼ばれることを検証
  - `navigator.clipboard.writeText` が `Promise.reject` を返す場合にエラーが表示されることを検証
  - `allergies` の `enabled` 状態が変化したとき textarea が新しい自動生成テキストに追従することを検証（rerender を使って検証）

## Completion criteria

- [ ] 設定画面を開いて `enabled: true` のアレルゲンが 1 件以上あるとき、アレルゲン設定リストの下部（言語設定の上）に「お店予約用テキスト」セクションが表示される
- [ ] 設定画面を開いて全アレルゲンが `enabled: false` のとき、「お店予約用テキスト」セクションが DOM に存在しない（`grep -q 'reservationText' DOM` 相当ではなく要素の非存在をテストで確認）
- [ ] `enabled: true` の品目名が textarea に生成テキストとして表示される（`buildReservationText` の出力と一致）
- [ ] textarea に任意の文字列を入力できる（readonly でない）
- [ ] 「再生成」ボタン押下後、textarea の値が `buildReservationText` の最新出力値に戻る
- [ ] アレルゲンのトグル操作後、textarea が新しい自動生成テキストにリセットされる
- [ ] 「コピーする」ボタンを押すと `navigator.clipboard.writeText(textarea.value)` が呼ばれる（テストでモック確認）
- [ ] コピー成功後 2 秒間、ボタンテキストがコピー完了表示に変わる（テストで確認）
- [ ] 「コピーする」ボタン押下時に `navigator.clipboard.writeText` が例外を投げてもページがクラッシュしない（テストでモック確認）
- [ ] `frontend/src/app/settings/page.tsx` 内に日本語・英語の UIテキストがハードコードされていない（`grep -E '[^\x00-\x7F]' frontend/src/app/settings/page.tsx` で i18n キー以外の日本語文字列が存在しない）
- [ ] `frontend/public/locales/ja/settings.json` に `reservationText` キーが存在する（`grep -q 'reservationText' frontend/public/locales/ja/settings.json`）
- [ ] `frontend/public/locales/en/settings.json` に `reservationText` キーが存在する（`grep -q 'reservationText' frontend/public/locales/en/settings.json`）
- [ ] `frontend/src/lib/reservation-text.util.ts` に `buildReservationText` 関数が定義されている（`grep -q 'buildReservationText' frontend/src/lib/reservation-text.util.ts`）
- [ ] `frontend/src/app/settings/page.tsx` に `fetch(` の直接呼び出しが存在しない（`grep -c 'fetch(' frontend/src/app/settings/page.tsx` が 0）
- [ ] `frontend/src/app/settings/page.tsx` に `as any` / `@ts-ignore` が新規追加されていない
- [ ] `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter frontend test` が全 PASS（新規テスト 7 件以上を含む）で終了する

## Implementation summary

### Phase 1: テキスト生成ロジック
- `frontend/src/lib/reservation-text.util.ts` を新規作成（L1〜L24）
  - `buildReservationText(enabledNames, format)` 関数を定義
  - フォーマット文字列（prefix/suffix/separator）は呼び出し元が `t()` で取得して渡す設計（ハードコード禁止を遵守）

### Phase 2: i18n キー追加
- `frontend/public/locales/ja/settings.json` に `reservationText` オブジェクトを追加（title/description/copyButton/copiedButton/regenerateButton/copyError/format）
- `frontend/public/locales/en/settings.json` に同構造の英語キーを追加

### Phase 3: コンポーネント分離・UI 追加
- `frontend/src/app/settings/ReservationTextSection.tsx` を新規作成（テスト可能な独立コンポーネントとして分離）
  - `enabled: true` 0件時は `null` を返す（R2）
  - `useEffect([generatedText])` で allergies/locale 変化時に textarea をリセット（R5）
  - `navigator.clipboard` 存在チェック + `try/catch` でクラッシュ防止（R7）
  - `COPY_FEEDBACK_DURATION_MS = 2000` 定数でコピー完了 2秒表示（R6）
- `frontend/src/app/settings/page.tsx` のアレルゲン設定セクション直後（言語設定の前）に `<ReservationTextSection>` を挿入（L272〜L278）

### Phase 4: テスト
- `frontend/src/lib/__tests__/reservation-text.util.test.ts` 新規作成（6件）
- `frontend/src/app/settings/__tests__/ReservationTextSection.test.tsx` 新規作成（7件）

## Plan deviation

none

## Risks

| リスク | 回避方針 |
|---|---|
| フォーマット文字列が i18n キー経由でなく util 内にハードコードされる | `reservation-text.util.ts` はフォーマット文字列を引数として受け取るか、呼び出し元（コンポーネント）が `t()` で取得したフォーマット文字列を渡す設計にする。util 内に日本語/英語文字列を直書きしない |
| `allergenGroups` がロード前に空配列のとき `display_name` が引けず品目名が空になる | `isLoading` 中はセクションを非表示にする（`isLoading` は `useSettings` から既に返されている）か、`display_name` が取れない場合は `allergens.name`（キー名）にフォールバックする |
| `navigator.clipboard` が `undefined` の環境（SSR / 古いブラウザ）でクラッシュする | `typeof navigator !== 'undefined' && navigator.clipboard` の存在チェックを行い、存在しない場合はコピーボタンを非表示にするか、`try/catch` で確実に捕捉する |
| textarea の state と自動生成テキストのリセットタイミングが不整合になる | `useEffect` の依存配列に `allergies` と `locale` を含め、変化のたびに自動生成テキストを再計算して `setText` する |

# Review comments

## 自動評価（2026-05-20 00:00） - ラウンド 1

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 2 / Info: 1）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 全項目通過、typecheck 0件、unit 164件全 PASS（新規14件含む））
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（新規ロジック `buildReservationText` に 6件、`ReservationTextSection` に 8件のテスト）
- 4. 敵対的観点: ✅（破壊的操作の防御 Critical/High 0 件）
- 5. 保守性: ✅（層違反 0 / アンチパターン 0 / マジックナンバー 0 / 冗長コメント 0）

### 改善提案（次タスク繰越し可）

#### [Low] ESLint `react-hooks/set-state-in-effect` 警告
**対象**: `frontend/src/app/settings/ReservationTextSection.tsx:48`

`useEffect` 内で `setText(generatedText)` を呼んでいるため、`eslint-config-next` の `react-hooks/set-state-in-effect` ルールがエラーを報告する（`npx eslint --max-warnings=0` で検出）。`next build` は Turbopack 経由のため現時点では通過するが、CI で ESLint を厳格実行した場合に失敗する可能性がある。

React 公式ドキュメントの ["You Might Not Need an Effect"](https://react.dev/learn/you-might-not-need-an-effect) で言及されているパターン。このユースケース（ユーザー編集可能な派生 state のリセット）では代替手段が限られるため動作上の問題はないが、将来的に `key` prop を使ったコンポーネントリセット方式への変更を検討すること。

#### [Low] `textarea` に `maxLength` 制限なし
**対象**: `frontend/src/app/settings/ReservationTextSection.tsx:80-86`

クライアントサイド完結の機能のため実害はないが、ユーザーが意図せず巨大テキストを貼り付けたとき UI が壊れる可能性がある。`maxLength={500}` 程度の制限を検討すること。

#### [Info] `locale` prop が destructure されていない
**対象**: `frontend/src/app/settings/ReservationTextSection.tsx:24-28`

Props 型に `locale: 'ja' | 'en'` が定義されているが、コンポーネント本体の destructuring に含まれておらず実際には使用されていない（`t` 関数経由でフォーマット文字列を取得するため、`locale` を直接参照する必要がない設計）。コメントには `useEffect の依存配列で format 変化を検知するために受け取る` と書かれているが、実際には `useEffect` の依存配列は `generatedText` のみであり、`locale` は依存に含まれていない。

現プロジェクトの `next-intl` 設定（`getMessages()` でサーバー側から静的取得）では、`locale` 変更時は実際にページリロードが発生するため実害はない。ただし Props 型と実装のコメントが乖離しているため、将来の開発者が混乱する可能性がある。Props から `locale` を削除するか、コメントを実態に即して修正することを検討すること。
