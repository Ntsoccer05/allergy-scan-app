# Task 00230: Playwright E2E テストセットアップと主要フロー実装

## Metadata

| Field | Value |
|---|---|
| Status | completed |
| Priority | high |
| Sprint | QA / Cross-cutting |
| Dependencies | 00050_scan-frontend-ui, 00110_settings_screen, 00180_pwa-manifest, 00200_reservation-text-section（実装済み済み） |

## Background

フロントエンド (`frontend/`) には現在 Jest ユニットテストのみ存在する（`frontend/package.json` の `"test": "jest --passWithNoTests"`）。Playwright E2E テストのセットアップは一切行われていない。

主要画面の実装状況:
- スキャン画面: `frontend/src/app/scan/page.tsx` — `useScan` Hook で状態管理、`ResultCard` で結果表示
- 設定画面: `frontend/src/app/settings/page.tsx` — アレルゲントグル、予約用テキストセクション
- `manifest.json`: `frontend/public/manifest.json` — `theme_color: "#4CAF50"` 定義済み
- `ScanResult` 型: `frontend/src/app/scan/scan.types.ts` — `BarcodeScanResponse`, `OcrScanResponse` 定義済み

フロントエンドの依存関係:
- Next.js 16.2.6（`frontend/package.json` L14）
- next-intl 4.12.0 (i18n)
- `pnpm --filter frontend test` = Jest ユニットテスト実行コマンド

E2E テストは `pnpm --filter frontend test:e2e` コマンドで独立して実行できるようにする。

## Requirements

- R1: `@playwright/test` を `frontend/` の devDependency として追加し、`frontend/playwright.config.ts` を作成する。テストディレクトリは `frontend/e2e/` とする
- R2: `frontend/package.json` の `scripts` に `"test:e2e": "playwright test"` を追加し、`pnpm --filter frontend test:e2e` で E2E テストを実行できるようにする
- R3: カメラ・マイクのブラウザ権限は Playwright の `use.permissions` または `browserContext.grantPermissions()` でモックする。実際のカメラ映像を必要としない
- R4: 実際の API 呼び出し（バックエンドへの HTTP リクエスト）はすべて `page.route()` でインターセプトしてモックレスポンスを返す
- R5: バーコードスキャンフローのテストを `frontend/e2e/barcode-scan.spec.ts` に実装する（要件は Background の設計ドキュメントに基づく）
- R6: OCR スキャンフローのテストを `frontend/e2e/ocr-scan.spec.ts` に実装する
- R7: PWA インストール条件確認のテストを `frontend/e2e/pwa.spec.ts` に実装する
- R8: GPS / 店舗選択フローのテストを `frontend/e2e/gps-store.spec.ts` に実装する
- R9: 設定画面フローのテストを `frontend/e2e/settings.spec.ts` に実装する
- R10: `as any` / `@ts-ignore` を新規導入しない
- R11: `pnpm --filter frontend typecheck` がエラー 0 件で終了する（`playwright.config.ts` や `e2e/` の型エラーなし）

## Implementation plan

### Phase 1: Playwright セットアップ

- `frontend/` に `@playwright/test` を devDependency として追加（`pnpm --filter frontend add -D @playwright/test`）
- `frontend/playwright.config.ts` を作成:
  - `testDir: './e2e'`
  - `use.baseURL`: 開発サーバー起動を前提とした `http://localhost:3000`
  - `use.permissions`: `['camera', 'microphone', 'geolocation']` を付与（実デバイス不要のモック前提）
  - `webServer`: `pnpm dev` でサーバー起動。`reuseExistingServer: !process.env.CI`
  - Chromium のみ（モバイルビュー）で実行。`use.viewport: { width: 390, height: 844 }`
- `frontend/package.json` に `"test:e2e": "playwright test"` を追加
- `frontend/tsconfig.json` の `include` に `"e2e/**/*"` を追加（generator が現行の include 構造を確認して適切に追記）

