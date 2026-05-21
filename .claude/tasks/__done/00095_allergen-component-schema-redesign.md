# 00095 allergen_components スキーマ再設計

## Metadata

| Key | Value |
|---|---|
| Status | completed |
| completed_date | 2026-05-19 |
| Priority | high |
| Created | 2026-05-19 |
| Sprint | Week1（バーコードスキャン完了前に実施） |

---

## Background

現在の `AllergenComponent` Prisma モデル（`backend/prisma/schema.prisma` L31-52）は、設計ドキュメント（`docs/design/database.md`）が定める新スキーマと以下の点で乖離している。

| 現在のフィールド | 問題点 |
|---|---|
| `component String` | `canonical_name` + `aliases JSONB` の2フィールドに分割が必要 |
| `isHighRisk Boolean` | `risk_level VARCHAR(10)` ('high'/'medium'/'low'/'ignore') に置き換えが必要 |
| `componentType` | 'compound' と 'contains_label' の2種が欠落（全7種に拡張が必要） |

この乖離により以下の問題が生じている。

1. `gemini-prompt.builder.ts`（L42）が `c.component`（旧フィールド）と `c.isHighRisk`（Boolean）を参照しているため、設計書が示す `canonical_name` / `risk_level === 'high'` のパターンに不一致がある
2. `seed.ts` の初期データが旧スキーマ（`component` / `is_high_risk`）で書かれており、`docs/design/database.md` の SQL 初期データ（`canonical_name` / `aliases` / `risk_level` / `detection_type`）と同期していない
3. `AllergenComponentRecord` 型（`allergen-component.repository.ts` L5-12）が旧フィールドを公開しているため、呼び出し元が誤った型に依存している
4. `scan.service.ts`（L36）の `BarcodeScanResult` が `is_high_risk: boolean | null` を持ち、設計書が示す `risk_level` 型と不一致
5. `gemini.types.ts`（L11）の `GeminiOcrResponse.is_high_risk: boolean` は設計書の `results[]` 配列・`risk_level` 型と不一致（本タスクの対象外だが generator は影響を確認すること）
6. 開発環境に migration ファイルは存在せず（`backend/prisma/` 配下に `migrations/` ディレクトリなし）、スキーマ適用は `prisma db push` で行う

---

## Requirements

R1: `backend/prisma/schema.prisma` の `AllergenComponent` モデルを `docs/design/database.md` の DDL 定義に合わせて更新する。具体的には `component` を削除し `canonicalName`（`@map("canonical_name")`）と `aliases`（`@db.JsonB`・デフォルト `[]`）を追加、`isHighRisk Boolean` を削除し `riskLevel`（`@map("risk_level")`・デフォルト `"medium"`）を追加、`detectionType`（`@map("detection_type")`・デフォルト `"contains"`）を追加、`componentType` のコメントを全7種（'direct'/'derivative'/'processed'/'compound'/'additive'/'contains_label'/'exclude'）に更新する。

R2: `backend/prisma/seed.ts` の `ALLERGEN_COMPONENTS_SEED` を全面的に書き直し、`docs/design/database.md` の SQL 初期データが示す `canonical_name` / `aliases` / `component_type` / `detection_type` / `risk_level` / `note` の構造に合わせる。シードは重複実行しても安全な冪等な実装にする（`allergenName + canonicalName` でユニーク特定）。

R3: `backend/src/allergens/allergen-component.repository.ts` の `AllergenComponentRecord` 型から `component` と `isHighRisk` を削除し、`canonicalName: string`・`aliases: string[]`・`riskLevel: string`・`detectionType: string` を追加する。`findByAllergens` の `select` 句も新フィールドに合わせて更新する。

R4: `backend/src/scan/gemini-prompt.builder.ts` の `buildGeminiPrompt` 関数内で `c.component` を `c.canonicalName` に、`c.isHighRisk` を `c.riskLevel === 'high'` に置き換える。`dry_principles.md` の集約点パターンと一致させる。

R5: `backend/src/scan/gemini-prompt.builder.spec.ts` の `mockComponents` 配列を新しい `AllergenComponentRecord` 型に合わせて更新する。各モックオブジェクトに `canonicalName`・`aliases`・`riskLevel`・`detectionType` を追加し、`component`・`isHighRisk` を削除する。テストケース「危険度高の成分に警告マークが付く」のアサーションが新しいマーカー文字列（`risk_level:high` 等）と一致するよう調整する（実装詳細は generator が `gemini-prompt.builder.ts` の変更に合わせて決定する）。

