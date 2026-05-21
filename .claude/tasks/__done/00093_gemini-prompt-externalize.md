# Task 00093: Gemini プロンプトテンプレートの外部ファイル化

| Field | Value |
|-------|-------|
| Status | completed |
| Created | 2026-05-18 |
| Completed | 2026-05-19 |
| Depends on | 00030 (OCR Backend) |

---

## Background

`backend/src/scan/gemini-prompt.builder.ts` にプロンプトの静的テキスト（ルール文・JSON フォーマット例）が TypeScript 文字列リテラルとして埋め込まれている（L31–L61、L66–L88）。

MVP 検証フェーズではプロンプトを頻繁に調整する必要があるが、現状はプロンプト文字列を変更するたびに TypeScript コードを編集してコンパイルし直す必要がある。プロンプトの静的テキストをテキストファイルに切り出すことで、コードを触らずにプロンプト調整できるようにする。

動的部分（`detectionList` / `excludeList` / `allergenLabel`）はプレースホルダーで表現し、`gemini-prompt.builder.ts` 内でテキストファイルをロードして置換する構造を維持する。`buildNoAllergenPrompt` も同様に外部化対象とする。

設計の根拠となる正典:
- `.claude/rules/dry_principles.md` — Gemini プロンプト生成の集約点は `src/scan/gemini-prompt.builder.ts`
- `.claude/rules/anti_patterns.md` — #3（exclude 型を Gemini プロンプトに含める禁止）、除外リストを別途渡す構造は維持
- `.claude/rules/implementation_rules.md` — Gemini API 呼び出し制約（ユーザーが有効にしたアレルギーのみをプロンプトに含める）

---

## Requirements

- R1: `backend/src/scan/prompts/` ディレクトリに `allergen-detection.txt`（通常判定用）と `no-allergen.txt`（アレルギー設定なし用）の2ファイルを作成する。プロンプトのルール文・JSON フォーマット例を各ファイルに移動する
- R2: `allergen-detection.txt` には動的部分を `{{ALLERGEN_LABEL}}`・`{{DETECTION_LIST}}`・`{{EXCLUDE_LIST}}` の3つのプレースホルダーで表現する
- R3: `gemini-prompt.builder.ts` はテキストファイルを `fs.readFileSync` で読み込み、プレースホルダーを `String.prototype.replace` で置換して最終プロンプトを組み立てる
- R4: テキストファイルのロードは `buildGeminiPrompt` / `buildNoAllergenPrompt` の初回呼び出しまたはモジュールロード時に行う。1回のリクエストにつき何度も fs アクセスしない（起動時キャッシュ or モジュールスコープ定数での読み込み）
- R5: `buildGeminiPrompt` の関数シグネチャ（`enabledAllergens: string[]`, `db: AllergenComponentRepository`）とレスポンス型（`Promise<string>`）を変更しない。呼び出し元（`ScanService` 等）のコードを変更しなくてよい状態にする
- R6: `allergen-detection.txt` / `no-allergen.txt` に `as any` / `@ts-ignore` に相当するコードを含まない。TypeScript ファイルの型安全規約（`coding_rules.md`）が ts ファイルに限り適用される
- R7: `pnpm --filter backend typecheck` がエラー 0件で終了する
- R8: `pnpm --filter backend test` で `gemini-prompt.builder` に関係するテストが存在する場合に全件 PASS する（新規テストの追加も可）

---

## Implementation plan

### Phase 1: プロンプトテキストファイルの作成

- `backend/src/scan/prompts/allergen-detection.txt` を新規作成する
- 現在 `gemini-prompt.builder.ts` L31–L61 に存在するプロンプト文字列を移動する
- 動的部分（allergenLabel / detectionList / excludeList）を `{{ALLERGEN_LABEL}}`・`{{DETECTION_LIST}}`・`{{EXCLUDE_LIST}}` で置換する
- `backend/src/scan/prompts/no-allergen.txt` を新規作成する
- 現在 `gemini-prompt.builder.ts` L66–L88 の `buildNoAllergenPrompt` プロンプトを移動する（動的部分なし）

