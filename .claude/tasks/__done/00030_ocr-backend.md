# Task 00030: OCR Backend (Presigned URL + OCR Scan Endpoint)

| Field | Value |
|-------|-------|
| Status | completed |
| Created | 2026-05-15 |
| Completed | 2026-05-15 |
| Depends on | 00020 (Barcode Scan Backend) |

---

## Background

タスク 00020 で `ScanModule` / `ScanController` / `ScanService` / `ProductRepository` が整備された。`backend/src/scan/scan.module.ts` に `ScanController` と `ScanService` が登録済みであり、`ProductRepository` は `ProductsModule` 経由で DI 可能な状態になっている。

本タスクでは未実装の以下2エンドポイントを追加する。

1. `GET /scan/presigned-url` — S3 Presigned PUT URL の発行
2. `POST /scan/ocr` — `{ s3_key }` を受け取り OCR + アレルゲン判定 → UPSERT → scan_histories 記録

実装の根拠となる正典:
- `docs/api/openapi.yaml` の `PresignedUrlResponse` / `OcrScanRequest` / `OcrScanResponse` スキーマ
- `docs/design/ocr.md` の OCR 安全設計・Gemini プロンプト仕様
- `docs/design/api.md` の OCR スキャンフロー
- `.claude/rules/patterns.md` のパターン2（OCR スキャンフロー）

S3・Gemini の設定値は `backend/.env` の環境変数から取得する（`AWS_REGION`, `S3_BUCKET_NAME`, `GEMINI_API_KEY`）。

現状のファイル構成（00020 完了後):
- `backend/src/scan/scan.constants.ts` — キャッシュ・有効期限定数
- `backend/src/products/expires-at.util.ts` — `calcExpiresAt()` / `getExpiryDays()`
- `backend/src/products/product-id.util.ts` — `buildJanIdValue()`
- `backend/src/shared/gemini.client.ts` — 未作成（本タスクで新規作成）
- `backend/src/shared/s3.client.ts` — 未作成（本タスクで新規作成）
- `backend/src/scan/gemini-prompt.builder.ts` — 未作成（本タスクで新規作成）
- `backend/src/shared/types/db.types.ts` に `UserAllergies` 型定義済み

---

## Requirements

- R1: `GET /scan/presigned-url` が `PresignedUrlResponse`（`{ url: string, s3_key: string }`）を返す。`s3_key` はリクエストごとに一意（UUID ベース）
- R2: `POST /scan/ocr` が `{ s3_key: string }` を受け取り、`OcrScanResponse` 型のレスポンスを返す
- R3: `s3_key` が空文字・未指定の場合、400 と `{ message, code: "INVALID_S3_KEY" }` を返す
- R4: OCR フロー Step 1 として S3 から `s3_key` 指定の画像を取得する。取得失敗（KeyNotFound / ネットワークエラー）は 400 を返す
- R5: OCR フロー Step 2・3 として、`POST /scan/ocr` リクエストヘッダーの `x-user-id` を使いユーザーの有効アレルゲンを `users` テーブルから取得し、`allergen_components` テーブルから exclude 型を除いた成分リストと exclude 型成分を別々に取得してプロンプトを動的生成する（`dry_principles.md` の `buildGeminiPrompt` 集約点に従い `gemini-prompt.builder.ts` に実装）
- R6: OCR フロー Step 4 として Gemini Flash API（`gemini-1.5-flash`）に画像と動的プロンプトを送信し、`OcrScanResponse` 型に準拠した JSON レスポンスを取得する。Gemini クライアントは `backend/src/shared/gemini.client.ts` に分離する
- R7: `incomplete: true` が Gemini から返却された場合、即 400 と `{ message: "ラベル全体が映るように離してください", code: "INCOMPLETE_IMAGE" }` を返す（部分的なラベルで判定しない）
- R8: `confidence: "low"` が Gemini から返却された場合、422 と `{ message: "もう少し近づけて再スキャンしてください", code: "LOW_CONFIDENCE" }` を返す
- R9: `judgment: "判定不能"` は安全側として扱い、400（再スキャン誘導）ではなくレスポンス本文にそのまま含めて返す（クライアントが警告表示する責務）。`incomplete: false` かつ `confidence: high/medium` の場合は 200 で返す
- R10: OCR フロー Step 7 として `products` テーブルに UPSERT する。`id_type: 'hash'`、`id_value` は `label_hash`（`dry_principles.md` の `label-hash.util.ts` 集約点に従い生成）。`ON CONFLICT` に相当する Prisma `upsert` で `scan_count +1`・`expires_at` 再計算を行う
- R11: OCR フロー Step 8 として `scan_histories` テーブルにレコードを INSERT する（`user_id` = `x-user-id` ヘッダー値）。`ScanHistoryRepository` を `backend/src/history/scan-history.repository.ts` に新規作成する
- R12: S3 クライアントは `backend/src/shared/s3.client.ts` に分離し、`ScanService` は S3 SDK を直接 import しない
- R13: `exclude` 型の成分を Gemini の検出対象リストに含めない（anti_patterns.md アンチパターン #3 遵守）
- R14: `as any` を使用しない。Gemini レスポンスのパース結果は `GeminiOcrResponse` 型（`backend/src/shared/types/gemini.types.ts` に定義）で受け取る
- R15: `NestJS Logger` でログを出力する（`console.log` 禁止）
- R16: Controller → Service → Repository の3層構造を守る（architecture.md 依存方向ルール）