### Phase 2: バーコードスキャンフロー (`frontend/e2e/barcode-scan.spec.ts`)

以下を検証するテストを実装する:

1. スキャン画面 (`/scan`) が表示される — ページタイトルまたは `role="region"` の存在
2. カメラ映像エリア（`<video>` 要素）が DOM に存在する
3. `POST /api/scan/barcode` をモックして `{ found: true, judgment: 'ng', product_name: 'テスト商品', allergens: { contains: ['卵'], partial: [], components: [] }, detected: ['卵白', '卵黄'], from_cache: false }` を返す。`result` 状態への遷移（`ResultCard` の表示）を確認
4. 結果画面に判定絵文字（🔴）および判定ラベルが表示される
5. 免責文言（`caution` i18n キーに対応するテキスト要素）が結果画面に存在する

**モック方法**: バーコード検出は `useBarcode` 経由で ZXing.js が動作するが、E2E 環境では実際のバーコードを映す手段がない。`page.route()` で `POST /api/scan/barcode` をインターセプトしつつ、バーコード検出イベントを JS 実行（`page.evaluate()`）でシミュレートするか、スキャン状態を直接操作するアプローチを取る。具体的な実装方法は generator が `useScan` / `useBarcode` の実装を確認して判断する（TBD: generator 確認）

### Phase 3: OCR スキャンフロー (`frontend/e2e/ocr-scan.spec.ts`)

以下を検証するテストを実装する:

1. `POST /api/scan/barcode` が `{ found: false, from_cache: false }` を返す場合、OCR モードに切り替わる（`ScanGuide` が OCR 誘導テキストを表示するか、状態変化を確認）
2. `GET /api/scan/presigned-url` と `POST /api/scan/ocr` をモックして OCR 結果を返す。結果画面（`ResultCard`）が表示される
3. モック OCR レスポンス: `{ raw_text: '原材料: 小麦粉, 砂糖\n卵白', confidence: 'high', results: [{ allergen: '卵', judgment: '含む', detection_type: 'contains', detected: ['卵白'], risk_level: 'high', reason: '卵白を検出' }], highlights: [{ text: '卵白', judgment: 'ng' }], incomplete: false, price: null, price_with_tax: null, price_confidence: null }`
4. 結果画面に「原材料を確認する」ボタン（`rawTextExpand` i18n キー相当）が存在し、クリックすると `raw_text` のテキストが表示される
5. 免責文言が結果画面に存在する

### Phase 4: PWA 確認 (`frontend/e2e/pwa.spec.ts`)

以下を検証するテストを実装する:

1. `GET /manifest.json` が HTTP 200 を返す（`page.request.get()` または `page.goto('/manifest.json')` で確認）
2. `manifest.json` のレスポンスボディに `"theme_color"` キーが存在する（JSON.parse して確認）
3. スキャン画面 (`/scan`) の `<head>` 内に `name="theme-color"` の `<meta>` タグが存在する（`page.locator('meta[name="theme-color"]')` で確認）

### Phase 5: GPS / 店舗選択フロー (`frontend/e2e/gps-store.spec.ts`)

以下を検証するテストを実装する:

1. `navigator.geolocation` を `page.addInitScript()` でモック（`getCurrentPosition` の `successCallback` を即時呼び出し）して GPS 取得成功をシミュレート
2. `POST /api/scan/ocr` のモックレスポンスに `storeCandidates: [{ name: 'セブンイレブン新宿南口店', placeId: 'abc' }, { name: 'ファミリーマート新宿店', placeId: 'def' }]` を付与する
3. OCR 結果表示後、店舗候補が 2 件以上ある場合に店舗選択 UI（`t('selectStore')` 相当のテキストまたは候補ボタン）が画面に表示される

