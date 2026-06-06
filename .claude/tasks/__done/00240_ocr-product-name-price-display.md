# 00240 OCR結果への商品名・価格表示

## Status
`completed`

## Background

現状の OCR スキャンフロー（`POST /scan/ocr`）では Gemini からの `GeminiOcrResponse` に `price` / `price_with_tax` / `price_confidence` フィールドが返るが、フロントエンドの `ResultCard` / `OcrScanResponse` 型にはこれらが定義されているものの、**UI 上で価格を表示するロジックが存在しない**。

また `OcrScanResponse`（`frontend/src/app/scan/scan.types.ts` 67-75行）には `product_name` フィールドが存在しない。バックエンドの `processOcr` は Gemini レスポンスをそのまま返しており、OCR 結果から商品名を得る仕組みもない。

加えて、Gemini プロンプト（`backend/src/scan/prompts/allergen-detection.md` と `no-allergen.md`）は `product_name` を出力フィールドに含めていないため、Gemini が商品名を返すことができない状態にある。

### 現行の主要ファイル（generator が確認すべき箇所）

| ファイル | 現状 |
|---|---|
| `backend/src/scan/prompts/allergen-detection.md` | `product_name` フィールドなし |
| `backend/src/scan/prompts/no-allergen.md` | `product_name` フィールドなし |
| `backend/src/shared/types/gemini.types.ts` | `GeminiOcrResponse` に `product_name` フィールドあるか TBD（generator 確認） |
| `backend/src/shared/gemini.client.ts` | `validateGeminiResponse` で `product_name` をパースしているか TBD（generator 確認） |
| `frontend/src/app/scan/scan.types.ts` | `OcrScanResponse` に `product_name` なし、`price*` はある |
| `frontend/src/components/ResultCard.tsx` | `productName` は `result.type === 'barcode'` 時のみ表示（259-262行）、価格表示ロジックなし |
| `frontend/public/locales/ja/scan.json` | 価格・商品名向け i18n キーなし |
| `frontend/public/locales/en/scan.json` | 価格・商品名向け i18n キーなし |

---

## Requirements

R1: Gemini プロンプト（`allergen-detection.md` / `no-allergen.md`）の出力 JSON スキーマに `product_name: string | null` フィールドを追加し、商品名が読み取れる場合は返すよう指示する。読み取れない場合は `null` とする。

R2: バックエンドの `GeminiOcrResponse` 型（`backend/src/shared/types/gemini.types.ts` — generator が実際のパスを確認すること）に `product_name: string | null` フィールドを追加し、`gemini.client.ts` の `validateGeminiResponse` でパースする。

R3: `OcrScanResult`（`backend/src/scan/scan.service.ts` 51行）が `product_name` を含む `GeminiOcrResponse` をそのまま返すため、バックエンド API レスポンスに `product_name` が自動的に含まれること。`scan.service.ts` の `processOcr` / `processOcrStream` で `productName: null` をハードコードしている箇所（224行・331行相当）を `geminiResult.product_name` に変更する。

R4: フロントエンドの `OcrScanResponse` 型（`frontend/src/app/scan/scan.types.ts`）に `product_name: string | null` フィールドを追加する。

R5: `ResultCard.tsx` の商品名表示ブロック（バーコード時のみ表示、259-262行相当）を、OCR 結果にも対応させる。`result.type === 'ocr'` かつ `result.data.product_name` が truthy な場合に商品名を表示する。

R6: `ResultCard.tsx` に価格表示ブロックを追加する。`result.type === 'ocr'` かつ `result.data.price_confidence === 'high'` の場合のみ表示する（`coding_rules.md` §価格表示ルール）。`price_confidence` が `'low'` または `null` の場合は表示しない（空欄・ゼロ表示しない）。税込み価格（`price_with_tax`）が存在する場合は税込み価格を優先して表示し、なければ税抜き価格（`price`）を表示する。

R7: 商品名・価格の UI テキストはすべて i18n キー（`t('キー名')`）で管理する。`frontend/public/locales/ja/scan.json` と `frontend/public/locales/en/scan.json` に必要なキーを追加する。ハードコード禁止（`anti_patterns.md` #17）。

---

## Implementation plan

### Phase 1: バックエンド Gemini スキーマ拡張

1. `allergen-detection.md` と `no-allergen.md` の出力 JSON スキーマに `"product_name": "商品名 | null"` を追加し、ラベルから商品名が読み取れる場合は文字列を、読み取れない場合は `null` を返すよう指示文を追加する
2. `GeminiOcrResponse` 型に `product_name: string | null` を追加する
3. `gemini.client.ts` の `validateGeminiResponse` で `product_name` を安全にパースする（文字列なら文字列、それ以外は `null`）
4. `FALLBACK_RESPONSE` に `product_name: null` を追加する

### Phase 2: バックエンド Service 修正

5. `scan.service.ts` の `processOcr`・`processOcrStream` で `productRepository.upsertByHash` に渡す `productName` を `null` から `geminiResult.product_name ?? null` に変更する

### Phase 3: フロントエンド型・表示実装