---

## Implementation plan

### Phase 1: 共通ユーティリティ・型の追加

- `backend/src/products/label-hash.util.ts`: `buildLabelHash(productName, storeName, rawTextPrefix)` を SHA-256 ハッシュで実装（`dry_principles.md` の集約点）
- `backend/src/products/product-id.util.ts` に `buildHashIdValue(labelHash)` を追加（`hash#${labelHash}` を返す）
- `backend/src/shared/types/gemini.types.ts`: `GeminiOcrResponse` 型を定義（`docs/design/ocr.md` の JSON レスポンス仕様に準拠）
- `backend/src/scan/scan.constants.ts` に `S3_KEY_PREFIX`、`GEMINI_MODEL_NAME`（`'gemini-1.5-flash'`）定数を追加

### Phase 2: S3 クライアント

- `backend/src/shared/s3.client.ts`: `@aws-sdk/client-s3` を使い以下を実装
  - `generatePresignedPutUrl(s3Key)`: PUT 用 Presigned URL を生成
  - `getImageAsBase64(s3Key)`: S3 から画像を取得して base64 文字列で返す（Gemini に渡す形式）
- `backend/.env.example` に `AWS_REGION`・`S3_BUCKET_NAME`・`AWS_ACCESS_KEY_ID`・`AWS_SECRET_ACCESS_KEY` を追記

### Phase 3: Gemini クライアント + プロンプトビルダー

- `backend/src/shared/gemini.client.ts`: `@google/generative-ai` パッケージを使い `analyzeImage(imageBase64, prompt)` を実装。戻り値は `GeminiOcrResponse`
- `backend/src/scan/gemini-prompt.builder.ts`: `buildGeminiPrompt(enabledAllergens, db)` を実装（`dry_principles.md` の集約点パターンに従う）。`exclude` 型を検出対象から除外し、誤検出防止リストとして別途プロンプトに含める

### Phase 4: AllergenComponentRepository + HistoryModule

- `backend/src/allergens/allergen-component.repository.ts`: `findByAllergens(allergenNames)` を実装（`allergen_components` テーブルから指定アレルゲンの成分を取得）
- `backend/src/allergens/allergens.module.ts`: `AllergenComponentRepository` を export する Module
- `backend/src/history/scan-history.repository.ts`: `create(data)` を実装（`scan_histories` テーブルへの INSERT）
- `backend/src/history/history.module.ts`: `ScanHistoryRepository` を export する Module
- `backend/src/products/product.repository.ts` に `upsertByHash(labelHash, data)` を追加

### Phase 5: GET /scan/presigned-url + POST /scan/ocr

- `backend/src/scan/scan.service.ts` に `getPresignedUrl()` と `processOcr(s3Key, userId)` を追加
- `backend/src/scan/scan.controller.ts` に `@Get('presigned-url')` と `@Post('ocr')` を追加（`x-user-id` を `@Headers('x-user-id')` で取得）
- `backend/src/scan/dto/ocr-scan.dto.ts`: `@IsString() @IsNotEmpty()` で `s3_key` をバリデーション
- `backend/src/scan/scan.module.ts` に `AllergensModule`・`HistoryModule`・`S3Client`・`GeminiClient` をインポート / 登録