**注意**: `storeCandidates` は `ResultCard` の props 経由で渡される。`useScan` の GPS 取得フロー (`GEO_TIMEOUT_MS` 等) が E2E 環境でタイムアウトしないようモックする（TBD: generator が `useScan.ts` の GPS 呼び出し箇所を確認して適切なモック方法を判断）

### Phase 6: 設定画面フロー (`frontend/e2e/settings.spec.ts`)

以下を検証するテストを実装する:

1. `GET /api/users/me` と `GET /api/allergens` をモックしてアレルゲンマスターを返す。設定画面 (`/settings`) が表示される
2. アレルゲン設定のトグルボタン（最初の mandatory 品目）をクリックすると `PUT /api/users/me` が呼ばれる（`page.route()` でインターセプトして確認）
3. `enabled: true` の品目が 1 件以上あるとき、「お店予約用テキスト」セクション（`reservationText.title` i18n キー相当のテキスト）が表示される
4. コピーボタン（`reservationText.copyButton` i18n キー相当）が DOM に存在する

**モックデータ例**:
- `GET /api/users/me`: `{ id: 'test-user', allergies: { '卵': { enabled: true, partialAlert: true } }, locale: 'ja', onboarding_done: true }`
- `GET /api/allergens`: `[{ category: 'mandatory', label: '特定原材料', items: [{ name: '卵', display_name: '卵（鶏卵）', emoji: '🥚', display_order: 1, judgment_type: 'allergy' }] }]`

## Files to modify

| ファイル | 変更種別 |
|---|---|
| `frontend/package.json` | 変更（`devDependencies` に `@playwright/test` 追加、`scripts` に `test:e2e` 追加） |
| `frontend/playwright.config.ts` | 新規作成 |
| `frontend/tsconfig.json` | 変更（`include` に `"e2e/**/*"` 追加。generator が現行 include を確認して判断） |
| `frontend/e2e/barcode-scan.spec.ts` | 新規作成 |
| `frontend/e2e/ocr-scan.spec.ts` | 新規作成 |
| `frontend/e2e/pwa.spec.ts` | 新規作成 |
| `frontend/e2e/gps-store.spec.ts` | 新規作成 |
| `frontend/e2e/settings.spec.ts` | 新規作成 |

## Tests to add

- `frontend/e2e/barcode-scan.spec.ts`:
  - スキャン画面が表示される（`/scan` の `<video>` 要素存在確認）
  - バーコード検出モック後に ResultCard が表示される
  - ResultCard に判定絵文字（🔴）が存在する
  - ResultCard に免責文言要素が存在する
  - NG 判定時に追加免責メッセージが表示される

- `frontend/e2e/ocr-scan.spec.ts`:
  - OCR モックレスポンスで ResultCard が表示される
  - ResultCard に「原材料を確認する」ボタンが存在する
  - ボタンをクリックすると `raw_text` 内容が展開表示される
  - 免責文言要素が存在する

- `frontend/e2e/pwa.spec.ts`:
  - `GET /manifest.json` が 200 を返す
  - レスポンス JSON に `theme_color` キーが存在する
  - スキャン画面の `<head>` に `meta[name="theme-color"]` が存在する

- `frontend/e2e/gps-store.spec.ts`:
  - GPS モック後に OCR 結果が表示される
  - `storeCandidates` 2 件のとき店舗選択 UI が表示される

- `frontend/e2e/settings.spec.ts`:
  - 設定画面が表示される
  - アレルゲントグルのクリックで `PUT /api/users/me` が呼ばれる
  - `enabled: true` 品目が 1 件以上あるとき予約用テキストセクションが表示される
  - コピーボタンが存在する

## Completion criteria

