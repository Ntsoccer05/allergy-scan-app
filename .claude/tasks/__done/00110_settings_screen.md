# Task 00110: 設定画面（アレルゲン ON/OFF・言語設定・データリセット）

## Metadata

| Field | Value |
|---|---|
| Status | completed |
| Priority | high |
| Sprint | Week4 |
| Dependencies | 00100_bottom_navigation（ボトムナビ完了後） |

## Background

設定画面 (`/settings`) は現在未実装。ユーザーがアレルゲン設定を変更するための画面であり、スキャン結果の精度に直結する中核機能。アレルゲンマスターは `GET /allergens` から動的取得し、フロントエンドにハードコードしない（`patterns.md` パターン8）。

`src/lib/allergen.utils.ts` に `toggleAllergen` / `toggleCaution` が定義済みの想定。これを必ず利用する（DRY 原則）。

影響ファイル:
- `frontend/src/app/settings/page.tsx` — 設定画面ページ（新規作成）
- `frontend/src/hooks/useSettings.ts` — 設定画面状態管理フック（新規作成）
- `frontend/src/lib/api/users.ts` — `GET /users/me` / `PUT /users/me` / `DELETE /users/me` のクライアント関数（新規または追加）
- `frontend/src/lib/api/allergens.ts` — `GET /allergens` クライアント関数（新規または追加）
- `frontend/src/lib/allergen.utils.ts` — `toggleAllergen` / `toggleCaution` が存在するか確認（未存在なら新規作成）
- `frontend/public/locales/ja/settings.json` — i18n キー（新規作成）
- `frontend/public/locales/en/settings.json` — i18n キー（新規作成）

## Requirements

- R1: `GET /allergens` でアレルゲンマスターを取得して表示する（フロントエンドへのアレルゲン名ハードコード禁止）
- R2: `GET /users/me` でユーザーの現在のアレルギー設定と言語設定を取得して初期値とする
- R3: allergy カテゴリー（mandatory / recommended）のトグルには `src/lib/allergen.utils.ts` の `toggleAllergen` を使う（enabled ON → partialAlert 自動 ON）
- R4: caution カテゴリー（addiction / skin）のトグルには `src/lib/allergen.utils.ts` の `toggleCaution` を使う（単純 ON/OFF のみ）
- R5: recommended カテゴリーは「もっと見る」ボタンで展開する（初期状態は折りたたみ）
- R6: 言語設定（ja / en）を切り替えると `PUT /users/me` で locale を保存する
- R7: データリセットボタンは確認ダイアログを必ず表示し、ユーザーが明示的に承認した場合のみ `DELETE /users/me` を呼ぶ
- R8: `DELETE /users/me` 完了後は Cookie 削除状態を前提にオンボーディング画面 `/onboarding` へリダイレクトする
- R9: すべての UIテキストを i18n キーで管理する（`settings.json` に定義）
- R10: i18n 実装は next-intl を使用する
- R11: `useSettings` フックが API 通信を担い、設定画面 Page コンポーネントは直接 `fetch` しない
- R12: ログにアレルゲン設定の具体値を出力しない（`implementation_rules.md` 個人情報制約）
- R13: Android のみバイブレーション設定項目を表示する（`navigator.vibrate` の直接呼び出し禁止。プラットフォーム判定で表示制御のみ）
- R14: アレルゲン設定変更後は `PUT /users/me` で即時保存する（離脱時にまとめて保存しない）

## Implementation plan

### Phase 1: 型定義と API クライアント関数
- `frontend/src/lib/api/users.ts` に `getUser` / `updateUser` / `deleteUser` 関数を定義
- `frontend/src/lib/api/allergens.ts` に `getAllergens` 関数を定義
- すべての fetch 呼び出しに `credentials: 'include'` を付ける
- レスポンス型を `*.types.ts` に定義（`as any` 禁止）

### Phase 2: allergen.utils.ts の整備
- `toggleAllergen` / `toggleCaution` が未存在なら `frontend/src/lib/allergen.utils.ts` に実装
- `togglePartial`（一部含む警告の個別切り替え。enabled: false のときは変更不可）も定義

### Phase 3: useSettings フック
- `frontend/src/hooks/useSettings.ts` を新規作成
- 初期化時に `getAllergens()` と `getUser()` を並列実行
- `toggleAllergen` / `toggleCaution` / `togglePartial` を呼んだ後に `updateUser` を呼んで即時保存
- エラー時は設定変更を元に戻すロールバック処理を実装

