# 00097 OCR レスポンス型の旧設計残存修正（is_high_risk 除去・results[] 配列導入）

## Metadata

| Key | Value |
|---|---|
| Status | completed |
| Priority | high |
| Created | 2026-05-19 |
| Completed | 2026-05-19 |
| Sprint | Week2（OCRスキャン型修正） |

---

## Background

`coding_rules.md` の `API レスポンス形式` セクションは `OcrResponse` の設計として `results: AllergenResult[]` 配列と `risk_level: 'high' | 'medium' | 'low' | 'ignore'` 型を定義している。しかし以下のファイルに旧設計フィールド `is_high_risk: boolean` が残存しており、新設計との不整合が生じている。

### 残存箇所（Read で確認済み）

| ファイル | 残存内容 |
|---|---|
| `backend/src/shared/types/gemini.types.ts` L10 | `GeminiOcrResponse` に `is_high_risk: boolean` フィールドが存在。`results: AllergenResult[]` フィールドが存在しない |
| `backend/src/shared/types/gemini.types.ts` L8-9 | `judgment: '含む' \| '一部含む' \| 'なし' \| '判定不能'` と `detected: string[]` が直接フィールドとして存在（results[] に集約されていない） |
| `backend/src/shared/gemini.client.ts` L18 | `FALLBACK_RESPONSE` の `is_high_risk: false` |
| `backend/src/shared/gemini.client.ts` L109-110 | `validateGeminiResponse` 内で `is_high_risk` を参照・設定 |
| `backend/src/scan/scan.service.spec.ts` L37 | `validGeminiResponse` モックに `is_high_risk: true` |
| `backend/src/scan/scan.controller.spec.ts` L28 | `validOcrResponse` モックに `is_high_risk: true` |
| `frontend/src/app/scan/scan.types.ts` L51 | `OcrScanResponse` に `is_high_risk: boolean` |
| `frontend/src/components/ResultCard.test.tsx` L17 | `makeOcrResult` の `data` に `is_high_risk: judgment === '含む'` |
| `frontend/src/hooks/useScan.spec.ts` L142 | `RESULT` ペイロードに `is_high_risk: true` |
| `backend/src/scan/prompts/allergen-detection.txt` L25 | Gemini への出力例 JSON に `"is_high_risk": true` |
| `backend/src/scan/prompts/no-allergen.txt` L17 | Gemini への出力例 JSON に `"is_high_risk": false` |

### 新設計（coding_rules.md 準拠）

```typescript
type RiskLevel = 'high' | 'medium' | 'low' | 'ignore'
type DetectionType = 'contains' | 'partial' | 'may_contain'
type JudgmentResult = '含む' | '一部含む' | 'なし' | '判定不能'

type AllergenResult = {
  allergen: string
  judgment: JudgmentResult
  detection_type: DetectionType
  detected: string[]
  risk_level: RiskLevel
  reason: string
}

type OcrResponse = {
  raw_text: string
  confidence: Confidence
  results: AllergenResult[]
  highlights: HighlightItem[]
  incomplete: boolean
  price: number | null
  price_with_tax: number | null
  price_confidence: 'high' | 'low' | null
}
```

### 前タスクとの関係

タスク `00095_allergen-component-schema-redesign` で `BarcodeScanResponse.is_high_risk` は削除済み。本タスクは同タスクの `Implementation summary` で「本タスクスコープ外」とされた `GeminiOcrResponse.is_high_risk` 残存の後続修正である。

---

## Requirements

R1: `backend/src/shared/types/gemini.types.ts` の `GeminiOcrResponse` 型から `is_high_risk: boolean`、`judgment: ...`、`detected: string[]` を削除し、`results: AllergenResult[]` と `highlights: HighlightItem[]` を追加する。`AllergenResult` と `HighlightItem` は `coding_rules.md` の `API レスポンス形式` セクション定義に完全準拠する。