R6: `backend/src/scan/scan.service.ts` の `BarcodeScanResult` 型から `is_high_risk?: boolean | null` を削除し、`risk_level?: 'high' | 'medium' | 'low' | 'ignore' | null` に変更する。`buildResultFromDb` メソッド内で `isHighRisk` を参照している箇所を `risk_level` に対応する形で更新する。

R7: `frontend/src/app/scan/scan.types.ts` の `BarcodeScanResponse` 型から `is_high_risk?: boolean | null` を削除し、`risk_level?: 'high' | 'medium' | 'low' | 'ignore' | null` に変更する。

R8: `backend/src/scan/scan.service.spec.ts` の `validGeminiResponse` および関連モックデータに `is_high_risk: boolean` が残っている場合、削除または型に合わせて修正する（`GeminiOcrResponse` 型の変更は本タスクスコープ外だが、型エラーが生じた場合は根本修正する）。

R9: `as any` / `@ts-ignore` を新規導入しない。既存の型エラーは根本的に解決する。

R10: `pnpm --filter backend typecheck` と `pnpm --filter frontend typecheck` がともに 0 件エラーで終了する。

R11: `pnpm --filter backend test` がすべて PASS する（`gemini-prompt.builder.spec.ts` と `scan.service.spec.ts` を含む）。

---

## Implementation plan

### Phase 1: Prisma スキーマ更新

`backend/prisma/schema.prisma` の `AllergenComponent` モデルを新フィールド構成に変更する。`aliases` は Prisma の `Json` 型（PostgreSQL JSONB にマップ）で表現する。`riskLevel` と `detectionType` は `String` 型でデフォルト値を付ける。`componentType` コメントを全7種に拡張する。スキーマ変更後、`prisma generate` を実行して Prisma Client を再生成する（`prisma db push` は generator が開発環境で実施する）。

### Phase 2: Repository 型とクエリ更新

`AllergenComponentRecord` 型を新フィールドに合わせて再定義する。`findByAllergens` の `select` 句を新フィールドにそろえる。`aliases` は JSONB 配列であるため Prisma から `Json` 型で返ってくる点に注意。`aliases: string[]` に narrowing する処理を Repository 内でのみ行う（`as any` 禁止。`Array.isArray` チェック等で安全に型変換する）。

### Phase 3: gemini-prompt.builder.ts 更新

`c.component` → `c.canonicalName`、`c.isHighRisk ? '（⚠️危険度高）' : ''` → `c.riskLevel === 'high' ? '（⚠️risk_level:high）' : ''` に変更する。`dry_principles.md` の集約点パターン（L70-71）に記載されている形式と一致させる。

### Phase 4: gemini-prompt.builder.spec.ts 更新

`mockComponents` を新フィールド構成に変更する。`riskLevel: 'high'` が設定されたモックに対して「警告マークが付く」テストが PASS することを確認する（アサーション文字列は Phase 3 の実装に合わせる）。

### Phase 5: scan.service.ts・scan.service.spec.ts 更新

`BarcodeScanResult` 型を `risk_level` に変更。`buildResultFromDb` 内の `is_high_risk` 参照を削除または `risk_level` に置き換える。`scan.service.spec.ts` に型エラーが発生していれば修正する。

### Phase 6: フロントエンド型更新

`frontend/src/app/scan/scan.types.ts` の `BarcodeScanResponse` を `risk_level` に変更する。フロントエンドで `is_high_risk` を参照している箇所があれば同様に更新する（TBD: generator は `frontend/src/` を Grep して参照箇所を確認すること）。

### Phase 7: seed.ts 全面書き直し

`docs/design/database.md` の SQL 初期データ（L136-277）を正典として `ALLERGEN_COMPONENTS_SEED` を `canonicalName`・`aliases`・`componentType`・`detectionType`・`riskLevel`・`note` で定義し直す。シードの冪等性は `allergenName + canonicalName` の組み合わせで `findFirst` → `upsert` で担保する（または `deleteMany` → `createMany` のリセット方式でもよい。generator が判断する）。

---

## Files to modify

