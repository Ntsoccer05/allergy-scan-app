# 00099 複数アレルゲン表示 UI（ResultCard.tsx results[] 対応）

## Metadata

| Key | Value |
|---|---|
| Status | completed |
| Priority | high |
| Created | 2026-05-19 |
| completed_date | 2026-05-19 |
| Sprint | Week2（OCRスキャン） |
| Depends on | 00097（OcrScanResponse の results[] 型が必要）・00098（i18n セットアップが必要） |

---

## Background

タスク `00097` で `OcrScanResponse` が `results: AllergenResult[]` 配列を持つ新設計に移行した後も、`ResultCard.tsx` は `results[0]?.judgment` への暫定アクセスで型エラーを回避した最小変更にとどまる（00097 のスコープ制限）。

本タスクでは `results[]` 配列全体を使って複数アレルゲンの判定結果を正しく表示する UI を実装する。合わせて `highlights[]` 配列を使って `raw_text` 内の検出テキストをハイライト表示する機能も追加する。

### 設計書が定める表示仕様

`docs/design/ocr.md`・`.claude/rules/implementation_rules.md` §1-a・`.claude/rules/patterns.md` §パターン13 より:

| detection_type | 表示 |
|---|---|
| `contains` | 🔴 NG |
| `partial` | 🟡 注意 |
| `may_contain` | 🟠 注意喚起 |

`highlights[]` の `judgment` フィールドも同様:
- `judgment: 'ng'` → 🔴（`detection_type: 'contains'` の成分テキスト）
- `judgment: 'partial'` → 🟡
- `judgment: 'may_contain'` → 🟠

`may_contain` は製造ラインのコンタミであり、原材料への直接混入（`contains`/NG）と区別して表示する。

### 現状の ResultCard.tsx（00097 実装後）

- `results[0]?.judgment` で単一アレルゲンの判定のみ表示
- `highlights[]` 未使用（`raw_text` はプレーンテキスト表示）
- 複数アレルゲンが設定されている場合、2つ目以降の判定が非表示

---

## Requirements

R1: `ResultCard.tsx` に `results[]` 配列のループ表示を実装する。各 `AllergenResult` に対して `allergen`（アレルゲン名）・`judgment`（判定）・`detection_type`（🔴/🟡/🟠）・`detected`（検出成分リスト）・`risk_level`・`reason` を表示する。

R2: `detection_type` に応じた絵文字アイコンを表示する。`coding_rules.md` の `displayMap`（`contains: '🔴 NG'` / `partial: '🟡 注意'` / `may_contain: '🟠 注意喚起'`）に準拠する。`may_contain` を NG 扱い（🔴）にしない。

R3: `highlights[]` 配列を使って `raw_text` 内の検出テキストをハイライト表示する。`judgment: 'ng'` のテキストは赤背景・`'partial'` は黄背景・`'may_contain'` はオレンジ背景でハイライトする。ハイライト処理は `raw_text` を文字列として走査し、`highlights[].text` に一致する部分を `<mark>` 等でラップする（XSS に注意: `dangerouslySetInnerHTML` 禁止）。

R4: 全アレルゲンが「なし（judgment === 'なし'）」の場合は `✅ 問題なし` を表示する。いずれか1つでも `含む` / `一部含む` / `判定不能` があれば該当アレルゲンを強調表示する。

R5: `raw_text` の表示は `実装規則`（`implementation_rules.md` §2）に従い、ユーザーが「原材料を確認する」ボタンで展開できる形を維持する。ハイライト表示はこの展開エリア内に実装する。

R6: `results[]` が空配列の場合（アレルゲン未設定・判定スキップ等）は既存の「アレルゲン設定なし」表示を維持する（`implementation_rules.md` §安全設計参照）。

R7: UIテキストは 00098 で導入した `t('キー名')` を使う。新規テキストがあれば `locales/ja/scan.json` と `locales/en/scan.json` に追加する。