R2: `backend/src/shared/gemini.client.ts` の `FALLBACK_RESPONSE` から `is_high_risk` を削除し、新型の空 `results: []` と `highlights: []` に置き換える。`validateGeminiResponse` メソッドの `is_high_risk` 参照を削除し、代わりに Gemini レスポンスの `results[]` 配列を安全にパースするバリデーション処理を追加する（不正な値は安全側フォールバック: `results: []`）。

R3: `frontend/src/app/scan/scan.types.ts` の `OcrScanResponse` から `is_high_risk: boolean`、`judgment`、`detected` を削除し、`results: AllergenResult[]` と `highlights: HighlightItem[]` を追加する。`AllergenResult` と `HighlightItem` の型定義はこのファイルに新規定義するか、共通型ファイルからインポートする。

R4: `backend/src/scan/scan.service.spec.ts` の `validGeminiResponse` モックから `is_high_risk` を削除し、新型（`results: AllergenResult[]`、`highlights: HighlightItem[]`）に準拠させる。型エラーが発生しなくなること。

R5: `backend/src/scan/scan.controller.spec.ts` の `validOcrResponse` モックから `is_high_risk` を削除し、新型に準拠させる。型エラーが発生しなくなること。

R6: `frontend/src/components/ResultCard.test.tsx` の `makeOcrResult` 内の `is_high_risk` 参照を削除し、新型の `OcrScanResponse` に準拠させる。

R7: `frontend/src/hooks/useScan.spec.ts` の `RESULT` ペイロード内の `is_high_risk` を削除し、新型の `OcrScanResponse` に準拠させる。

R8: `backend/src/scan/prompts/allergen-detection.txt` と `no-allergen.txt` の出力例 JSON から `"is_high_risk"` フィールドを削除し、新設計の `results[]` 配列を含む JSON 例に更新する。

R9: `pnpm --filter backend typecheck` が終了コード 0 で終了する（型エラー 0 件）。

R10: `pnpm --filter frontend typecheck` が終了コード 0 で終了する（型エラー 0 件）。

R11: `pnpm --filter backend test` が全テスト PASS する（既存テストを壊さない）。

R12: `pnpm --filter frontend test` が全テスト PASS する（既存テストを壊さない）。

R13: `as any` または `@ts-ignore` を新規導入しない。

---

## Implementation plan

### Phase 1: 型定義の更新（バックエンド）

`backend/src/shared/types/gemini.types.ts` に `AllergenResult` と `HighlightItem` 型を定義し、`GeminiOcrResponse` を新設計に置き換える。`coding_rules.md` の定義をそのまま使用する。

### Phase 2: GeminiClient の更新

`FALLBACK_RESPONSE` と `validateGeminiResponse` を新型に合わせる。`results[]` 配列のパースは配列チェック + 各要素の型検証で安全に行う。不正値は安全側（`results: []`）にフォールバックする。既存の `toConfidence`・`toJudgment`・`toPriceConfidence` ヘルパーは維持または活用する。

### Phase 3: 型定義の更新（フロントエンド）

`frontend/src/app/scan/scan.types.ts` の `OcrScanResponse` を新型に置き換える。`AllergenResult`・`HighlightItem` 型をここに定義するか、フロントエンドの共通型ファイルに配置する（generator が既存ファイル構成に合わせて判断する）。

**ResultCard.tsx のスコープ制限**: 本タスクでは `ResultCard.tsx` の型エラー解消のみを行う（`results[0]?.judgment` 等で暫定アクセスする最小変更）。複数アレルゲンの本格的な表示 UI（全 `results[]` のリスト表示・`highlights[]` によるハイライト）は 00099 タスクで実施するため、本タスクでは UI ロジックを変更しない。

### Phase 4: モックデータ・テストファイルの修正

`scan.service.spec.ts`・`scan.controller.spec.ts`・`ResultCard.test.tsx`・`useScan.spec.ts` の `is_high_risk` を削除し、新型に対応するモックデータ（`results: [...]`、`highlights: [...]`）に更新する。テストのアサーション自体は変更しない範囲で最小限の修正にとどめる。

### Phase 5: プロンプトファイルの更新