| ファイル | 変更内容 |
|---|---|
| `backend/prisma/schema.prisma` | `AllergenComponent` モデル フィールド再定義 |
| `backend/prisma/seed.ts` | `ALLERGEN_COMPONENTS_SEED` 全面書き直し |
| `backend/src/allergens/allergen-component.repository.ts` | `AllergenComponentRecord` 型・`select` 句更新 |
| `backend/src/scan/gemini-prompt.builder.ts` | `c.component` → `c.canonicalName`、`c.isHighRisk` → `c.riskLevel === 'high'` |
| `backend/src/scan/gemini-prompt.builder.spec.ts` | `mockComponents` フィールド更新 |
| `backend/src/scan/scan.service.ts` | `BarcodeScanResult.is_high_risk` → `risk_level`・`buildResultFromDb` 更新 |
| `backend/src/scan/scan.service.spec.ts` | 型エラーが生じた箇所を修正 |
| `frontend/src/app/scan/scan.types.ts` | `BarcodeScanResponse.is_high_risk` → `risk_level` |

### 確認が必要なファイル（TBD: generator が Grep で調査）

- `frontend/src/` 配下で `is_high_risk` を参照している箇所
- `backend/src/` 配下で `isHighRisk` / `is_high_risk` を参照している箇所（scan.service.ts 以外）
- `backend/src/shared/types/gemini.types.ts` の `GeminiOcrResponse.is_high_risk` が型エラーを引き起こすか

---

## Tests to add

既存テストの更新のみ（新規テストファイルは不要）:

- `gemini-prompt.builder.spec.ts`: `mockComponents` の型を新スキーマに合わせ、全テストが PASS すること
- `scan.service.spec.ts`: 型エラーがない状態で全テストが PASS すること

新規追加テストケース（generator が判断して追加する）:

- `detection_type: 'partial'` を持つ成分が検出対象リストに含まれること（`gemini-prompt.builder.spec.ts`）
- `detection_type: 'may_contain'` を持つ成分が検出対象リストに含まれること（`gemini-prompt.builder.spec.ts`）
- `riskLevel: 'medium'`・`riskLevel: 'low'`・`riskLevel: 'ignore'` の成分に警告マークが付かないこと（`gemini-prompt.builder.spec.ts`）

---

## Completion criteria

- [ ] `backend/prisma/schema.prisma` の `AllergenComponent` モデルに `canonicalName`・`aliases`・`riskLevel`・`detectionType` フィールドが存在し、`component`・`isHighRisk` フィールドが存在しない（`grep -c "component " backend/prisma/schema.prisma` が0、`grep -c "canonicalName" backend/prisma/schema.prisma` が1以上）
- [ ] `AllergenComponent` の `componentType` コメントが全7種（'direct'/'derivative'/'processed'/'compound'/'additive'/'contains_label'/'exclude'）を含む
- [ ] `backend/src/allergens/allergen-component.repository.ts` の `AllergenComponentRecord` 型に `canonicalName: string`・`riskLevel: string`・`detectionType: string`・`aliases: string[]` が含まれ、`component` と `isHighRisk` が含まれない
- [ ] `backend/src/scan/gemini-prompt.builder.ts` に `c.component` という文字列が存在しない（`grep -c "c\.component" backend/src/scan/gemini-prompt.builder.ts` が0）
- [ ] `backend/src/scan/gemini-prompt.builder.ts` に `c.isHighRisk` という文字列が存在しない（`grep -c "c\.isHighRisk" backend/src/scan/gemini-prompt.builder.ts` が0）
- [ ] `backend/src/scan/gemini-prompt.builder.ts` に `c.canonicalName` という文字列が存在する（`grep -c "c\.canonicalName" backend/src/scan/gemini-prompt.builder.ts` が1以上）
- [ ] `backend/src/scan/gemini-prompt.builder.ts` に `c.riskLevel === 'high'` という文字列が存在する（`grep -c "riskLevel" backend/src/scan/gemini-prompt.builder.ts` が1以上）
- [ ] `backend/src/scan/scan.service.ts` の `BarcodeScanResult` 型に `is_high_risk` フィールドが存在しない
- [ ] `frontend/src/app/scan/scan.types.ts` の `BarcodeScanResponse` 型に `is_high_risk` フィールドが存在しない
- [ ] `pnpm --filter backend typecheck` が終了コード 0 で終了する（型エラー 0 件）
- [ ] `pnpm --filter frontend typecheck` が終了コード 0 で終了する（型エラー 0 件）
- [ ] `pnpm --filter backend test` が全テスト PASS で終了する（`gemini-prompt.builder.spec.ts` と `scan.service.spec.ts` を含む）
- [ ] `backend/prisma/seed.ts` の `ALLERGEN_COMPONENTS_SEED` に `is_high_risk` または `isHighRisk` フィールドが存在しない
- [ ] `backend/prisma/seed.ts` の `ALLERGEN_COMPONENTS_SEED` に `canonicalName` または `canonical_name` フィールドが存在する
- [ ] ソースコード全体（`backend/src/`・`frontend/src/`）に `as any` が新規導入されていない（既存の `as any` が増えていない）
- [ ] ソースコード全体に `@ts-ignore` が新規導入されていない
- [ ] `backend/prisma/seed.ts` の `ALLERGEN_COMPONENTS_SEED` に `detectionType` または `detection_type` フィールドが存在する