### Phase 6: Unit テスト

- `backend/src/scan/scan.service.spec.ts` に OCR 関連シナリオを追加
  - `incomplete: true` → 400（BadRequestException）
  - `confidence: "low"` → 422（UnprocessableEntityException）
  - 正常系 → UPSERT + scan_histories INSERT + 200 レスポンス
- `backend/src/products/label-hash.util.spec.ts`: 同一入力で同一ハッシュ、異なる入力で異なるハッシュの単体テスト
- `backend/src/scan/gemini-prompt.builder.spec.ts`: exclude 型が検出対象リストに含まれないことを検証

---

## Files to modify

| File | Action |
|------|--------|
| `backend/src/products/label-hash.util.ts`（新規） | `buildLabelHash()` ユーティリティ |
| `backend/src/products/product-id.util.ts`（編集） | `buildHashIdValue()` を追加 |
| `backend/src/shared/types/gemini.types.ts`（新規） | `GeminiOcrResponse` 型定義 |
| `backend/src/scan/scan.constants.ts`（編集） | `S3_KEY_PREFIX`・`GEMINI_MODEL_NAME` 定数を追加 |
| `backend/src/shared/s3.client.ts`（新規） | S3 Presigned URL 発行・画像取得クライアント |
| `backend/src/shared/gemini.client.ts`（新規） | Gemini Flash API クライアント |
| `backend/src/scan/gemini-prompt.builder.ts`（新規） | 動的プロンプトビルダー |
| `backend/src/allergens/allergen-component.repository.ts`（新規） | アレルゲン成分取得 Repository |
| `backend/src/allergens/allergens.module.ts`（新規） | AllergensModule |
| `backend/src/history/scan-history.repository.ts`（新規） | scan_histories INSERT Repository |
| `backend/src/history/history.module.ts`（新規） | HistoryModule |
| `backend/src/products/product.repository.ts`（編集） | `upsertByHash()` を追加 |
| `backend/src/scan/scan.service.ts`（編集） | `getPresignedUrl()` / `processOcr()` を追加 |
| `backend/src/scan/scan.controller.ts`（編集） | GET presigned-url / POST ocr を追加 |
| `backend/src/scan/dto/ocr-scan.dto.ts`（新規） | OcrScanDto |
| `backend/src/scan/scan.module.ts`（編集） | 新モジュール・クライアントを追加 |
| `backend/.env.example`（編集） | AWS・Gemini 環境変数のひな型を追記 |
| `backend/package.json`（編集） | `@aws-sdk/client-s3`・`@aws-sdk/s3-request-presigner`・`@google/generative-ai` を追加 |
| `backend/src/products/label-hash.util.spec.ts`（新規） | label-hash 単体テスト |
| `backend/src/scan/gemini-prompt.builder.spec.ts`（新規） | プロンプトビルダー単体テスト |
| `backend/src/scan/scan.service.spec.ts`（編集） | OCR シナリオ追加 |

---

## Tests to add

### scan.service.spec.ts（OCR シナリオ追加）

| シナリオ | 期待動作 |
|----------|----------|
| incomplete: true | `BadRequestException` を throw する |
| confidence: "low" | `UnprocessableEntityException` を throw する |
| 正常系（confidence: high） | `ScanHistoryRepository.create` が呼ばれる + 200 |
| S3 取得失敗 | `BadRequestException` を throw する |

### label-hash.util.spec.ts

| 検証内容 | 期待結果 |
|----------|----------|
| 同一引数 | 同一ハッシュを返す |
| 異なる商品名 | 異なるハッシュを返す |
| 返り値 | 64文字の16進文字列（SHA-256） |

### gemini-prompt.builder.spec.ts

| 検証内容 | 期待結果 |
|----------|----------|
| exclude 型成分 | 検出対象リストに含まれない |
| exclude 型成分 | 誤検出防止リストに含まれる |
| 有効アレルゲンのみ | プロンプトに含まれる |

---

## Completion criteria