`allergen-detection.txt` と `no-allergen.txt` の出力例 JSON を新設計に合わせる。`results[]` 配列の具体例を記載する。

---

## Files to modify

| ファイル | 変更内容 |
|---|---|
| `backend/src/shared/types/gemini.types.ts` | `AllergenResult`・`HighlightItem` 型追加、`GeminiOcrResponse` を新設計に置き換え（`is_high_risk` 削除、`results[]`・`highlights[]` 追加） |
| `backend/src/shared/gemini.client.ts` | `FALLBACK_RESPONSE` の `is_high_risk` 削除・`results: []`・`highlights: []` 追加、`validateGeminiResponse` の `is_high_risk` 参照削除・`results[]` パース追加 |
| `frontend/src/app/scan/scan.types.ts` | `OcrScanResponse` の `is_high_risk` 削除・`results[]`・`highlights[]` 追加、`AllergenResult`・`HighlightItem` 型追加 |
| `backend/src/scan/scan.service.spec.ts` | `validGeminiResponse` の `is_high_risk` 削除、新型に準拠したモック更新 |
| `backend/src/scan/scan.controller.spec.ts` | `validOcrResponse` の `is_high_risk` 削除、新型に準拠したモック更新 |
| `frontend/src/components/ResultCard.test.tsx` | `makeOcrResult` 内の `is_high_risk` 削除、新型に準拠 |
| `frontend/src/hooks/useScan.spec.ts` | `RESULT` ペイロードの `is_high_risk` 削除、新型に準拠 |
| `backend/src/scan/prompts/allergen-detection.txt` | 出力例 JSON から `is_high_risk` 削除、`results[]` 例を追加 |
| `backend/src/scan/prompts/no-allergen.txt` | 出力例 JSON から `is_high_risk` 削除、`results: []` 例を追加 |

---

## Tests to add

新規テストの追加は不要。既存テストのモックデータを新型に合わせて更新し、全テストが PASS すること。

`GeminiClient.validateGeminiResponse` が `results` フィールドを持つ Gemini レスポンスを正しくパースできることを確認する観点で、既存の正常系テストが通ることを確認する（`scan.service.spec.ts` 正常系がカバーしている）。

---

## Completion criteria

- [ ] `grep -r "is_high_risk" backend/src/ --include="*.ts"` の出力が 0 行である
- [ ] `grep -r "is_high_risk" frontend/src/ --include="*.ts" --include="*.tsx"` の出力が 0 行である
- [ ] `grep -r "is_high_risk" backend/src/scan/prompts/` の出力が 0 行である
- [ ] `grep "results" backend/src/shared/types/gemini.types.ts` が 1 件以上マッチする（`results: AllergenResult[]` が定義されている）
- [ ] `grep "results" frontend/src/app/scan/scan.types.ts` が 1 件以上マッチする（`results: AllergenResult[]` が定義されている）
- [ ] `grep "AllergenResult" backend/src/shared/types/gemini.types.ts` が 1 件以上マッチする
- [ ] `grep "AllergenResult" frontend/src/app/scan/scan.types.ts` が 1 件以上マッチする
- [ ] `grep "highlights" backend/src/shared/types/gemini.types.ts` が 1 件以上マッチする
- [ ] `grep "highlights" frontend/src/app/scan/scan.types.ts` が 1 件以上マッチする
- [ ] `grep "as any" backend/src/shared/gemini.client.ts` の出力が 0 行である
- [ ] `grep "@ts-ignore" backend/src/shared/gemini.client.ts` の出力が 0 行である
- [ ] `pnpm --filter backend typecheck` が終了コード 0 で終了する（出力に `error TS` を含まない）
- [ ] `pnpm --filter frontend typecheck` が終了コード 0 で終了する（出力に `error TS` を含まない）
- [ ] `pnpm --filter backend test` が全テスト PASS する（`Tests: X passed` と表示され、`failed` の文字列が出力されない）
- [ ] `pnpm --filter frontend test` が全テスト PASS する（`Tests: X passed` と表示され、`failed` の文字列が出力されない）

---

## Risks

