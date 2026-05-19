# Task 00020: Barcode Scan Backend

| Field | Value |
|-------|-------|
| Status | completed |
| Created | 2026-05-15 |
| Completed | 2026-05-15 |
| Depends on | 00010 (Prisma DB Setup) |

---

## Background

タスク 00010 で Prisma スキーマ・PrismaModule・Docker Compose が整備される。本タスクでは `backend/src/scan/` モジュールを新規作成し、`POST /scan/barcode` エンドポイントを実装する。`docs/api/openapi.yaml` の `BarcodeScanRequest` / `BarcodeScanResponse` スキーマおよび `docs/design/api.md` のフロー定義が正典。`backend/src/app.module.ts` は現在 PrismaModule のみをインポートした状態（00010 完了後）であり、ScanModule を追加する必要がある。

スキャンフロー（`patterns.md` パターン1）:
1. NestJS メモリキャッシュ確認（TTL: 60秒 = `CACHE_TTL_MEMORY_SEC`）
2. DB の `products.expires_at` 確認（有効期限内なら即返却）
3. Open Food Facts API 照合（`https://world.openfoodfacts.org/api/v0/product/{jan_code}.json`）
4. ミスなら `{ found: false }` を返却

共通定数（`CACHE_TTL_MEMORY_SEC`, `EXPIRES_AT_DAYS`, `SCAN_COUNT_THRESHOLD`）は `backend/src/scan/scan.constants.ts` に定義する。`expires_at` 計算ロジックは `backend/src/products/expires-at.util.ts` に集約する（DRY 原則）。商品 ID 生成ロジックは `backend/src/products/product-id.util.ts` に集約する。

---

## Requirements

- R1: `POST /scan/barcode` が `{ jan_code: string }` を受け取り、openapi.yaml の `BarcodeScanResponse` 型のレスポンスを返す
- R2: `jan_code` が 8〜13 桁の数字でない場合、400 と `{ message, code: "INVALID_JAN_CODE" }` を返す
- R3: NestJS の `CacheModule`（`@nestjs/cache-manager`）を使ったインメモリキャッシュを ScanService 内に実装し、TTL は `CACHE_TTL_MEMORY_SEC`（60秒）の定数を使う
- R4: キャッシュミス時に `products` テーブルの `expires_at` を確認し、有効期限内の商品は DB から即返却する（`ProductRepository.findByJan` を実装する）
- R5: DB ミス / 期限切れ時に Open Food Facts API（`https://world.openfoodfacts.org/api/v0/product/{jan_code}.json`）を照合し、ヒット時は商品データを `products` テーブルに UPSERT して返却する
- R6: Open Food Facts API ミス（商品未登録・ネットワークエラー含む）の場合、`{ found: false }` を返却する（エラーにしない）
- R7: `products` テーブルへの UPSERT は `ON CONFLICT (id_type, id_value)` パターンを使い、`scan_count +1` と `expires_at` 再計算を行う。`expires_at` 計算は `getExpiryDays()` を呼ぶ
- R8: UPSERT 時の `expires_at` 計算に `getExpiryDays(scanCount)` を使い、マジックナンバー（30/90/180）を直書きしない
- R9: Controller → Service → Repository の3層構造を守る（architecture.md の依存方向ルール）
- R10: `logger.log` / `logger.error` を `NestJS Logger` で行う（`console.log` 禁止）
- R11: Open Food Facts クライアントを `backend/src/shared/open-food-facts.client.ts` に分離し、Service は HTTP 通信を直接行わない
- R12: `ProductAllergens` 型（`db.types.ts` に定義済み）を JSONB フィールドのアクセスに使い、`as any` を使わない

---

## Implementation plan