- [ ] `GET /scan/presigned-url` にリクエストして `{ url, s3_key }` 両フィールドを含む 200 レスポンスが返る（`grep "presigned-url\|getPresignedUrl" backend/src/scan/scan.controller.ts` でヒット）
- [ ] `POST /scan/ocr` に `{ "s3_key": "" }`（空文字）を送信したとき 400 が返る実装になっている（`grep "IsNotEmpty\|IsString" backend/src/scan/dto/ocr-scan.dto.ts` でヒット）
- [ ] `processOcr` 内で `incomplete: true` の場合に `BadRequestException` を throw する実装がある（`grep "BadRequestException" backend/src/scan/scan.service.ts` でヒット）
- [ ] `processOcr` 内で `confidence: 'low'` の場合に `UnprocessableEntityException` を throw する実装がある（`grep "UnprocessableEntityException" backend/src/scan/scan.service.ts` でヒット）
- [ ] `gemini-prompt.builder.ts` が `exclude` 型を検出対象リストから除外し誤検出防止リストに含める実装になっている（`grep "exclude" backend/src/scan/gemini-prompt.builder.ts` でヒット）
- [ ] `scan.service.ts` が `S3Client`・`GeminiClient` を直接 import せず DI で受け取っている（`grep "new S3Client\|new GeminiClient" backend/src/scan/scan.service.ts` でヒット件数 0）
- [ ] `scan.service.ts` が SQL クエリを直接含まない（`grep -i "SELECT\|INSERT\|UPDATE" backend/src/scan/scan.service.ts` でヒット件数 0）
- [ ] `upsertByHash` が `product.repository.ts` に存在し、Prisma `upsert` または `$executeRaw` を使っている（`grep "upsertByHash\|upsert\|executeRaw" backend/src/products/product.repository.ts` でヒット）
- [ ] `scan-history.repository.ts` が存在し `create` メソッドを持つ（`grep "create" backend/src/history/scan-history.repository.ts` でヒット）
- [ ] `as any` が新規追加ファイルに含まれない（`grep -r "as any" backend/src/scan/ backend/src/shared/ backend/src/allergens/ backend/src/history/` でヒット件数 0）
- [ ] `console.log` が新規追加ファイルに含まれない（`grep -r "console\.log" backend/src/scan/ backend/src/shared/ backend/src/allergens/ backend/src/history/` でヒット件数 0）
- [ ] `label-hash.util.spec.ts` の単体テスト全件 PASS・`gemini-prompt.builder.spec.ts` の単体テスト全件 PASS・`scan.service.spec.ts` の OCR シナリオ 4件 PASS（`pnpm --filter backend test` で FAIL 0件）
- [ ] `pnpm --filter backend typecheck` がエラー 0件で終了する
- [ ] `backend/src/shared/types/gemini.types.ts` に `GeminiOcrResponse` 型が export されており `as any` を含まない（`grep "GeminiOcrResponse" backend/src/shared/types/gemini.types.ts` でヒット）

---

## Risks

| リスク | 回避方針 |
|--------|----------|
| Gemini API の JSON パース失敗 | `GeminiClient.analyzeImage` 内で JSON.parse を try/catch し、パース失敗時は `judgment: '判定不能'` として返す（安全側に倒す） |
| S3 Presigned URL の有効期限設定 | Presigned URL の有効期限は 300秒（5分）固定。定数 `PRESIGNED_URL_EXPIRES_SEC` として `scan.constants.ts` に追加する |
| label_hash の衝突 | SHA-256 は衝突確率が無視できるほど低い。設計上許容する（`database.md` 設計方針に従う） |
| `x-user-id` ヘッダー未送信時の挙動 | `x-user-id` が未送信の場合 `users` テーブルにレコードがなく有効アレルゲンは空になる。空の場合は全アレルゲン除外でプロンプト生成し、Gemini には「設定アレルゲンなし」として送信する（判定不能ではなく「なし」で返す）。Evaluator はこの挙動を確認すること（TBD: generator がヘッダーバリデーション方針を決定） |
| `@google/generative-ai` の NestJS 対応 | NestJS の DI で動作するよう `GeminiClient` を `@Injectable()` クラスとして実装する |

---

## Implementation summary