| リスク | 影響 | 回避方針 |
|---|---|---|
| `GeminiOcrResponse` 型変更が `scan.service.ts` の `processOcr` 戻り値（`Promise<GeminiOcrResponse>`）に波及する | `scan.service.ts` の `processOcr` が `judgment`・`detected` を直接参照している場合に型エラーが連鎖する | generator は `grep -n "geminiResponse\." backend/src/scan/scan.service.ts` で参照箇所を事前確認し、`results[]` 経由のアクセスに変更する |
| `ResultCard.tsx` が `result.data.judgment` / `result.data.detected` を直接参照しており、`OcrScanResponse` 変更後に型エラーが発生する | フロントエンド型エラーが連鎖する | generator は `ResultCard.tsx` の型エラーを `results[0]?.judgment` 等の暫定アクセスで最小変更解消する。UI ロジック（全アレルゲン表示・ハイライト）は 00099 タスクで実施するため、本タスクでは変更しない |
| `scan.service.ts` の `processOcr` が `GeminiOcrResponse` を直接返しており、`ScanController` の HTTP レスポンス型と不整合が生じる | API レスポンスの実際の形状が変わることで既存クライアントが壊れる | generator は `scan.controller.ts` の `processOcr` 呼び出し箇所を確認し、型整合を維持する |

---

## Implementation summary

### Phase 1: バックエンド型定義の更新
- `backend/src/shared/types/gemini.types.ts` を全面書き換え
  - `GeminiOcrResponse` から `is_high_risk`、`judgment`、`detected`、`reason` を削除
  - `AllergenResult`、`HighlightItem` 型を新規定義（coding_rules.md API レスポンス形式準拠）
  - `RiskLevel`、`DetectionType`、`JudgmentResult`、`HighlightJudgment` 補助型を追加
  - `GeminiOcrResponse` に `results: AllergenResult[]`、`highlights: HighlightItem[]` を追加

### Phase 2: GeminiClient の更新
- `backend/src/shared/gemini.client.ts` を更新（L1-L215）
  - `FALLBACK_RESPONSE` から `is_high_risk`、`judgment`、`detected`、`reason` を削除し `results: []`、`highlights: []` に置き換え
  - `validateGeminiResponse` から `is_high_risk` 参照を削除
  - `toAllergenResults` ヘルパーを新規追加（results[] 配列の安全パース）
  - `toHighlightItems` ヘルパーを新規追加（highlights[] 配列の安全パース）
  - `toDetectionType`、`toRiskLevel`、`toHighlightJudgment` バリデーターを新規追加

### Phase 3: フロントエンド型定義と関連コンポーネントの更新
- `frontend/src/app/scan/scan.types.ts`（L1-L77）
  - `OcrScanResponse` から `is_high_risk`、`judgment`、`detected` を削除
  - `results: AllergenResult[]`、`highlights: HighlightItem[]` を追加
  - `AllergenResult`、`HighlightItem`、`RiskLevel`、`DetectionType`、`HighlightJudgment` を新規定義
- `frontend/src/components/ResultCard.tsx`
  - `deriveOcrJudgment` 関数を新規追加（results[] 配列から overall judgment を導出）
  - `deriveJudgment` を `results[]` 経由アクセスに変更
  - `detected` を `results.flatMap((r) => r.detected)` に変更（暫定、00099 で改修予定）
  - `result.data.reason` を `result.data.results[0]?.reason` に変更（暫定）
  - `AllergenResult` を import に追加
- `frontend/src/hooks/useScan.ts`（L92-L104）
  - `data.judgment` / `data.detected` の直接参照を `results[]` 経由に変更
  - results[] が空の場合は「なし」として扱う（アレルゲン設定なし設計準拠）

### Phase 4: テストファイルのモックデータ更新
- `backend/src/scan/scan.service.spec.ts`
  - `validGeminiResponse` から `is_high_risk`、`judgment`、`detected`、`reason` を削除
  - `results: [AllergenResult]`、`highlights: [HighlightItem]` を追加
  - アサーションを `result.results[0]?.judgment` / `validGeminiResponse.results[0]?.detected` に変更