### Phase 2: ビルダーの修正

- `gemini-prompt.builder.ts` でモジュールスコープ（または起動時）にテキストファイルを `fs.readFileSync` で読み込み定数に保持する
- `path.resolve` / `path.join` で `__dirname` 相対パスを使い、Lambda コンテナデプロイ時も `src/scan/prompts/` が参照できるパスにする（TBD: generator が Lambda バンドル構成を確認して適切なパスを決定すること）
- プレースホルダー置換ロジックを実装する
- `buildNoAllergenPrompt` もテキストファイルから読み込む構造に変更する

### Phase 3: テストの更新・追加

- 既存の `gemini-prompt.builder` 単体テストが存在する場合は、テキストファイル読み込みをモックせずともテスト通過するよう確認する
- プレースホルダーが正しく置換されていること（`{{ALLERGEN_LABEL}}` / `{{DETECTION_LIST}}` / `{{EXCLUDE_LIST}}` が最終プロンプトに残らないこと）を検証するテストを追加する
- `buildGeminiPrompt` が `enabledAllergens: []` のとき `no-allergen.txt` ベースのプロンプトを返すことを検証するテストを追加する

---

## Files to modify

| File | Action |
|------|--------|
| `backend/src/scan/prompts/allergen-detection.txt`（新規） | 通常判定用プロンプトテンプレート |
| `backend/src/scan/prompts/no-allergen.txt`（新規） | アレルギー設定なし用プロンプトテンプレート |
| `backend/src/scan/gemini-prompt.builder.ts`（編集） | テキストファイルロード・プレースホルダー置換ロジックに変更 |
| `backend/src/scan/gemini-prompt.builder.spec.ts`（新規または編集） | プレースホルダー置換・no-allergen 分岐のテスト |

---

## Tests to add

### gemini-prompt.builder.spec.ts

| シナリオ | 期待結果 |
|----------|----------|
| `buildGeminiPrompt` に enabledAllergens と AllergenComponentRepository モックを渡す | 返却文字列に `{{ALLERGEN_LABEL}}`・`{{DETECTION_LIST}}`・`{{EXCLUDE_LIST}}` が含まれない |
| 上記の返却文字列に `enabledAllergens` の値（例: `'乳'`）が含まれる | PASS |
| `buildGeminiPrompt` に `enabledAllergens: []` を渡す | `no-allergen.txt` ベースのプロンプト（「アレルギー設定がないため」を含む文字列）が返る |
| exclude 型の成分が `detectionList` に含まれない | PASS（`component_type: 'exclude'` の成分は `{{DETECTION_LIST}}` に展開されない） |

---

## Completion criteria

- [ ] `backend/src/scan/prompts/allergen-detection.txt` が存在する（`Test-Path backend/src/scan/prompts/allergen-detection.txt` が True）
- [ ] `backend/src/scan/prompts/no-allergen.txt` が存在する（`Test-Path backend/src/scan/prompts/no-allergen.txt` が True）
- [ ] `allergen-detection.txt` に `{{ALLERGEN_LABEL}}`・`{{DETECTION_LIST}}`・`{{EXCLUDE_LIST}}` の3プレースホルダーがすべて存在する（`Select-String -Pattern "{{ALLERGEN_LABEL}}" backend/src/scan/prompts/allergen-detection.txt` 等でヒット）
- [ ] `gemini-prompt.builder.ts` にプロンプトの静的ルール文（例: `「判定は「含む/一部含む/なし/判定不能」の4択のみ」`）が TypeScript 文字列リテラルとして残っていない（`grep "判定は" backend/src/scan/gemini-prompt.builder.ts` でヒット件数 0）
- [ ] `gemini-prompt.builder.ts` に `fs.readFileSync` または同等のファイル読み込みが存在する（`grep "readFileSync\|readFile" backend/src/scan/gemini-prompt.builder.ts` でヒット）
- [ ] `buildGeminiPrompt` の関数シグネチャが変更されていない（`grep "buildGeminiPrompt" backend/src/scan/gemini-prompt.builder.ts` でシグネチャが `enabledAllergens: string[], db: AllergenComponentRepository` のまま）
- [ ] `gemini-prompt.builder.spec.ts` に「返却文字列にプレースホルダーが残らない」テストケースが存在し PASS する
- [ ] `pnpm --filter backend test` で `gemini-prompt.builder.spec.ts` の全テストが PASS する（FAIL 0件）
- [ ] `pnpm --filter backend typecheck` がエラー 0件で終了する
- [ ] `as any` が `gemini-prompt.builder.ts` に新規追加されていない（`grep "as any" backend/src/scan/gemini-prompt.builder.ts` でヒット件数 0）