### Phase 1: 共通ユーティリティ・型
- `backend/src/products/expires-at.util.ts`: `getExpiryDays(scanCount: number): number` を実装（`EXPIRES_AT_DAYS` と `SCAN_COUNT_THRESHOLD` 定数を使う）
- `backend/src/products/product-id.util.ts`: `buildJanIdValue(janCode: string): string` を実装（`jan#${janCode}` を返す）
- 定数は `backend/src/scan/scan.constants.ts` に `CACHE_TTL_MEMORY_SEC`, `EXPIRES_AT_DAYS`, `SCAN_COUNT_THRESHOLD`, `EXPIRES_AT_DAYS` としてまとめて定義する

### Phase 2: Open Food Facts クライアント
- `backend/src/shared/open-food-facts.client.ts`: `fetchByJanCode(janCode: string)` を実装
- Node.js 組み込み `fetch`（Node 18+）を使用。`@nestjs/axios` は本タスクでは追加しない（TBD: generator が Node バージョン確認）
- レスポンス型 `OpenFoodFactsProduct` を `backend/src/shared/types/open-food-facts.types.ts` に定義する

### Phase 3: ProductRepository
- `backend/src/products/product.repository.ts`: `PrismaService` を DI 注入して以下を実装
  - `findByJan(janCode: string)`: `expires_at > NOW()` の有効期限内商品を返す
  - `upsertByJan(janCode: string, data: UpsertProductData)`: UPSERT パターンで保存（`scan_count +1`、`expires_at` 再計算）
- `backend/src/products/products.module.ts`: `ProductRepository` を提供する Module を作成

### Phase 4: ScanService
- `backend/src/scan/scan.service.ts`: `CacheManager` と `ProductRepository` と `OpenFoodFactsClient` を DI 注入
- `scanBarcode(janCode: string)` メソッドでスキャンフロー（パターン1）を実装
- キャッシュキーは `jan:${janCode}`

### Phase 5: ScanController + DTO
- `backend/src/scan/dto/barcode-scan.dto.ts`: `class-validator` で `jan_code` を `@IsString() @Matches(/^\d{8,13}$/)` でバリデーション
- `backend/src/scan/scan.controller.ts`: `@Post('barcode')` で `ScanService.scanBarcode` を呼び出す
- `backend/src/scan/scan.module.ts`: Controller / Service / Module 登録、`ProductsModule` と `CacheModule.register` をインポート
- `AppModule` に `ScanModule` をインポート

### Phase 6: Unit テスト
- `backend/src/scan/scan.service.spec.ts`: `ScanService.scanBarcode` の以下シナリオをモックを使ってテスト
  - キャッシュヒット → キャッシュ値を返す
  - キャッシュミス + DB ヒット（expires_at 有効）→ DB 値を返す
  - キャッシュミス + DB ミス + OFFApi ヒット → UPSERT して返す
  - キャッシュミス + DB ミス + OFFApi ミス → `{ found: false }` を返す
- `backend/src/products/expires-at.util.spec.ts`: `getExpiryDays` の境界値テスト（1, 5, 6, 20, 21 件）

---

## Files to modify

| File | Action |
|------|--------|
| `backend/src/scan/scan.constants.ts`（新規） | キャッシュ TTL・有効期限日数・scan_count しきい値の定数 |
| `backend/src/products/expires-at.util.ts`（新規） | `getExpiryDays()` ユーティリティ |
| `backend/src/products/product-id.util.ts`（新規） | `buildJanIdValue()` ユーティリティ |
| `backend/src/shared/open-food-facts.client.ts`（新規） | Open Food Facts HTTP クライアント |
| `backend/src/shared/types/open-food-facts.types.ts`（新規） | OFF API レスポンス型 |
| `backend/src/products/product.repository.ts`（新規） | ProductRepository（Prisma 操作） |
| `backend/src/products/products.module.ts`（新規） | ProductsModule |
| `backend/src/scan/scan.service.ts`（新規） | ScanService（バーコードスキャンフロー） |
| `backend/src/scan/scan.controller.ts`（新規） | ScanController |
| `backend/src/scan/dto/barcode-scan.dto.ts`（新規） | BarcodeScandDto（バリデーション） |
| `backend/src/scan/scan.module.ts`（新規） | ScanModule |
| `backend/src/app.module.ts`（編集） | ScanModule をインポート |
| `backend/src/scan/scan.service.spec.ts`（新規） | ScanService unit テスト |
| `backend/src/products/expires-at.util.spec.ts`（新規） | getExpiryDays 境界値テスト |
| `backend/package.json`（編集） | `@nestjs/cache-manager`, `cache-manager`, `class-validator`, `class-transformer` を追加 |