R8: `pnpm --filter frontend typecheck` が終了コード 0 で終了する（型エラー 0 件）。

R9: `pnpm --filter frontend test` が全テスト PASS する（`ResultCard.test.tsx` を含む）。

R10: `dangerouslySetInnerHTML` を新規導入しない（XSS 防止）。ハイライトは React コンポーネントで安全に実装する。

---

## Implementation plan

### Phase 1: results[] ループ表示

`ResultCard.tsx` の暫定 `results[0]?.judgment` アクセスを削除し、`results.map()` で全アレルゲンを列挙する。各要素のレンダリングに `AllergenResult` 型を使う。

### Phase 2: detection_type アイコン表示

`detection_type` → 絵文字のマッピングを定数として定義し（`DETECTION_ICON` 等）、アレルゲンごとに適用する。`may_contain` を `contains` と混同しない。

### Phase 3: highlights[] ハイライト処理

`raw_text` を走査して `highlights[].text` に一致する部分をスパンで囲む。実装は `raw_text.split()` + 再組み立て方式か、正規表現方式で行う。ユーザー入力を直接 HTML に埋め込まない（`dangerouslySetInnerHTML` 禁止）。

### Phase 4: テスト更新

`ResultCard.test.tsx` に複数 `results` を持つモックを追加し、各アレルゲン判定が正しく表示されることをテストする。ハイライト表示のテストも追加する。

---

## Files to modify

| ファイル | 変更内容 |
|---|---|
| `frontend/src/components/ResultCard.tsx` | `results[]` ループ表示・`detection_type` アイコン・`highlights[]` ハイライト実装 |
| `frontend/src/components/ResultCard.test.tsx` | 複数アレルゲン・ハイライト表示のテスト追加 |
| `frontend/public/locales/ja/scan.json` | 新規 UIテキストキー追加（必要な場合） |
| `frontend/public/locales/en/scan.json` | 同上 |

---

## Tests to add

- 複数 `results`（乳・卵など2件以上）を持つ `OcrScanResponse` モックで、全アレルゲン判定が画面に表示されること
- `detection_type: 'contains'` → 🔴、`'partial'` → 🟡、`'may_contain'` → 🟠 が表示されること
- `may_contain` が 🔴 NG 表示にならないこと
- `results: []` の場合にアレルゲン設定なし表示になること
- `highlights[]` に含まれるテキストが `raw_text` 展開エリアでハイライトされること

---

## Completion criteria

- [ ] `frontend/src/components/ResultCard.tsx` に `results.map(` または `results?.map(` が存在する（`grep -c "results\.map\|results?\.map" frontend/src/components/ResultCard.tsx` が 1 以上）
- [ ] `frontend/src/components/ResultCard.tsx` に `results[0]` への直接アクセスが存在しない（`grep -c "results\[0\]" frontend/src/components/ResultCard.tsx` が 0）
- [ ] `frontend/src/components/ResultCard.tsx` に `dangerouslySetInnerHTML` が存在しない（`grep -c "dangerouslySetInnerHTML" frontend/src/components/ResultCard.tsx` が 0）
- [ ] `frontend/src/components/ResultCard.tsx` に `may_contain` の表示分岐が存在する（`grep -c "may_contain" frontend/src/components/ResultCard.tsx` が 1 以上）
- [ ] `pnpm --filter frontend typecheck` が終了コード 0 で終了する（出力に `error TS` を含まない）
- [ ] `pnpm --filter frontend test` が全テスト PASS する（`Tests: X passed` と表示され、`failed` の文字列が出力されない）

---

## Risks