---

## Risks

| リスク | 回避方針 |
|--------|----------|
| Lambda コンテナデプロイ時に `src/scan/prompts/` がバンドルに含まれない | generator が NestJS の Lambda バンドル設定（webpack / esbuild 等）を確認し、`prompts/` ディレクトリが `dist/` にコピーされるよう設定する。`__dirname` ではなく `path.resolve` でビルド後パスを指定する方針を検討する（TBD: generator 確認） |
| テキストファイル読み込みの失敗（ファイル不在等）がランタイムエラーになる | モジュールロード時に `readFileSync` を実行し、失敗した場合は起動時にエラーを throw する（デプロイ時に気づける設計）。try-catch で無視しない |
| `replace` が最初のプレースホルダーしか置換しない（正規表現なし） | `String.prototype.replace` に `/{{ALLERGEN_LABEL}}/g` 形式の正規表現を使い全箇所を置換する。プレースホルダーが複数回出現する場合でも対応できる実装にする |

---

## Implementation summary

### Phase 1: プロンプトテキストファイルの作成

- `backend/src/scan/prompts/allergen-detection.txt`（新規）: 通常判定用プロンプトテンプレート。動的部分を `{{ALLERGEN_LABEL}}`・`{{DETECTION_LIST}}`・`{{EXCLUDE_LIST}}` のプレースホルダーに置換。元の L31–L61 の静的テキストを全て移動。
- `backend/src/scan/prompts/no-allergen.txt`（新規）: アレルギー設定なし用プロンプトテンプレート。動的部分なし。元の L66–L88 の静的テキストを全て移動。

### Phase 2: ビルダーの修正

- `backend/src/scan/gemini-prompt.builder.ts`（編集）:
  - モジュールスコープで `fs.readFileSync` を2回呼び出し、`ALLERGEN_DETECTION_TEMPLATE` と `NO_ALLERGEN_TEMPLATE` 定数に保持（L10–L17）。
  - `path.resolve(__dirname, 'prompts')` でパスを解決（L10）。テスト時は `src/scan/prompts/`、ビルド後は `dist/scan/prompts/` を参照。
  - プレースホルダー名を定数化（`PLACEHOLDER_ALLERGEN_LABEL` 等、L20–L22）。
  - `String.prototype.replace` に正規表現（`escapeRegExp` 関数でメタ文字をエスケープ）を使い全置換（L44–L56）。
  - `buildGeminiPrompt` の関数シグネチャ（`enabledAllergens: string[], db: AllergenComponentRepository`）は変更なし（L29–L31）。
  - 呼び出し元（`ScanService`）の変更不要。

### Phase 3: テストの更新・追加

- `backend/src/scan/gemini-prompt.builder.spec.ts`（編集）: 既存テスト6件を維持した上で以下3件を追加。
  - 「返却文字列にプレースホルダーが残らない」: `{{ALLERGEN_LABEL}}`・`{{DETECTION_LIST}}`・`{{EXCLUDE_LIST}}` が最終プロンプトに含まれないことを検証。
  - 「enabledAllergens の値がプロンプトに含まれる」: アレルギー名「乳」が最終プロンプトに含まれることを検証。
  - 「exclude 型成分が detectionList に含まれない」: `component_type: 'exclude'` の成分が `{{DETECTION_LIST}}` 展開後に含まれないことを再検証。