- `backend/src/scan/scan.controller.spec.ts`
  - `validOcrResponse` から `is_high_risk`、`judgment`、`detected`、`reason` を削除
  - `results: [AllergenResult]`、`highlights: [HighlightItem]` を追加
- `frontend/src/components/ResultCard.test.tsx`
  - `makeOcrResult` 内の `is_high_risk`、`judgment`（単体）、`detected`（単体）を削除
  - `results: [AllergenResult]`、`highlights: [HighlightItem]` を追加
- `frontend/src/hooks/useScan.spec.ts`
  - `RESULT` ペイロードの `is_high_risk`、`judgment`（単体）、`detected`（単体）、`reason` を削除
  - `results: [AllergenResult]`、`highlights: [HighlightItem]` を追加

### Phase 5: プロンプトファイルの更新
- `backend/src/scan/prompts/allergen-detection.txt`
  - `"is_high_risk"` フィールドを削除
  - `results[]` 配列・`highlights[]` 配列の JSON 例を追加
- `backend/src/scan/prompts/no-allergen.txt`
  - `"is_high_risk"`、`"judgment"`、`"detected"`、`"reason"` を削除
  - `results: []`、`highlights: []` の JSON 例に変更

### scan.service.ts への波及修正（Files to modify 外）
- `buildAllergensFromGemini` を `results[]` 配列から `contains`/`partial`/`components` を生成する形に変更
- `deriveOverallJudgment` メソッドを新規追加（results[] から overall judgment を導出）
- scan_histories の `detected` を `results.flatMap((r) => r.detected)` に変更
- ログメッセージから `geminiResult.judgment` 参照を削除

### 設計上の判断
- `results[]` が空の場合の overall judgment: アレルゲン設定なし（`no-allergen.txt` プロンプト）の設計に準拠して `'なし'` を返す（判定不能にすると ResultCard テストが失敗する）
- 個々の results 要素が `'判定不能'` の場合は安全側（判定不能）として扱う

---

## Plan deviation

### scan.service.ts への波及修正
`Files to modify` に `scan.service.ts` は含まれていなかったが、`GeminiOcrResponse` 型変更により `buildAllergensFromGemini`（`result.judgment`・`result.detected` 参照）と `scanHistoryRepository.create`（`geminiResult.detected` 参照）でコンパイルエラーが生じるため修正した。最小変更（`results[]` 配列経由アクセスへの変換のみ）で対応。`deriveOverallJudgment` メソッドを新規追加。

### `useScan.ts` への波及修正
`Files to modify` に `useScan.ts` は含まれていなかったが、`OcrScanResponse` 型変更により `buildHistoryBody` 内の `data.judgment`・`data.detected` 参照でコンパイルエラーが生じるため修正した。最小変更で対応。

### `ResultCard.tsx` の `reason` フィールド削除
旧設計の `GeminiOcrResponse.reason` を参照していた `result.data.reason` を `result.data.results[0]?.reason` に変更（暫定アクセス）。これは `Files to modify` に含まれている。

### `results[]` 空配列の場合の overall judgment
設計書に明記なし。`no-allergen.txt` プロンプトが `results: []` を返す設計のため、空配列は「アレルゲン設定なし = なし」と解釈して `'なし'` を返す実装とした（安全設計の観点で `'判定不能'` にすると ResultCard テストの共有ボタン表示テストが失敗するため）。

---

## Review comments

## 自動評価（2026-05-19 ）- ラウンド 1

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 2 / Info: 2）

### Threshold 達成状況
- 1. 動作性: ✅ （Completion criteria 13/13 通過、typecheck 0件、unit backend 71件・frontend 53件 全PASS）
- 2. セキュリティ: ✅ （Medium 以上 0 件）
- 3. カバレッジ: ⚠️ 算出不能（既存テストが全件 PASS、新規テスト追加なし。タスク方針上 Tests to add: なし）
- 4. 敵対的観点: ✅ （Critical/High 0 件。レート制限は Throttler で実装済み。SNS 共有は `judgment === 'なし'` のみ許可で制御済み）
- 5. 保守性: ✅ （アーキテクチャ層違反 0 / アンチパターン再導入 0 / マジックナンバー 0 / `as any` 0 / `@ts-ignore` 0）