6. `scan.types.ts` の `OcrScanResponse` に `product_name: string | null` を追加する
7. `ResultCard.tsx` に商品名表示ブロック（OCR 時）と価格表示ブロックを追加する
8. `locales/ja/scan.json` と `locales/en/scan.json` に価格・商品名の i18n キーを追加する

---

## Files to modify

- `backend/src/scan/prompts/allergen-detection.md`
- `backend/src/scan/prompts/no-allergen.md`
- `backend/src/shared/types/gemini.types.ts`（パスは generator が確認すること）
- `backend/src/shared/gemini.client.ts`
- `backend/src/scan/scan.service.ts`
- `frontend/src/app/scan/scan.types.ts`
- `frontend/src/components/ResultCard.tsx`
- `frontend/public/locales/ja/scan.json`
- `frontend/public/locales/en/scan.json`

---

## Tests to add

- `backend/src/shared/gemini.client.ts` の `validateGeminiResponse` に対するユニットテスト（既存テストファイルがあれば追記、なければ新規作成）:
  - Gemini レスポンスに `product_name: "テスト商品"` が含まれる場合に正しくパースされること
  - Gemini レスポンスに `product_name` が欠如している場合に `null` が返ること
  - Gemini レスポンスに `product_name: 123`（非文字列）が含まれる場合に `null` が返ること
- `frontend/src/components/ResultCard.tsx` のスナップショットテストまたは RTL テスト（既存テストがあれば追記）:
  - OCR 結果に `product_name: "テスト商品"` が含まれる場合に商品名が DOM に表示されること
  - `price_confidence: 'high'` かつ `price_with_tax: 321` の場合に価格が表示されること
  - `price_confidence: 'low'` の場合に価格が表示されないこと
  - `price_confidence: null` の場合に価格が表示されないこと

---

## Completion criteria

- [ ] `POST /scan/ocr` の Gemini レスポンスをモックした結合テストまたは手動確認で、バックエンドが返す JSON に `product_name` フィールドが含まれる（`null` 含む）
- [ ] バックエンドの型チェックが通る: `pnpm --filter backend typecheck` がエラーなしで完了する
- [ ] フロントエンドの型チェックが通る: `pnpm --filter frontend typecheck` がエラーなしで完了する
- [ ] `ResultCard` に OCR 結果として `product_name: "テスト商品"` を渡した場合、"テスト商品" が DOM 内に存在する（テストまたは開発サーバーで確認可能な状態）
- [ ] `ResultCard` に `price_confidence: 'high'` かつ `price_with_tax: 321` を渡した場合、`321` を含むテキストが DOM 内に存在する
- [ ] `ResultCard` に `price_confidence: 'low'` を渡した場合、価格数値が DOM 内に存在しない
- [ ] `ResultCard` に `price_confidence: null` を渡した場合、価格数値が DOM 内に存在しない
- [ ] `grep "product_name" frontend/public/locales/ja/scan.json` または `grep "price" frontend/public/locales/ja/scan.json` で価格・商品名向けキーがヒットする（i18n キーが追加されている）
- [ ] `grep "product_name" frontend/public/locales/en/scan.json` または `grep "price" frontend/public/locales/en/scan.json` で en ロケールにも同キーが存在する
- [ ] `ResultCard.tsx` 内に価格または商品名の日本語文字列が直接ハードコードされていない（`grep -n "税込\|商品名\|円" frontend/src/components/ResultCard.tsx` でヒットしない）
- [ ] `gemini.client.ts` の `validateGeminiResponse` 関連ユニットテストが `pnpm --filter backend test` で全件 PASS する
- [ ] `as any` / `@ts-ignore` が新規追加されていない（`grep -rn "as any\|@ts-ignore" backend/src/shared/gemini.client.ts frontend/src/components/ResultCard.tsx` でヒットしない）

---

## Risks

| リスク | 対策 |
|---|---|
| Gemini がプロンプト追加後に `product_name` を安定して返さない | `validateGeminiResponse` で `null` フォールバックを必ず実装する。UI は `product_name` が `null` の場合は商品名欄を表示しない（欠如が通常状態でも動作に支障なし） |
| `price_confidence: 'high'` でも価格が実際と異なる可能性 | 価格は参考情報として表示する。免責 UI（`caution` キー）が常時表示されているため追加の対処は不要。R6 の表示条件（`price_confidence === 'high'` のみ）を厳守する |
| `OcrScanResponse` の型変更が `useScan.ts` / `useScanApi.ts` 等の下流に影響 | `product_name?: string | null`（オプショナル）として追加すれば既存コードのコンパイルエラーを最小化できる。generator が型チェックで確認すること |
| `processOcr` / `processOcrStream` の `productName` 変更が products テーブルの UPSERT に影響 | `product_name` は `null` → `geminiResult.product_name ?? null` への変更であり、`null` フォールバックを維持するため後退リスクは低い |

---

## Implementation summary

### Phase 1: バックエンド Gemini スキーマ拡張（L1〜L4）