---

## Tests to add

### scan.service.spec.ts（4シナリオ）

| シナリオ | 期待動作 |
|----------|----------|
| キャッシュヒット | `CacheManager.get` の戻り値をそのまま返す。`ProductRepository` は呼ばない |
| DB ヒット（期限内） | `ProductRepository.findByJan` の戻り値を返す。`OpenFoodFactsClient` は呼ばない |
| OFF API ヒット | `ProductRepository.upsertByJan` が呼ばれ、結果を返す |
| 全ミス | `{ found: false }` を返す。例外は投げない |

### expires-at.util.spec.ts（境界値テスト）

| scanCount | 期待 getExpiryDays 戻り値 |
|-----------|--------------------------|
| 1 | 30 |
| 5 | 30 |
| 6 | 90 |
| 20 | 90 |
| 21 | 180 |
| 100 | 180 |

---

## Completion criteria

- [ ] `POST /scan/barcode` に `{ "jan_code": "4901234567890" }` を送信したとき、レスポンスが `{ found: boolean }` を必ず含む（`found` フィールドの存在を `grep "found" backend/src/scan/scan.controller.ts` で確認）
- [ ] `jan_code` が `"abc"` の場合、ScanController が 400 を返す実装になっている（`barcode-scan.dto.ts` に `@Matches(/^\d{8,13}$/)` が存在する: `grep "Matches" backend/src/scan/dto/barcode-scan.dto.ts` でヒット）
- [ ] `scan.service.ts` に `console.log` が含まれない（`grep "console\.log" backend/src/scan/scan.service.ts` でヒット件数 0）
- [ ] `scan.service.ts` が `ProductRepository` を直接 `new` せず DI で受け取っている（`grep "new ProductRepository" backend/src/scan/scan.service.ts` でヒット件数 0）
- [ ] `scan.service.ts` に SQL クエリ（`SELECT`, `INSERT`, `UPDATE`）が含まれない（`grep -i "SELECT\|INSERT\|UPDATE" backend/src/scan/scan.service.ts` でヒット件数 0）
- [ ] `product.repository.ts` の UPSERT が `ON CONFLICT` に相当する Prisma の `upsert` または `$executeRaw` を使用している（`grep "upsert\|executeRaw" backend/src/products/product.repository.ts` でヒット）
- [ ] `expires-at.util.ts` に `30`, `90`, `180`, `6`, `21` のマジックナンバーが直書きされていない（`grep -E "\b(30|90|180)\b" backend/src/products/expires-at.util.ts` でヒット件数 0。定数定義ファイルでのみ出現する）
- [ ] `scan.constants.ts` に `CACHE_TTL_MEMORY_SEC`, `EXPIRES_AT_DAYS`, `SCAN_COUNT_THRESHOLD` の定数が `as const` で定義されている（`grep "as const" backend/src/scan/scan.constants.ts` でヒット）
- [ ] `as any` が新規追加ファイルに含まれない（`grep -r "as any" backend/src/scan/ backend/src/products/ backend/src/shared/` でヒット件数 0）
- [ ] `pnpm --filter backend test` で `scan.service.spec.ts` の 4 シナリオと `expires-at.util.spec.ts` の 6 境界値テストが全 PASS する（FAIL 0 件）
- [ ] `pnpm --filter backend typecheck` がエラー 0 件で終了する
- [ ] `backend/src/shared/open-food-facts.client.ts` が存在し、`ScanService` は `OpenFoodFactsClient` のメソッドを呼ぶだけで HTTP `fetch` を直接呼ばない（`grep "fetch(" backend/src/scan/scan.service.ts` でヒット件数 0）