### Phase 1: 共通ユーティリティ・型の追加
- `backend/src/products/label-hash.util.ts`（新規）: `buildLabelHash()` を SHA-256 で実装（L1-18）
- `backend/src/products/product-id.util.ts`（編集）: `buildHashIdValue()` を追加（L4）
- `backend/src/shared/types/gemini.types.ts`（新規）: `GeminiOcrResponse` 型を定義（L1-16）
- `backend/src/scan/scan.constants.ts`（編集）: `S3_KEY_PREFIX`・`GEMINI_MODEL_NAME`・`PRESIGNED_URL_EXPIRES_SEC` 定数を追加（L23-30）

### Phase 2: S3 クライアント
- `backend/src/shared/s3.client.ts`（新規）: `generatePresignedPutUrl()` / `getImageAsBase64()` を実装（L1-60）
- `backend/.env.example`（編集）: AWS・Gemini 環境変数のひな型を追記（L4-11）

### Phase 3: Gemini クライアント + プロンプトビルダー
- `backend/src/shared/gemini.client.ts`（新規）: `analyzeImage()` を実装。JSON パース失敗時は判定不能（安全側）を返す（L1-124）
- `backend/src/scan/gemini-prompt.builder.ts`（新規）: `buildGeminiPrompt()` を実装。exclude 型を検出対象から除外し誤検出防止リストとして別途渡す（L1-97）

### Phase 4: AllergenComponentRepository + HistoryModule
- `backend/src/allergens/allergen-component.repository.ts`（新規）: `findByAllergens()` を実装（L1-40）
- `backend/src/allergens/allergens.module.ts`（新規）: `AllergenComponentRepository` を export（L1-9）
- `backend/src/history/scan-history.repository.ts`（新規）: `create()` を実装（L1-66）
- `backend/src/history/history.module.ts`（新規）: `ScanHistoryRepository` を export（L1-9）
- `backend/src/products/product.repository.ts`（編集）: `upsertByHash()` を追加（L113-160）

### Phase 5: GET /scan/presigned-url + POST /scan/ocr
- `backend/src/scan/dto/ocr-scan.dto.ts`（新規）: `OcrScanDto` を定義（L1-9）
- `backend/src/scan/scan.service.ts`（編集）: `getPresignedUrl()` / `processOcr()` を追加（L95-173）
- `backend/src/scan/scan.controller.ts`（編集）: GET presigned-url / POST ocr を追加（L1-43）
- `backend/src/scan/scan.module.ts`（編集）: AllergensModule・HistoryModule・S3Client・GeminiClient をインポート（L1-27）

### Phase 6: Unit テスト
- `backend/src/products/label-hash.util.spec.ts`（新規）: 同一入力で同一ハッシュ、64文字16進文字列の検証（L1-38）
- `backend/src/scan/gemini-prompt.builder.spec.ts`（新規）: exclude 型除外・誤検出防止リスト含有の検証（L1-67）
- `backend/src/scan/scan.service.spec.ts`（編集）: OCR シナリオ 4件追加（incomplete/low/S3失敗/正常系）

### アプリ起動コマンド
- バックエンド起動: `pnpm --filter backend start:dev`
- typecheck: `pnpm --filter backend typecheck`
- unit テスト: `pnpm --filter backend test`

### 検証シナリオ（手動）
1. GET /scan/presigned-url → `{ url, s3_key }` を含む 200 レスポンス
2. POST /scan/ocr `{ s3_key: "" }` → 400 レスポンス（バリデーション）
3. POST /scan/ocr `{ s3_key: "valid-key" }` + x-user-id → 200 レスポンス（正常系）

---

## Plan deviation

1. **ScanService が PrismaService を直接 DI**: `fetchEnabledAllergens()` でユーザー設定を取得するため `PrismaService` を ScanService に直接注入しています。architecture.md の3層ルールでは Service → Repository が推奨ですが、本タスクの Files to modify スコープに `UsersRepository` の作成は含まれていないため、やむを得ず直接 DI しました。別タスクで `UsersRepository` + `UsersModule` を作成して ScanService を書き換えることを推奨します。（Evaluator 指摘 #6: 別タスク化確認済み）