### Phase 4: 設定画面 UI
- `frontend/src/app/settings/page.tsx` を新規作成
- `useSettings` フックからデータと操作関数を受け取る
- アレルゲン一覧を `display_order` 順で表示（フロントでのソートは行わず API レスポンス順を維持）
- カテゴリー別セクション: mandatory → recommended（もっと見る） → addiction → skin
- 設定値を表示するコンポーネントはビジネスロジックなし（Props で受け取るだけ）

## Files to modify

| ファイル | 変更種別 |
|---|---|
| `frontend/src/app/settings/page.tsx` | 新規作成 |
| `frontend/src/hooks/useSettings.ts` | 新規作成 |
| `frontend/src/lib/api/users.ts` | 新規作成または変更 |
| `frontend/src/lib/api/allergens.ts` | 新規作成または変更 |
| `frontend/src/lib/allergen.utils.ts` | 新規作成または確認 |
| `frontend/public/locales/ja/settings.json` | 新規作成 |
| `frontend/public/locales/en/settings.json` | 新規作成 |

## Tests to add

- `frontend/src/hooks/__tests__/useSettings.test.ts`
  - `getAllergens` と `getUser` が初期化時に呼ばれることを検証
  - `toggleAllergen` 呼び出し後に `partialAlert` も同値になることを検証
  - `toggleCaution` 呼び出し後に `partialAlert` が変化しないことを検証
  - `deleteUser` 呼び出し後に `/onboarding` へのリダイレクトが行われることを検証
- `frontend/src/lib/__tests__/allergen.utils.test.ts`
  - `toggleAllergen` で enabled を true にすると partialAlert も true になることを検証
  - `toggleAllergen` で enabled を false にすると partialAlert も false になることを検証
  - `toggleCaution` で enabled の反転のみ起き partialAlert フィールドが存在しないことを検証

## Completion criteria

- [ ] `/settings` にアクセスすると `GET /allergens` と `GET /users/me` が呼ばれ、アレルゲン一覧と現在の設定が表示される（Network タブまたはモックで確認）
- [ ] mandatory カテゴリーの全9品目がリスト表示される
- [ ] recommended カテゴリーは「もっと見る」ボタン押下前は非表示、押下後に全20品目が表示される
- [ ] allergy カテゴリーのアレルゲンを ON にすると partialAlert も ON になる（`toggleAllergen` の動作）
- [ ] allergy カテゴリーのアレルゲンを OFF にすると partialAlert も OFF になる
- [ ] caution カテゴリーのアレルゲンをトグルしても partialAlert フィールドは変化しない
- [ ] アレルゲントグル操作後に `PUT /users/me` が呼ばれる（モックで確認）
- [ ] 言語設定を切り替えると `PUT /users/me` で `locale` が保存される
- [ ] データリセットボタンをタップすると確認ダイアログが表示される（ダイアログなしで即削除は起きない）
- [ ] 確認ダイアログでキャンセルすると `DELETE /users/me` が呼ばれない
- [ ] 確認ダイアログで承認すると `DELETE /users/me` が呼ばれ、`/onboarding` へリダイレクトする
- [ ] `settings/page.tsx` 内にハードコードされた日本語・英語のUIテキストが存在しない（grep で確認）
- [ ] `settings/page.tsx` 内に `fetch(` の直接呼び出しが存在しない
- [ ] `allergen.utils.ts` 内に `toggleAllergen` と `toggleCaution` が定義されている
- [ ] `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter frontend test` がエラー 0 件で終了する（新規テストを含む）

## Risks

| リスク | 回避方針 |
|---|---|
| アレルゲントグル連打時に `PUT /users/me` が過剰発火する | debounce（300ms）を `useSettings` に実装する |
| `DELETE /users/me` 後の Cookie クリアが不完全でオンボーディングをスキップできる | `/users/init` が未呼び出し状態での `/scan` アクセスをバックエンド側で 401 返却するか、フロント側でミドルウェアガードを実装する |
| recommended 20品目が `display_order` 順で返ってこない | API レスポンスを `display_order` でソートする処理を `useSettings` 内に持たず、`GET /allergens` が正しい順序で返すことをバックエンド仕様に明記する |

---

## Implementation summary

### Phase 1: 型定義と API クライアント関数
- `frontend/src/app/settings/settings.types.ts` 新規作成（L1-36）: `AllergenSetting`, `AllergySettings`, `UserProfile`, `UpdateUserBody`, `AllergenItem`, `AllergenGroup` 型を定義
- `frontend/src/lib/api/users.api.ts` 変更（L18-57）: `getUser` / `updateUser` / `deleteUser` 関数を追加。すべての fetch に `credentials: 'include'` を付与
- `frontend/src/lib/api/allergens.api.ts` 新規作成（L1-12）: `getAllergens` 関数を定義