### ビルド設定

- `backend/nest-cli.json`（編集）: `compilerOptions.assets` に `scan/prompts/**/*.txt` を追加。`nest build` 時に `dist/scan/prompts/` へ自動コピーされ、Lambda コンテナデプロイ時も `__dirname` 相対パスで参照可能。

### ラウンド2 修正（evaluator FAIL 受領後）

- `backend/src/scan/gemini-prompt.builder.spec.ts`（編集）: `@typescript-eslint/unbound-method` ESLint エラー2件を修正。
  - L56–58: `mockDb` の型を `as unknown as AllergenComponentRepository` キャストから `{ findByAllergens: jest.Mock }` 明示型定義に変更。プロジェクト標準（`scan.service.spec.ts` L54 のパターン）に準拠。
  - L63: `(mockDb.findByAllergens as jest.Mock).mockResolvedValue(...)` → `mockDb.findByAllergens.mockResolvedValue(...)` に変更（`as jest.Mock` キャスト除去）。
  - 各 `buildGeminiPrompt` 呼び出し箇所（L67, L75, L82, L90, L96, L101, L106, L113, L118, L123）: `mockDb` を `mockDb as unknown as AllergenComponentRepository` として呼び出し側でキャストする形に変更。

---

## Plan deviation

none

---

## Review comments

## 自動評価（2026-05-19 00:00） - ラウンド 1

### 総合判定
**FAIL** （Critical: 0 / High: 0 / Medium: 0 / Low: 2）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 10/10 通過、typecheck 0件、unit 66件全合格）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（10テストケース、新規ロジック網羅）
- 4. 敵対的観点: ✅（破壊的操作の防御不足 0 件）
- 5. 保守性: ❌（ESLint error 2 件 / アンチパターン 0 / マジックナンバー 0 / 冗長コメント 0）

### 不合格理由

#### 【種別】Static (ESLint)
**【再現手順】**
1. `cd backend && npx eslint "src/scan/gemini-prompt.builder.spec.ts"` を実行する
2. 以下の2件のエラーが出力される:
   ```
   92:12  error  @typescript-eslint/unbound-method
   102:12 error  @typescript-eslint/unbound-method
   ```

**【内容】**
`gemini-prompt.builder.spec.ts` の `mockDb` を `as unknown as AllergenComponentRepository` でキャストしているため、`findByAllergens` プロパティが実際のメソッド型（`jest.Mock` ではない）として認識される。`expect(mockDb.findByAllergens)` でメソッドを単体参照するとき、`this` バインドが外れる可能性があると ESLint が判定する。

**【プロジェクト標準との差異】**
他のスペックファイル（`scan.service.spec.ts`、`history.service.spec.ts`）はモックを以下のように型付けしている:
```typescript
// ✅ 既存プロジェクト標準
let allergenComponentRepository: { findByAllergens: jest.Mock };
```
これにより `findByAllergens` の型が `jest.Mock` となり、`unbound-method` エラーが発生しない。

**【期待される修正案】**
`backend/src/scan/gemini-prompt.builder.spec.ts` L56–L58 の `mockDb` 定義を変更する:

変更前:
```typescript
const mockDb = {
  findByAllergens: jest.fn(),
} as unknown as AllergenComponentRepository;
```

変更後:
```typescript
const mockDb: { findByAllergens: jest.Mock } = {
  findByAllergens: jest.fn(),
};
```

これに伴い、L63 の `(mockDb.findByAllergens as jest.Mock).mockResolvedValue(mockComponents)` も変更する:

変更前:
```typescript
(mockDb.findByAllergens as jest.Mock).mockResolvedValue(mockComponents);
```

変更後:
```typescript
mockDb.findByAllergens.mockResolvedValue(mockComponents);
```