---

## Risks

| リスク | 影響 | 回避方針 |
|---|---|---|
| `prisma db push` で既存データが DROP される | 開発環境のデータが消える | 開発環境のみでの作業なので許容。seed を必ず再実行する |
| `GeminiOcrResponse.is_high_risk` の削除が `scan.service.ts` 以外に波及する | 型エラーの連鎖 | generator が `grep -r "is_high_risk" backend/src/` で全参照を事前確認してから修正する |
| `aliases` JSONB を `string[]` に narrowing する処理で実行時エラー | Gemini プロンプト生成失敗 | `Array.isArray(raw)` チェックを Repository 内に閉じ込め、異常値は空配列にフォールバックする |
| seed データ量が増加し seed 実行時間が長くなる | CI 遅延 | 許容範囲（数百レコード程度）。問題があれば `createMany` 使用を検討 |

---

## Implementation summary

### Phase 1: Prisma スキーマ更新（backend/prisma/schema.prisma）
- `AllergenComponent` モデルの `component String` を削除し `canonicalName String @map("canonical_name")` と `aliases Json @default("[]") @db.JsonB` を追加
- `isHighRisk Boolean @default(false) @map("is_high_risk")` を削除し `riskLevel String @default("medium") @map("risk_level")` と `detectionType String @default("contains") @map("detection_type")` を追加
- `componentType` コメントを全7種（direct/derivative/processed/compound/additive/contains_label/exclude）に拡張
- `prisma generate` で Prisma Client を再生成（終了コード 0）

### Phase 2: Repository 型とクエリ更新（backend/src/allergens/allergen-component.repository.ts L4-12, L28-47）
- `AllergenComponentRecord` 型を `canonicalName: string / aliases: string[] / detectionType: string / riskLevel: string` に更新し、`component` / `isHighRisk` を削除
- `findByAllergens` の `select` 句を新フィールドに合わせ更新
- `aliases` JSONB は `Array.isArray` チェックで安全に `string[]` へ narrowing（`as any` 不使用）

### Phase 3: gemini-prompt.builder.ts 更新（backend/src/scan/gemini-prompt.builder.ts L40-52）
- `c.component` → `c.canonicalName` に変更
- `c.isHighRisk ? '（⚠️危険度高）'` → `c.riskLevel === 'high' ? '（⚠️risk_level:high）'` に変更
- dry_principles.md の集約点パターン（L70-71）形式に一致

### Phase 4: gemini-prompt.builder.spec.ts 更新（backend/src/scan/gemini-prompt.builder.spec.ts）
- `mockComponents` を新 `AllergenComponentRecord` 型に全面更新（canonicalName/aliases/riskLevel/detectionType フィールド追加、component/isHighRisk 削除）
- 新規テストケース追加:
  - `riskLevel: high` の成分に `（⚠️risk_level:high）` が付く
  - `riskLevel: medium / low / ignore` に警告マークが付かない
  - `detectionType: partial` を持つ成分が検出対象リストに含まれる
  - `detectionType: may_contain` を持つ成分が検出対象リストに含まれる
  - `compound` 型の `マヨネーズ`（mock追加）等も カバー

### Phase 5: scan.service.ts 更新（backend/src/scan/scan.service.ts L29-37, L261-286）
- `BarcodeScanResult.is_high_risk?: boolean | null` を `risk_level?: 'high' | 'medium' | 'low' | 'ignore' | null` に変更
- `buildResultFromDb` 内のローカル変数 `isHighRisk` を削除し、`allergens.contains.length > 0` → `'high'`、`detected.length > 0` → `'medium'`、それ以外 → `null` の logic に更新