- [ ] `frontend/playwright.config.ts` が存在する（`Test exists: ls frontend/playwright.config.ts` で確認）
- [ ] `frontend/package.json` の `scripts` に `"test:e2e"` キーが存在する（`grep -q '"test:e2e"' frontend/package.json`）
- [ ] `frontend/package.json` の `devDependencies` に `@playwright/test` が存在する（`grep -q '@playwright/test' frontend/package.json`）
- [ ] `frontend/e2e/barcode-scan.spec.ts` が存在する
- [ ] `frontend/e2e/ocr-scan.spec.ts` が存在する
- [ ] `frontend/e2e/pwa.spec.ts` が存在する
- [ ] `frontend/e2e/gps-store.spec.ts` が存在する
- [ ] `frontend/e2e/settings.spec.ts` が存在する
- [ ] `pwa.spec.ts` の「`GET /manifest.json` が 200 を返す」テストが PASS する（`pnpm --filter frontend test:e2e -- pwa.spec.ts` を実行）
- [ ] `pwa.spec.ts` の「`meta[name="theme-color"]` が存在する」テストが PASS する
- [ ] `settings.spec.ts` の「設定画面が表示される」テストが PASS する
- [ ] `settings.spec.ts` の「コピーボタンが存在する」テストが PASS する
- [ ] `barcode-scan.spec.ts` の「スキャン画面に `<video>` 要素が存在する」テストが PASS する
- [ ] `barcode-scan.spec.ts` の「ResultCard に免責文言要素が存在する」テストが PASS する
- [ ] `ocr-scan.spec.ts` の「raw_text 展開ボタンが存在する」テストが PASS する
- [ ] `gps-store.spec.ts` の「storeCandidates 2件のとき店舗選択 UI が表示される」テストが PASS する
- [ ] `pnpm --filter frontend test:e2e` を実行したとき全テストが PASS する（FAIL が 0 件）
- [ ] `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- [ ] テストファイルに `as any` または `@ts-ignore` が存在しない（`grep -r 'as any\|@ts-ignore' frontend/e2e/` が 0 件）
- [ ] 各テストファイルに `page.route()` による API モックが実装されており、実際のバックエンドに依存しない（`grep -r 'page.route' frontend/e2e/` が 1 件以上）
- [ ] `ResultCard` の免責文言テストで、`implementation_rules.md §3` に定義された文言（`scan.result.caution` i18n キー相当）の表示要素が確認される

## Risks

| リスク | 回避方針 |
|---|---|
| バーコード検出（ZXing.js）が E2E 環境で動作しない（実カメラ映像が不要なため検出イベントが発生しない） | `page.evaluate()` で `window` 上のバーコード検出コールバックを直接呼び出すか、`useScan` の状態をローカルストレージ経由で上書きするアプローチを取る。実装の詳細は generator が `useBarcode.ts` を確認して判断する |
| Next.js 16.2.6 の App Router と next-intl 4.12.0 の組み合わせで Playwright が middleware を正しく処理できない | `playwright.config.ts` の `webServer` で開発サーバーを起動し、実際の Next.js サーバー経由でテストする。SSR + middleware の動作を担保する |
| `navigator.geolocation` のモックが Playwright のコンテキスト設定だけでは不十分 | `page.addInitScript()` で `navigator.geolocation.getCurrentPosition` を上書きして `successCallback` を即時呼び出す |
| `pnpm --filter frontend test:e2e` 実行時に Playwright ブラウザがインストールされていない | `playwright.config.ts` の設定にブラウザインストール手順をコメントで明記する。CI 環境では `pnpm exec playwright install --with-deps chromium` を先行実行する前提 |
| `storeCandidates` が `ResultCard` に渡る経路が `useScan` → `page.tsx` → `ResultCard` であるため、E2E でのモックが複雑 | `POST /api/scan/ocr` のモックレスポンスに `storeCandidates` を含め、フロントエンドの `useScanApi.ts` が `storeCandidates` をどのように処理するかを generator が確認して適切な位置でモックする |

## Implementation summary

_（generator が記入）_

## Plan deviation

_（generator が記入）_

## Review comments

_（evaluator が記入）_