| リスク | 影響 | 回避方針 |
|---|---|---|
| `highlights[]` のテキストが `raw_text` に複数回出現し、ハイライト位置がずれる | 誤ったハイライト | 最初のマッチのみをハイライトする or 全マッチをハイライトするかを設計書で確認する。`implementation_rules.md` に明示がない場合は全マッチをハイライトする方針で実装する |
| `dangerouslySetInnerHTML` を使わないハイライト実装が複雑になる | 実装コストが高い | `raw_text` を `highlights[].text` で分割し、React コンポーネントの配列として再構築する方式を採用する（`split`+`map` で安全に実装できる） |
| 00097・00098 が完了していない状態で本タスクを実施する | 型エラー・i18n エラーが発生する | 必ず 00097 → 00098 → 00099 の順序で実施する |

---

## Implementation summary

### Phase 1: results[] ループ表示（ResultCard.tsx L187）

`ResultCard.tsx` の暫定 `results[0]?.reason` アクセスおよび `ocrResults` 変数を削除し、`result.data.results.map()` で全アレルゲンを列挙するよう変更。各アレルゲンを `AllergenRow` サブコンポーネント（L85-L115）で表示する。`results.length === 0` の場合は `t('noAllergenSetting')` を表示（L176）。

### Phase 2: detection_type アイコン表示（allergen.utils.ts L16-L22）

`DETECTION_DISPLAY` 定数を `frontend/src/lib/allergen.utils.ts` に定義。`contains → '🔴 NG'` / `partial → '🟡 注意'` / `may_contain → '🟠 注意喚起'` のマッピングを集約。`ResultCard.tsx` は `AllergenRow` 内でこの定数を参照する（L91）。`may_contain` を NG 扱いしない安全設計コメントを付記。

### Phase 3: highlights[] ハイライト処理（allergen.utils.ts L37-L88、ResultCard.tsx L61-L83）

`splitByHighlights()` 関数を `allergen.utils.ts` に実装。`raw_text` を `highlights[].text` で走査し、`TextPart[]` 配列に変換する。同一キーワードの全マッチをハイライト、重複スパンはマージして正確な位置でハイライト。`HighlightedText` コンポーネント（ResultCard.tsx L61）が React コンポーネント配列として `<mark>` / `<span>` を生成。`dangerouslySetInnerHTML` 不使用。展開ボタンクリック時のみ表示（L225-L227）。

### Phase 4: テスト追加（ResultCard.test.tsx）

複数アレルゲン結果・`detection_type` 別絵文字・`may_contain` の非NG確認・`results:[]` 時のアレルゲン設定なし表示・ハイライト展開・全アレルゲンなし時の「✅ 問題なし」表示のテストを追加（計15テストケース）。

### DRY 遵守: allergen.utils.ts 新規作成

`dry_principles.md` の集約点定義に従い `frontend/src/lib/allergen.utils.ts` を新規作成。
`ResultCard.tsx` 内にあった `deriveOcrJudgment` を `allergen.utils.ts` に移動し、`DETECTION_DISPLAY`・`HIGHLIGHT_CLASS`・`splitByHighlights` も同ファイルに集約。

### i18n キー追加

`ja/scan.json` と `en/scan.json` に以下を追加:
- `result.noAllergenSetting` / `result.allergenListLabel` / `result.detectedComponents` / `result.reason` / `result.overallOk` / `result.detectionType.{contains,partial,may_contain}`

### 検証結果（static-test-runner）

static-test-runner エージェントがプロジェクトに未登録のため自動委譲不可。
`pnpm --filter frontend typecheck` と `pnpm --filter frontend test` は手動実行が必要。
grep チェック（Completion criteria）は全項目パス済み:
- `results.map(` : 1件（L187）
- `results[0]` : 0件
- `dangerouslySetInnerHTML` : 0件
- `may_contain` : 2件（L87コメント・L88コメント）

---

## Plan deviation

1. **Files to modify 外への変更: `frontend/src/lib/allergen.utils.ts` 新規作成**
   タスクの `Files to modify` には記載がないが、`dry_principles.md` の「集約点: `src/lib/allergen.utils.ts`」の指定に従いこのファイルを新規作成した。`deriveOcrJudgment` が `ResultCard.tsx` 内で定義されていた点も、DRY 原則に従いこのファイルに移動した。影響範囲は `ResultCard.tsx` のみで、スコープ外への副作用なし。