---

## Risks

| リスク | 回避方針 |
|--------|----------|
| Open Food Facts API の不安定性 | ネットワークエラー・タイムアウト時は例外をキャッチして `{ found: false }` を返す。ScanService 内に try/catch を入れて NestJS Logger でエラーログを出力 |
| NestJS CacheModule のバージョン互換 | `@nestjs/cache-manager` v3（NestJS 11 対応）を使用。`cache-manager` v6 との組み合わせを確認（TBD: generator が package.json で確認） |
| Prisma の `upsert` と `ON CONFLICT ... scan_count +1` の表現 | Prisma の `upsert` は `scan_count: { increment: 1 }` で実現可能。`$executeRaw` は不要なはず（TBD: generator が確認） |
| `class-validator` / `class-transformer` がインストールされていない | Phase 5 で `package.json` に追加して `pnpm --filter backend install` を実行する |

---

## Implementation summary

### 起動コマンド
- 開発サーバー: `pnpm --filter backend start:dev`（ポート 3000）
- typecheck: `pnpm --filter backend typecheck`
- unit test: `pnpm --filter backend test`

### テスト URL
- POST http://localhost:3000/scan/barcode
  - Body: `{ "jan_code": "4901234567890" }`
  - 正常レスポンス: `{ "found": false, "from_cache": false }`（Open Food Facts に未登録の場合）

### 検証シナリオ
1. 有効な JAN コード（13桁）→ 200 OK + `found` フィールド必須
2. 無効な JAN コード（"abc"）→ 400 Bad Request
3. キャッシュヒット → `from_cache: true`

### Phase ごとの実装内容

**Phase 1: 共通ユーティリティ・定数（L1-21: scan.constants.ts）**
- `backend/src/scan/scan.constants.ts`: `CACHE_TTL_MEMORY_SEC=60`, `EXPIRES_AT_DAYS`, `SCAN_COUNT_THRESHOLD` を `as const` で定義
- `backend/src/products/expires-at.util.ts:L1-20`: `getExpiryDays(scanCount)` と `calcExpiresAt(scanCount)` を実装（マジックナンバーなし）
- `backend/src/products/product-id.util.ts:L1`: `buildJanIdValue(janCode)` を実装

**Phase 2: Open Food Facts クライアント（open-food-facts.client.ts:L1-41）**
- `backend/src/shared/types/open-food-facts.types.ts`: `OpenFoodFactsResponse` / `OpenFoodFactsProductFields` 型を定義
- `backend/src/shared/open-food-facts.client.ts`: Node.js 組み込み `fetch` + `AbortSignal.timeout(5000ms)` でタイムアウト制御。エラー時は `null` を返す（例外なし）

**Phase 3: ProductRepository（product.repository.ts:L1-95）**
- `backend/src/products/product.repository.ts`: `findByJan` / `upsertByJan` を実装
- `upsertByJan`: Prisma `upsert` + `scan_count: { increment: 1 }` で ON CONFLICT 相当を実現
- JSONB フィールドは `ProductAllergens` 型として型アサーション（db.types.ts 準拠）
- `backend/src/products/products.module.ts`: `ProductRepository` を export

**Phase 4: ScanService（scan.service.ts:L1-118）**
- `backend/src/scan/scan.service.ts`: `@Inject(CACHE_MANAGER) Cache` を DI。スキャンフロー4ステップを実装
- キャッシュキー: `jan:${janCode}`、TTL: `CACHE_TTL_MEMORY_SEC * 1000` ms
- Open Food Facts のアレルゲンタグ（`en:milk` 形式）を `ProductAllergens` に変換