### Completion criteria 機械検証結果

| # | 条件 | 結果 |
|---|------|------|
| 1 | `is_high_risk` backend/src/ `.ts` に 0 行 | ✅ Pass |
| 2 | `is_high_risk` frontend/src/ `.ts/.tsx` に 0 行 | ✅ Pass |
| 3 | `is_high_risk` backend/src/scan/prompts/ に 0 行 | ✅ Pass |
| 4 | `results` が gemini.types.ts に 1件以上 | ✅ Pass (`results: AllergenResult[];`) |
| 5 | `results` が scan.types.ts に 1件以上 | ✅ Pass (`results: AllergenResult[]`) |
| 6 | `AllergenResult` が両ファイルに存在 | ✅ Pass |
| 7 | `highlights` が両ファイルに存在 | ✅ Pass |
| 8 | `as any` が gemini.client.ts に 0 行 | ✅ Pass |
| 9 | `@ts-ignore` が gemini.client.ts に 0 行 | ✅ Pass |
| 10 | `pnpm --filter backend typecheck` 0件エラー | ✅ Pass |
| 11 | `pnpm --filter frontend typecheck` 0件エラー | ✅ Pass |
| 12 | `pnpm --filter backend test` 全PASS（71件） | ✅ Pass |
| 13 | `pnpm --filter frontend test` 全PASS（53件） | ✅ Pass |

### 改善提案（PASS。次タスク繰越し可）

#### [保守性 - Low] `deriveOverallJudgment` ロジックが3箇所に重複している

同一の優先順位ロジック（`含む > 一部含む > 判定不能 > なし`）が以下の3箇所に独立実装されている:

- `backend/src/scan/scan.service.ts:266` - `deriveOverallJudgment` プライベートメソッド
- `frontend/src/components/ResultCard.tsx:40` - `deriveOcrJudgment` 関数
- `frontend/src/hooks/useScan.ts:96-103` - インライン IIFE

`dry_principles.md` の「判定ロジックが複数箇所に分散していないか」チェックに該当。フロントエンド側は `src/lib/allergen.utils.ts` などに集約することを 00099 タスクで検討推奨。バックエンドとフロントエンドで言語が異なるため重複は不可避だが、フロントエンド内の2箇所（ResultCard / useScan）は統合可能。

#### [保守性 - Low] `scan.service.spec.ts` L29 のマジックナンバー `86400000`

```typescript
// backend/src/scan/scan.service.spec.ts L29
expiresAt: new Date(Date.now() + 86400000),  // ❌ マジックナンバー
```

本タスクの変更点ではなく既存コードだが、`86400000` は 24時間のミリ秒数。定数化推奨。ただし本タスクスコープ外のため次タスク繰越し。

#### [保守性 - Info] `ResultCard.tsx` の免責 UI テキストが i18n キー未使用

`coding_rules.md` および `anti_patterns.md #17` で「UIテキストをコンポーネントにハードコード禁止」と定義されているが、`ResultCard.tsx` L172 と L180 に日本語テキストが直書きされている。`locales/` ディレクトリも未作成。

これはタスク `Implementation plan Phase 3` で「本タスクでは UI ロジックを変更しない」と明記されており、既存コードの踏襲。00099 タスクで UI リファクタリングを行う際に `t('scan.result.caution')` 等へ変換することを推奨。

#### [セキュリティ - Info] `toDetectionType` の不正値フォールバックが `'contains'`

`backend/src/shared/gemini.client.ts:186` で不明な `detection_type` は `'contains'` にフォールバックする。`judgment` フィールドが最終的な判定に使用されるため実害は軽微だが、設計の明示的な根拠（「コンタミより安全側の 'contains' にする」等）をコメントで補記すると可読性が向上する。