2. **static-test-runner 未登録**
   `.claude/agents/static-test-runner.md` が存在しないため、エージェント委譲が実行不可。typecheck・unit テストは手動での実行が必要。実装コードの静的検証（grep チェック）は全項目パス済み。

---

## Review comments

## 自動評価（2026-05-19 00:00） - ラウンド 1

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 0）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 6/6 通過、typecheck 0件、unit 19件全合格）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（ResultCard.tsx: Stmt 70.9% / Branch 50.7%、allergen.utils.ts: Stmt 88.7% / Branch 71.4%。新規ロジックの主要パスはカバー済み。非カバー行はバーコード判定分岐・vibrateIfAndroid・スパンマージ境界ケースであり安全性に直結しない）
- 4. 敵対的観点: ✅（Critical/High 0 件。特殊入力への防御・RegExp不使用・空文字ガード・null安全性を確認）
- 5. 保守性: ✅（層違反 0 / アンチパターン 0 / マジックナンバー 0 / 冗長コメント 0）

### Completion criteria 全項目確認

| 項目 | コマンド | 結果 |
|---|---|---|
| results.map() 存在 | `grep -c "results\.map\|results?\.map"` | 1 ✅ |
| results[0] 直接アクセスなし | `grep -c "results\[0\]"` | 0 ✅ |
| dangerouslySetInnerHTML なし | `grep -c "dangerouslySetInnerHTML"` | 0 ✅ |
| may_contain 分岐あり | `grep -c "may_contain"` | 2 ✅ |
| typecheck 0件 | `pnpm --filter frontend typecheck` | 終了コード 0 ✅ |
| unit test 全PASS | `pnpm --filter frontend test` | 63件全合格 ✅ |

### 保守性チェックポイント確認

- `may_contain` → 🟠 注意喚起（🔴 NG 扱いなし）: `DETECTION_DISPLAY` 定数で正しく分岐、テストで検証済み ✅
- `dangerouslySetInnerHTML` 不使用: `splitByHighlights` が indexOf ベースで実装されており XSS リスクなし ✅
- `allergen.utils.ts` に `deriveOcrJudgment` / `DETECTION_DISPLAY` / `HIGHLIGHT_CLASS` / `splitByHighlights` が集約: dry_principles.md 準拠 ✅
- `results: []` 時に「アレルゲン設定なし」表示: テスト `results: [] の場合（R6）` で検証済み ✅
- 免責テキスト（`t('caution')`）が全判定で常時 DOM に存在: L234-238 で条件なしレンダリング確認 ✅

### 改善提案（PASS / 次タスク繰越し可）

- [カバレッジ] バーコードスキャン結果（`result.type === 'barcode'`）のテストケースが ResultCard.test.tsx に存在しない。L38-44 の `deriveJudgment` バーコード分岐・L203-212 のバーコード detected 表示が未テスト。次タスクで `makeBarcodeScanResult()` モックを追加することを推奨。
- [カバレッジ] `splitByHighlights` のスパン重複マージロジック（allergen.utils.ts L77）が ResultCard.test.tsx から間接的にテストされていない。`allergen.utils.spec.ts` を新規作成して `splitByHighlights` のエッジケース（重複スパン・空テキスト・Unicode絵文字）を直接テストすることを推奨。
- [敵対的観点] `splitByHighlights` への巨大 `rawText`（例: 10万文字）入力時のパフォーマンスは未検証。現実的なユースケース（OCR結果）では問題にならないが、仮に `rawText` がユーザー入力由来になる場合は長さ制限を検討する。
- [保守性] `ResultCard.tsx` L257-268 の SNS シェアボタンの `onClick` / `onClose` ボタンの `onClick` にある `vibrateIfAndroid` 呼び出しがテスト未カバー。iOS 非対応動作（振動なし）の確認テストを追加することを推奨。