また、`buildGeminiPrompt` の引数型に `mockDb` を渡す箇所（L67, L75, L82, 他）は `mockDb as unknown as AllergenComponentRepository` として呼び出し側でキャストする:
```typescript
const prompt = await buildGeminiPrompt(['乳', '卵'], mockDb as unknown as AllergenComponentRepository);
```

参照: `.claude/rules/coding_rules.md` — 型安全セクション（`as any` 相当の型抑制禁止）、プロジェクト標準の jest モック型付けパターン

## 自動評価（2026-05-19 10:00） - ラウンド 2

### 総合判定
**FAIL** （Critical: 0 / High: 0 / Medium: 0 / Low: 10）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 10/10 通過、typecheck 0件、unit 66件全合格）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（10テストケース、新規ロジック網羅）
- 4. 敵対的観点: ✅（破壊的操作の防御不足 0 件）
- 5. 保守性: ❌（ESLint prettier/prettier error 10 件 / アンチパターン 0 / マジックナンバー 0 / 冗長コメント 0）

### 不合格理由（ラウンド2 FAIL のため、再実装せず修正案を人間に提示）

#### 【種別】Static (ESLint / Prettier)

**【再現手順】**
1. `cd backend && npx eslint "src/scan/gemini-prompt.builder.spec.ts"` を実行する
2. 以下の10件の `prettier/prettier` エラーが出力される（L67, L75, L82, L90, L96, L101, L106, L113, L118, L123）

**【内容】**
ラウンド2 で `unbound-method` エラーを修正するため `buildGeminiPrompt` の呼び出し側に `mockDb as unknown as AllergenComponentRepository` キャストを追加したが、Prettier の行幅制限（デフォルト 80 文字）を超えたために `prettier/prettier` フォーマットエラーが10件発生した。各行が1行に詰め込まれているため、Prettier は引数を複数行に分割するよう要求している。

**【根本原因】**
`mockDb: { findByAllergens: jest.Mock }` 型に `jest.Mock` を持たせながら `buildGeminiPrompt` の引数では `mockDb as unknown as AllergenComponentRepository` とキャストする、という2段階アプローチを選んだ。呼び出し箇所が10カ所あり、それぞれで長いキャスト式を追加したため行幅超過が発生した。

**【期待される修正案（人間が直接適用）】**

`backend/src/scan/gemini-prompt.builder.spec.ts` の `mockDb` 定義を以下のように変更し、ヘルパー変数を使ってキャスト1回で済む構造にする:

```typescript
// L56–L58 の mockDb 定義はそのまま維持（jest.Mock 型）
const mockDb: { findByAllergens: jest.Mock } = {
  findByAllergens: jest.fn(),
};

// L60 の describe ブロック直前に以下を追加
// ⚠️ 安全設計: buildGeminiPrompt の引数型への適合のみを目的とし、実体は jest.Mock として扱う
const mockDbTyped = mockDb as unknown as AllergenComponentRepository;
```

そして各テストケース内の `mockDb as unknown as AllergenComponentRepository` を `mockDbTyped` に一括置換する（L67, L75, L82, L90, L96, L101, L106, L113, L118, L123 の10カ所）:

```typescript
// 変更前（例: L67）
const prompt = await buildGeminiPrompt(['乳', '卵'], mockDb as unknown as AllergenComponentRepository);

// 変更後（例: L67）
const prompt = await buildGeminiPrompt(['乳', '卵'], mockDbTyped);
```

この変更により:
- `mockDb.findByAllergens` は `jest.Mock` 型のまま `unbound-method` エラーなし
- `buildGeminiPrompt` への引数は `mockDbTyped` で短くなり Prettier 行幅制限内
- キャストは1カ所のみ（`mockDbTyped` 定義行）に集約され保守性向上

参照: `.claude/rules/coding_rules.md` — コメント規約（`⚠️ 安全設計` コメント）、プロジェクト標準の jest モック型付けパターン（`scan.service.spec.ts` L54）