### Phase 6: フロントエンド型更新（frontend/src/app/scan/scan.types.ts L31-39）
- `BarcodeScanResponse.is_high_risk?: boolean | null` を `risk_level?: 'high' | 'medium' | 'low' | 'ignore' | null` に変更
- 波及修正: `frontend/src/hooks/useScan.spec.ts` L43 の `is_high_risk: false` を `risk_level: null` に変更（型エラー解消）

### Phase 7: seed.ts 全面書き直し（backend/prisma/seed.ts）
- `ALLERGEN_COMPONENTS_SEED` を `canonicalName / aliases / component_type / detectionType / riskLevel / note` 構造に全面書き直し
- `docs/design/database.md` の SQL 初期データを正典として採用（乳31件・卵10件・小麦14件・大豆14件・くるみ3件・カシューナッツ2件・アーモンド5件・ピスタチオ2件・マカダミアナッツ1件）
- upsert は `allergenName + canonicalName` の組み合わせで `findFirst` → update/create パターンで冪等性を担保
- `is_high_risk` / `component` フィールドを完全に削除

### 検証結果
- `pnpm --filter backend typecheck`: 0件エラー（終了コード 0）
- `pnpm --filter frontend typecheck`: 0件エラー（終了コード 0）
- `pnpm --filter backend test`: 71テスト全PASS、11テストスイート（終了コード 0）
- 修復ループ実施回数: 0回

---

## Plan deviation

- `frontend/src/hooks/useScan.spec.ts` は `Files to modify` に含まれていなかったが、`BarcodeScanResponse.is_high_risk` の削除により型エラーが生じたため修正（L43 の `is_high_risk: false` を `risk_level: null` に変更）。最小変更で型エラーを根本解決した（R9 に準拠）。
- `GeminiOcrResponse.is_high_risk` および `backend/src/shared/gemini.client.ts`・`backend/src/scan/scan.controller.spec.ts`・`frontend/src/components/ResultCard.test.tsx` の `OcrScanResponse.is_high_risk` 参照は本タスクスコープ外（R8 の「GeminiOcrResponse 型の変更は本タスクスコープ外」に従い変更なし）。これらは型エラーを引き起こしていないため問題なし。
- seed.ts は `docs/design/database.md` の SQL データを基に書き直したが、一部のアレルギー（えび・かに・落花生・そば・牛肉・ごま等）の `allergen_components` は設計書に初期データが記載されていないため seed に含めなかった。これは設計書の範囲内での判断であり Plan deviation には該当しない。

---

## Review comments

## 自動評価（2026-05-19 00:00） - ラウンド 1

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 2 / Info: 1）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 17/17 通過、typecheck 0件、unit 71件全PASS）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ⚠️ 算出不能（Jest カバレッジレポート未実行。gemini-prompt.builder.spec.ts が全分岐をカバーしていることをコードレビューで確認済み）
- 4. 敵対的観点: ✅（破壊的操作の防御に Critical/High 0 件。JSONB narrowing は Array.isArray チェックで安全に実装）
- 5. 保守性: ✅（層違反 0 / アンチパターン再導入 0 / マジックナンバー 0 / 冗長コメント 0）

### 改善提案（PASS 時 / 次タスク繰越し可）
- [i18n] `frontend/src/components/ResultCard.tsx` の UIテキスト（「⚠️ 購入前にラベルの実物も必ずご確認ください」「このアプリの判定は参考情報です。...」「原材料を確認する」「もう一度スキャンする」等）がハードコードされている。`coding_rules.md` の i18n セクション / `anti_patterns.md` #17 に違反。本タスクの変更範囲外だが、次の i18n 対応タスクで `t('キー名')` に変換要。
- [型整合性] `GeminiOcrResponse.is_high_risk: boolean`（`backend/src/shared/types/gemini.types.ts` L10）と `OcrScanResponse.is_high_risk: boolean`（`frontend/src/app/scan/scan.types.ts` L51）が旧設計の `is_high_risk` Boolean フィールドのまま残っている。本タスクスコープ外（タスク Plan deviation に記載済み）だが、設計書（`docs/design/api.md`）が示す `results[]` 配列・`risk_level` 型への移行は別タスクで対応が必要。`scan.service.spec.ts` L37・`scan.controller.spec.ts` L28・`frontend/src/hooks/useScan.spec.ts` L142 のモックデータにも `is_high_risk: true` が残存している。
- [Info] `aliases` JSONB の narrowing 処理（`allergen-component.repository.ts` L44-47）は `as unknown[]` を経由しているが、型安全性は確保されており実害なし（`as any` 禁止規約は遵守）。