2. **label_hash の生成ロジック（productName を rawText から生成）**: `processOcr` での label_hash 生成時、商品名が不明なため `geminiResult.raw_text.slice(0, RAW_TEXT_PREFIX_LENGTH)` を productName として使用しています。`database.md` の「商品名 + 店舗名 + 原材料の先頭50文字」定義を完全には満たしていません。OCR スキャンの特性上、商品名が取得できないため、raw_text 先頭文字で代替しています。

### ラウンド2修正内容（evaluator FAIL 対応）
1. `gemini-prompt.builder.spec.ts` L26-27 の正規表現アサーション `/乳化剤.*検出対象成分/s` と `/乳酸菌.*検出対象成分/s` を削除し、分割ベースのアサーションのみに統一した（テスト実装と動作実装に問題はなく、アサーションのみ修正）
2. `ocr-scan.dto.ts` に `@Matches(/^scan-images\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/)` を追加し、任意 S3 パスへのアクセスをアプリ層で遮断した
3. `scan.service.ts` の `userId ?? 'anonymous'` を `userId ?? randomUUID()` に変更した（`anonymous` 固定 ID による履歴混在を防止）
4. `scan.service.ts` の `raw_text.slice(0, 50)` を `raw_text.slice(0, RAW_TEXT_PREFIX_LENGTH)` に変更し、定数を `scan.constants.ts` に追加した
5. `gemini.client.ts` の `text.slice(0, 200)` を `text.slice(0, GEMINI_ERROR_LOG_MAX_LENGTH)` に変更し、定数を `scan.constants.ts` に追加した

---

## Review comments

## 自動評価（2026-05-16 10:00） - ラウンド 2

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 1）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 14/14 通過、typecheck 0件、unit test 30件全合格）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ⚠️ 算出不能（Jest --coverage 未使用。主要シナリオ: incomplete/confidence-low/S3失敗/正常系 + label-hash/prompt-builder 全件テストあり）
- 4. 敵対的観点: ✅（Critical/High 0 件）
- 5. 保守性: ✅（層違反 0 件 / アンチパターン再導入 0 件 / マジックナンバー 0 件 / 冗長コメント 0 件）

### ラウンド1 指摘の解消確認
1. gemini-prompt.builder.spec.ts の正規表現アサーション → 削除済み。分割ベースアサーション（prompt.split('【検出対象外')[0]）に統一。✅
2. ocr-scan.dto.ts に @Matches バリデーション追加 → `/^scan-images\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/` 追加済み。✅
3. scan.service.ts の 'anonymous' → randomUUID() に変更済み（L177）。✅
4. scan.service.ts の slice(0, 50) → RAW_TEXT_PREFIX_LENGTH 定数参照に変更済み（L162）。scan.constants.ts L32 に定数定義済み。✅
5. gemini.client.ts の text.slice(0, 200) → GEMINI_ERROR_LOG_MAX_LENGTH 定数参照に変更済み（L66）。scan.constants.ts L35 に定数定義済み。✅
6. ScanService→PrismaService直接注入 → 別タスク繰越し扱い（本ラウンドスコープ外として許容）。✅

### 改善提案（Low / 次タスク繰越し可）
- [Maintainability / Low] `backend/src/shared/gemini.client.ts` L4 が `../scan/scan.constants` を import している。shared 層が scan 層に依存する形であり、アーキテクチャ的には `GEMINI_ERROR_LOG_MAX_LENGTH` と `GEMINI_MODEL_NAME` を `backend/src/shared/constants/gemini.constants.ts` に移動するとレイヤー境界がより明確になる。機能上の問題はなく、次タスク繰越し推奨。
- [Security / Info] `x-user-id` ヘッダーは自己申告方式のため、認証ミドルウェアによる検証なしでは他ユーザーのデバイス ID を指定した履歴書き込みが可能。MVP の制約として設計上許容済みだが、`UsersRepository` + 認証ミドルウェア追加タスクで根本対処を推奨（ラウンド1からの繰越し）。
- [Maintainability / Info] `toJudgmentShort('判定不能')` が `'ok'` にフォールバックするため、scan_histories に `judgment: 'ok'` として記録される。R9 の仕様（レスポンス本文には判定不能のまま返す）とは矛盾しないが、DB 上の履歴精度が低下する。次タスクで `'unknown'` 等のカテゴリ追加を検討推奨。