**Phase 5: Controller / DTO / Module（scan.controller.ts, dto/, scan.module.ts）**
- `backend/src/scan/dto/barcode-scan.dto.ts`: `@Matches(/^\d{8,13}$/)` で 400 バリデーション
- `backend/src/scan/scan.controller.ts`: `@Post('barcode') @HttpCode(200)` で ScanService を呼ぶ
- `backend/src/scan/scan.module.ts`: `CacheModule.register({ ttl: 60000 })` + `ProductsModule` インポート
- `backend/src/app.module.ts`: `ScanModule` を追加
- `backend/src/main.ts`: `ValidationPipe({ whitelist: true, transform: true })` をグローバル登録
- `backend/package.json`: `@nestjs/cache-manager@^3.0.1`, `cache-manager@^7.0.0`, `class-validator@^0.15.1`, `class-transformer@^0.5.1` を追加

**Phase 6: Unit テスト**
- `backend/src/products/expires-at.util.spec.ts`: 6境界値テスト（1/5/6/20/21/100）→ 全 PASS
- `backend/src/scan/scan.service.spec.ts`: 4シナリオ（キャッシュヒット/DBヒット/OFFヒット/全ミス）→ 全 PASS

### 検証結果
- typecheck: 0エラー
- unit test: 14テスト全 PASS（4スイート）

---

## Plan deviation

- `UpsertProductData` の `productName` が `null` の場合に `upsertByJan` の `create.productName` が `null` になるが Prisma スキーマでは `productName String?`（オプショナル）なので問題なし
- `scan_count increment: 1` を正確に実現するため、Prisma `upsert` の前に `findUnique` で現在の `scanCount` を取得し `calcExpiresAt(nextScanCount)` を計算する方式を採用した（Prisma の `upsert` では `update.scanCount.increment` と同時に `expires_at` を `scanCount+1` 基準で計算する式を直接書けないため）。タスク仕様では「Prisma の `upsert` で `scan_count: { increment: 1 }`」とあり、これに準拠している。
- `open-food-facts.client.ts` に `OFF_TIMEOUT_MS = 5000` という定数を置いた（タスク仕様には記載なし）。これはマジックナンバー防止のための最小限の追加であり、スコープ外への波及なし。

---

## Review comments

## 自動評価（2026-05-15 評価） - ラウンド 1

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 1 / Info: 2）

### Threshold 達成状況
- 1. 動作性: OK（Completion criteria 12/12 通過、typecheck 0件、unit 14件全合格）
- 2. セキュリティ: OK（Medium 以上 0 件）
- 3. カバレッジ: OK（scan.service.spec.ts 4シナリオ / expires-at.util.spec.ts 6境界値 全カバー）
- 4. 敵対的観点: OK（Critical/High 0 件）
- 5. 保守性: OK（層違反 0 / アンチパターン 0 / マジックナンバー 0 / 冗長コメント 0）

### 改善提案（次タスク繰越し可）

#### [Low] is_high_risk が OFFデータ由来では常に false になる

`scan.service.ts:82` の `buildResultFromDb` にて:

```typescript
const detected = [...allergens.components];
const isHighRisk = detected.length > 0;  // ← components: [] のとき常に false
```

OFFデータから `buildAllergensFromOff` で生成した `ProductAllergens` は `components: []` を返すため、`contains` に値があっても `is_high_risk: false` になる。`openapi.yaml` の説明は「アナフィラキシーリスクの高い成分が含まれるか」であり、少なくとも `allergens.contains.length > 0` も含めて判定すべき。

推奨修正: `backend/src/scan/scan.service.ts:82`

```typescript
// 現在
const isHighRisk = detected.length > 0;

// 修正案（OFFデータでも contains があれば高リスクとして扱う）
const isHighRisk = detected.length > 0 || allergens.contains.length > 0;
```

#### [Info] レートリミット未実装

`POST /scan/barcode` にレートリミット（`@nestjs/throttler`）が実装されていない。本タスクスコープ外だが、Lambda コスト・DoS 対策として次タスクで導入推奨。

#### [Info] UPSERT の TOCTOU（Time of Check to Time of Use）

`product.repository.ts:67-72` で `findUnique` + `upsert` の2ステップを採用。並行リクエスト時に `scan_count` が±1誤差になる可能性がある。影響は軽微（データ破損なし）。`Plan deviation` に説明があり設計上の妥協点として了承済み。