- `backend/src/shared/types/gemini.types.ts`: `GeminiOcrResponse` 型に `product_name: string | null` を追加（L34）
- `backend/src/shared/gemini.client.ts`: `FALLBACK_RESPONSE` に `product_name: null` を追加（L63）、`validateGeminiResponse` でパース（L221-222）
- `backend/src/scan/prompts/allergen-detection.md`: ルール行と出力 JSON スキーマに `product_name` フィールドを追加（L50、L86）
- `backend/src/scan/prompts/no-allergen.md`: ルール行と出力 JSON スキーマに `product_name` フィールドを追加（L17、L43）

### Phase 2: バックエンド Service 修正（L5）

- `backend/src/scan/scan.service.ts`: `processOcr`（L225）と `processOcrStream`（L330）の両方で `productName: null` → `geminiResult.product_name ?? null` に変更
- `scan.service.spec.ts` / `scan.controller.spec.ts`: `GeminiOcrResponse` モックに `product_name: null` を追加（型チェック対応）

### Phase 3: フロントエンド型・表示実装（L6〜L8）

- `frontend/src/app/scan/scan.types.ts`: `OcrScanResponse` に `product_name?: string | null` を追加（L75）
- `frontend/src/components/ResultCard.tsx`: OCR 時の商品名表示（`productName` 変数を OCR にも対応、L229-235）、`ocrPrice` 変数（`price_confidence === 'high'` のとき `price_with_tax ?? price`、L236-239）、価格表示ブロック追加（L277-281）
- `frontend/public/locales/ja/scan.json`: `productNameLabel`・`priceLabel`・`priceValue` を追加（L37-39）
- `frontend/public/locales/en/scan.json`: `productNameLabel`・`priceLabel`・`priceValue` を追加（L35-37）
- `frontend/src/__mocks__/next-intl.tsx`: ICU 変数補間（`{price}` → 値）対応を追加（テスト環境）

### テスト追加

- `backend/src/shared/gemini.client.spec.ts`（新規）: `validateGeminiResponse` の `product_name` パース 4ケース
- `frontend/src/components/ResultCard.test.tsx`: 商品名表示 2ケース、価格表示 4ケース

## Plan deviation

- `gemini-prompt.builder.spec.ts` の4件が本タスクの変更前から既に失敗していることを確認（`prompt.split('【検出対象外')[0]` というテストコードがプロンプトファイルの実際の区切り文字列と一致しないバグ）。本タスクのスコープ外（`Files to modify` 非対象）のため修正せず、別タスク化を提案する。
- `next-intl.tsx` モックへの変数補間対応を追加（`Files to modify` 外だが `priceValue` の RTL テストを通すために最小限の変更として実施）。

## Review comments

## 自動評価（2026-05-21 評価） - ラウンド 1

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 2 / Info: 1）

### Threshold 達成状況
- 1. 動作性: ✅（typecheck 0 件、unit test 全合格 — gemini.client.spec.ts 4件 PASS、ResultCard.test.tsx 6件含む 168件 PASS。gemini-prompt.builder.spec.ts 既存4件失敗はタスクスコープ外）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（新規ロジックに対して単体テスト完備 — validateGeminiResponse 4ケース、ResultCard 価格・商品名 6ケース）
- 4. 敵対的観点: ✅（Critical/High 0 件。product_name へのユーザー入力は React の JSX 描画で XSS 防止済み。price は number 型検証で数値以外は null 落ち）
- 5. 保守性: ✅（層違反 0 / アンチパターン再導入 0 / マジックナンバー 0）

### 改善提案（次タスク繰越し可）

#### [Maintainability / i18n] buildShareContent 内の日本語文字列ハードコード（既存問題、本タスク外）
`frontend/src/components/ResultCard.tsx:64-68` の `buildShareContent` 関数内で `'商品'` と `'はアレルギーなし（${title}調べ）'` が日本語でハードコードされている。この関数はコンポーネント外の純粋関数のため `t()` を直接呼べず、今回のタスクで新規追加された箇所ではない（前バージョンから存在）。英語ロケール時に共有テキストが日本語のままになる。別タスクとして `t()` を引数で渡すか、関数をコンポーネント内に移動して対処すること。
重大度: Low

#### [Maintainability / i18n] aria-label="スキャン結果" のハードコード（既存問題、本タスク外）
`frontend/src/components/ResultCard.tsx` で `aria-label="スキャン結果"` が複数箇所でハードコードされている。本タスクで追加された low_confidence UI と isUnreadable UI にも同様のハードコードが踏襲されている。スクリーンリーダー向けのアクセシビリティテキストも i18n 対象として管理することを推奨。別タスクとして整理すること。
重大度: Low

#### [Info] gemini-prompt.builder.spec.ts 既存失敗 4 件の別タスク化
generator が Plan deviation で言及しているとおり、`gemini-prompt.builder.spec.ts` の4件はプロンプトファイルの区切り文字列変更に起因する既存失敗。本タスクスコープ外のため未修正は妥当。ただし CI 上で常時 FAIL しているため、早急に別タスクとして修正することを推奨する。
重大度: Info