---

## 自動評価（2026-05-16 00:00） - ラウンド 1

### 総合判定
**FAIL** （Critical: 0 / High: 0 / Medium: 2 / Low: 3）

### Threshold 達成状況
- 1. 動作性: ❌（Completion criteria 13/14 通過、typecheck 0件、unit test 1件失敗）
- 2. セキュリティ: ❌（Medium 以上 2 件）
- 3. カバレッジ: ⚠️ 算出不能（Jest の --coverage フラグ未使用のため計測不能。ただし主要シナリオはテストあり）
- 4. 敵対的観点: ✅（Critical/High 0 件。Medium は閾値2で計上）
- 5. 保守性: ❌（アーキテクチャ層違反 1 件 / マジックナンバー 2 件）

### 不合格理由（generator への差戻しフィードバック）

---

#### 【Static / Layer B】テスト1件失敗: gemini-prompt.builder.spec.ts

**【再現手順】**
1. `pnpm --filter backend test` を実行する
2. `gemini-prompt.builder.spec.ts` の `exclude 型成分が検出対象リストに含まれない` テストが FAIL

**【根本原因】**
`backend/src/scan/gemini-prompt.builder.spec.ts` 行26 のアサーション:
```typescript
expect(prompt).not.toMatch(/乳化剤.*検出対象成分/s);
```
このアサーションは「乳化剤の後に 検出対象成分 が来ないこと」を検証する意図だが、プロンプトのルールセクションに `・上記検出対象成分を必ず検出すること` という文字列が含まれており、「乳化剤（【検出対象外】セクション）→（改行）→ ルール文中の 検出対象成分」という順序でマッチしてしまう。

実装自体は正しい（`乳化剤` は `【検出対象外】` セクションに配置されている）が、テストのアサーションが意図しない文字列にマッチするため FAIL する。

**【期待される修正案】**
- `backend/src/scan/gemini-prompt.builder.spec.ts` 行26〜31 を以下に変更する:
```typescript
it('exclude 型成分が検出対象リストに含まれない', async () => {
  const prompt = await buildGeminiPrompt(['乳', '卵'], mockDb);
  // 【検出対象成分】セクションのみを抽出して検証する
  const detectionSection = prompt.split('【検出対象外')[0];
  expect(detectionSection).not.toContain('乳化剤');
  expect(detectionSection).not.toContain('乳酸菌');
});
```
行26〜27 の正規表現アサーションを削除し、行29〜31 の分割ベースのアサーションのみに統一する。

---

#### 【Security / Layer C】Medium: s3_key に形式バリデーションなし（S3 パストラバーサル）

**【再現手順】**
1. 攻撃者が `POST /scan/ocr` を呼び出す
2. リクエストボディ: `{ "s3_key": "../../other-bucket-prefix/secret.jpg" }` を送信
3. S3 SDK の `GetObjectCommand` が攻撃者指定の任意の key でオブジェクト取得を試みる

**【影響】**
`S3_BUCKET_NAME` 内の意図しないオブジェクト（例: 他ユーザーのスキャン画像）への読み取りアクセスが可能。AWS IAM ポリシーで制限されていれば実害は限定的だが、アプリ層での入力バリデーション欠落は防御の多層化原則違反。

**【期待される修正案】**
- `backend/src/scan/dto/ocr-scan.dto.ts` に `@Matches` デコレータを追加:
```typescript
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class OcrScanDto {
  @IsString()
  @IsNotEmpty({ message: 's3_key は空にできません' })
  @Matches(/^scan-images\/[0-9a-f-]{36}\.jpg$/, {
    message: 's3_key の形式が不正です',
  })
  s3_key!: string;
}
```
- 参照: `backend/src/scan/scan.constants.ts` の `S3_KEY_PREFIX = 'scan-images/'`

---

#### 【Security / Layer C】Medium: x-user-id ヘッダー未検証による scan_histories 書き込み偽装

**【再現手順】**
1. 攻撃者が `POST /scan/ocr` を送信する際に `x-user-id: victim-user-uuid` を指定する
2. `scan_histories` テーブルに `user_id = 'victim-user-uuid'` でレコードが INSERT される
3. 被害者のスキャン履歴に不正なレコードが混入する