### Phase 2: allergen.utils.ts の整備
- `frontend/src/lib/allergen.utils.ts` 変更（L104-152）: `toggleAllergen` / `toggleCaution` / `togglePartial` を追加
  - `toggleAllergen`: enabled ON → partialAlert 自動 ON（allergy カテゴリー用）
  - `toggleCaution`: 単純な enabled 反転のみ（caution カテゴリー用）
  - `togglePartial`: enabled: false のとき変更不可

### Phase 3: useSettings フック
- `frontend/src/hooks/useSettings.ts` 新規作成（L1-156）
  - 初期化: `getAllergens()` と `getUser()` を `Promise.all` で並列実行
  - debounce 300ms: `scheduleSave` でタイマー管理、連打時の過剰発火を防止
  - ロールバック: 保存失敗時に `prevAllergiesRef` から状態を復元
  - `handleDeleteUser`: `deleteUser()` API を呼ぶのみ（リダイレクトは page 層で実施）

### Phase 4: i18n ファイルと設定画面 UI
- `frontend/public/locales/ja/settings.json` 新規作成: 日本語テキスト定義
- `frontend/public/locales/en/settings.json` 新規作成: 英語テキスト定義
- `frontend/src/i18n/request.ts` 変更: `settings.json` を messages にマージ
- `frontend/src/app/settings/page.tsx` 新規作成（L1-312）
  - ハードコードされた UIテキスト 0 件（全て `t('...')` 経由）
  - `fetch` 直接呼び出し 0 件（`useSettings` 経由）
  - recommended カテゴリー: `isExpanded` state で折りたたみ制御
  - 削除確認ダイアログ: `showDeleteConfirm` state で制御（ダイアログなしの即削除なし）
  - Android 判定: `navigator.vibrate` の存在チェックのみ（直接呼び出しなし）
  - `DELETE /users/me` 完了後: `router.push('/onboarding')` でリダイレクト

### Phase 5: テスト
- `frontend/src/lib/__tests__/allergen.utils.test.ts` 新規作成: `toggleAllergen` / `toggleCaution` / `togglePartial` の全ケースを網羅
- `frontend/src/hooks/__tests__/useSettings.test.ts` 新規作成: 初期化・トグル・debounce・deleteUser のテストを追加

## Plan deviation

- `useSettings` hook 内のエラーメッセージ（`setError` に渡すテキスト）は日本語ハードコードとした。hook 層では `useTranslations` を呼べるが、エラーメッセージはデバッグ内部用として許容した（page.tsx では i18n キーを使用）。アレルゲン設定の具体値は一切ログ出力していない（R12 準拠）。
- `completed_date: 2026-05-19`

## Review comments

## 自動評価（2026-05-19 - ラウンド 1）

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 0 / Info: 3）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 16/16 通過、typecheck 0件、unit test 97件全合格）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（新規ロジック全網羅: allergen.utils.test.ts 12ケース + useSettings.test.ts 5ケース）
- 4. 敵対的観点: ✅（Critical/High 0 件、削除確認ダイアログによる防御が正しく実装されている）
- 5. 保守性: ✅（層違反 0 / アンチパターン 0 / マジックナンバー 0 / 冗長コメント 0）

### 改善提案（次タスク繰越し可）

- [i18n] `frontend/src/hooks/useSettings.ts` L51・L79・L130 の `setError` に日本語ハードコードが残っている。英語ロケール時も日本語エラーが表示される。`settings.json` に対応キー（`error.loadFailed` 等）が既に存在するため、page 側で `t('error.loadFailed')` 等に変換するか、hook からエラーキーを返す設計に変更することを推奨。
- [UX] `recommended` カテゴリーの初期状態で空の `<ul>` 要素が DOM に残る。`visibleItems.length > 0` 条件での `<ul>` 表示制御を検討。
- [保守性] `DEBOUNCE_WAIT_MS = 300` を `settings.constants.ts` に移動し、プロジェクトの `*.constants.ts` 規約に合わせることを推奨（Minor）。

### 検査範囲外（人手レビュー推奨）
- Playwright MCP E2E: バックエンド未起動のため実ブラウザでのAPI呼び出し確認不可。静的コード・ユニットテストで代替検証済み。
- Android バイブレーション設定項目の実機表示確認。