**【影響】**
他ユーザーのデバイス ID を知っていれば（または総当たり可能な場合）、そのユーザーの履歴を改竄できる。Medium（同テナント内の別デバイス間の権限境界突破）。

**【期待される修正案】**
MVP のデバイス ID 認証という制約から抜本的な修正は本タスクスコープ外だが、最低限の緩和策:
- `userId` が未指定の場合のフォールバックを `'anonymous'` 固定にしない。`'anonymous'` という固定 ID に全ユーザーの匿名履歴が混在するため、別のリスクを生む。
- `backend/src/scan/scan.service.ts` 行177:
  ```typescript
  // 現状
  userId: userId ?? 'anonymous',
  // 推奨: 未指定時は履歴記録をスキップするか、ランダム UUID を割り当てる
  userId: userId ?? randomUUID(),
  ```
- 将来タスクで `UsersRepository` + 認証ミドルウェアを追加して根本対処することを推奨。

---

#### 【Maintainability / Layer E】アーキテクチャ層違反: ScanService が PrismaService を直接注入

**【再現手順】**
`backend/src/scan/scan.service.ts` 行19・53:
```typescript
import { PrismaService } from '../prisma/prisma.service';  // 行19
private readonly prisma: PrismaService,  // 行53
```
`architecture.md` の「Service は Repository 経由でのみ DB アクセスすること」に違反している。

**【影響】**
`fetchEnabledAllergens()` メソッドが Service 層に SQL クエリ相当のロジックを持ち、Repository 層との責務分離が崩れる。将来 DB ORM を変更した際に Service の修正が必要になる。

**【期待される修正案】**
- `backend/src/users/user.repository.ts`（新規）を作成し `findEnabledAllergens(userId)` を実装する
- `backend/src/users/users.module.ts`（新規）を作成し `UserRepository` を export する
- `ScanService` から `PrismaService` の直接 import を削除し、`UserRepository` 経由に変更する
- Generator が `Plan deviation` で認識済みのため、別タスクとして切り出すことも可。その場合は新タスクを即時起票すること。

---

#### 【Maintainability / Layer E】マジックナンバー: slice(0, 50) が定数を使用していない

**【再現手順】**
`backend/src/scan/scan.service.ts` 行162:
```typescript
geminiResult.raw_text.slice(0, 50),
```
`50` は `database.md` の「原材料の先頭50文字」に対応するマジックナンバー。`backend/src/products/label-hash.util.ts` には同じ定数が `RAW_TEXT_PREFIX_LENGTH = 50` として定義されているが、`scan.service.ts` はそれを参照していない。

**【期待される修正案】**
- `backend/src/scan/scan.service.ts` 行162 を変更:
```typescript
import { RAW_TEXT_PREFIX_LENGTH } from '../products/label-hash.util';
// ...
geminiResult.raw_text.slice(0, RAW_TEXT_PREFIX_LENGTH),
```
- または `RAW_TEXT_PREFIX_LENGTH` を `scan.constants.ts` に移動して共有する（DRY）。

---

#### 【Maintainability / Layer E】マジックナンバー: text.slice(0, 200)

**【再現手順】**
`backend/src/shared/gemini.client.ts` 行66:
```typescript
this.logger.error('Gemini レスポンスに JSON が見つかりません', text.slice(0, 200));
```
`200` はログ出力のトランケーション長だが名前付き定数になっていない。

**【期待される修正案】**
- `backend/src/shared/gemini.client.ts` 先頭に定数を追加:
```typescript
const LOG_TRUNCATE_LENGTH = 200;
// ...
this.logger.error('Gemini レスポンスに JSON が見つかりません', text.slice(0, LOG_TRUNCATE_LENGTH));
```

---

### 改善提案（次タスク繰越し可）
- [Security] レートリミット（ThrottlerModule）を POST /scan/ocr に追加する。外部 API（Gemini）のコスト爆発リスクあり。
- [Maintainability] `UsersRepository` を別タスクで作成し、ScanService の PrismaService 直接依存を解消する（Generator の Plan deviation に明記済み）。
- [Maintainability] `label-hash.util.spec.ts` が `RAW_TEXT_PREFIX_LENGTH` を export すれば `scan.service.ts` が参照しやすくなる。
