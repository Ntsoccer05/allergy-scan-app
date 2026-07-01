# スキャンキュー・楽天API一次読み取り・履歴商品グループ表示 実装計画

> **エージェント向け:** REQUIRED SUB-SKILL: `executing-plans` または `subagent-driven-development` を使ってこの計画をタスクごとに実装すること。ステップはチェックボックス構文（`- [ ]`）で追跡。

**目標:** `docs/specs/2026-06-28-scan-queue-rakuten-history-design.md` に記載の3機能を実装する。①スキャンキュー（並行5件）、②楽天 raw_caption DB 事前投入 + OFF 廃止、③履歴の商品単位グループ表示。

**アーキテクチャ:**
- Backend: NestJS on Lambda。DB スキーマ変更（`products.item_url` 追加・`products.store_name` 削除）→ Prisma マイグレーション → OFF 参照コードを完全削除。履歴 API を `ScanHistory[]` から `HistoryGroup[]` へ変更（GROUP BY product_id クエリ）。
- Frontend: `useScanQueue` Hook を新規作成し、既存 `useScan` から委譲。スライド式タブ UI（`ResultCardQueue.tsx`）と進捗チップ（`ScanJobChip.tsx`）を新規追加。履歴画面は商品カード + 店舗リストのグループ表示に変更。

**技術スタック:** NestJS / Prisma / Next.js / React / TypeScript / SSE / XHR（upload progress）

---

## 実装順序の概要

1. **Task 1**: DB スキーマ変更（`item_url` 追加・`store_name` 削除）
2. **Task 2**: Rakuten ユーティリティ関数 2本
3. **Task 3**: OFF 参照コード削除 + `storeName` クリーンアップ
4. **Task 4**: 楽天インポートスクリプト
5. **Task 5**: 履歴 Repository GROUP BY クエリ
6. **Task 6**: 履歴 Service / Controller 型変更
7. **Task 7**: 履歴フロントエンド型 + API クライアント
8. **Task 8**: 履歴フロントエンド UI（グループ表示 + 楽天リンク）
9. **Task 9**: ResultCard に楽天ボタン追加
10. **Task 10**: `useScanQueue` Hook 新規作成
11. **Task 11**: `ScanJobChip` コンポーネント
12. **Task 12**: `ResultCardQueue` コンポーネント
13. **Task 13**: スキャンページ レイアウト変更
14. **Task 14**: ドキュメント更新・コミット

---

### Task 1: DB スキーマ変更

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_item_url_remove_store_name/migration.sql`

- [ ] **Step 1: schema.prisma を編集する**

`backend/prisma/schema.prisma` の `Product` モデルから `storeName` を削除し、`itemUrl` を追加する:

```prisma
model Product {
  id          String    @id @default(uuid())
  idType      String    @map("id_type")
  idValue     String    @map("id_value")
  productName String?   @map("product_name")
  // storeName 削除: store 情報は scan_histories.location JSONB で管理
  itemUrl     String?   @map("item_url")   // 楽天アフィリエイト URL
  allergens   Json      @default("{}")
  rawText      String?   @map("raw_text")
  thumbnailUrl String?   @map("thumbnail_url")
  scanCount    Int       @default(1) @map("scan_count")
  confidence  String?
  expiresAt   DateTime? @map("expires_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  scanHistories ScanHistory[]

  @@unique([idType, idValue])
  @@map("products")
}
```

- [ ] **Step 2: Prisma マイグレーションを生成・適用する**

```bash
cd backend
pnpm exec prisma migrate dev --name add_item_url_remove_store_name
```

マイグレーション SQL が `ALTER TABLE products ADD COLUMN item_url TEXT` と `ALTER TABLE products DROP COLUMN store_name` を含むことを確認する。

- [ ] **Step 3: Prisma クライアントを再生成する**

```bash
pnpm exec prisma generate
```

- [ ] **Step 4: 型チェックを実行する**

```bash
pnpm --filter backend typecheck
```

Expected: Prisma の `storeName` 参照がある箇所でエラーが出る。次の Task で修正する。

---

### Task 2: Rakuten ユーティリティ関数

**Files:**
- Create: `backend/src/products/rakuten-affiliate.util.ts`
- Create: `backend/src/products/rakuten-affiliate.util.spec.ts`
- Create: `backend/src/products/rakuten-confidence.util.ts`
- Create: `backend/src/products/rakuten-confidence.util.spec.ts`

- [ ] **Step 1: rakuten-affiliate.util.spec.ts を作成する（失敗するテスト）**

```typescript
// backend/src/products/rakuten-affiliate.util.spec.ts
import { buildAffiliateUrl } from './rakuten-affiliate.util'

describe('buildAffiliateUrl', () => {
  const validUrl = 'https://item.rakuten.co.jp/shop/item-1234/'

  it('楽天商品URLをアフィリエイトURLに変換する', () => {
    const result = buildAffiliateUrl(validUrl, 'abc123')
    expect(result).toContain('hb.afl.rakuten.co.jp')
    expect(result).toContain(encodeURIComponent(validUrl))
  })

  it('空のAFFILIATE_IDでも動作する', () => {
    const result = buildAffiliateUrl(validUrl, '')
    expect(result).toContain('hb.afl.rakuten.co.jp')
  })

  it('item.rakuten.co.jp 以外のドメインは null を返す', () => {
    expect(buildAffiliateUrl('https://evil.com/item', 'abc123')).toBeNull()
    expect(buildAffiliateUrl('https://www.rakuten.co.jp/shop/', 'abc123')).toBeNull()
  })

  it('無効なURLは null を返す', () => {
    expect(buildAffiliateUrl('not-a-url', 'abc123')).toBeNull()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm --filter backend test src/products/rakuten-affiliate.util.spec.ts
```

Expected: FAIL（ファイルが存在しないため）

- [ ] **Step 3: rakuten-affiliate.util.ts を実装する**

```typescript
// backend/src/products/rakuten-affiliate.util.ts
const RAKUTEN_ITEM_HOST = 'item.rakuten.co.jp'

export const buildAffiliateUrl = (
  itemUrl: string,
  affiliateId: string,
): string | null => {
  try {
    const parsed = new URL(itemUrl)
    if (parsed.hostname !== RAKUTEN_ITEM_HOST) return null
    return (
      `https://hb.afl.rakuten.co.jp/hgc/${affiliateId}/allergy_scan/` +
      `?pc=${encodeURIComponent(itemUrl)}&m=${encodeURIComponent(itemUrl)}`
    )
  } catch {
    return null
  }
}
```

- [ ] **Step 4: テストがパスすることを確認する**

```bash
pnpm --filter backend test src/products/rakuten-affiliate.util.spec.ts
```

Expected: PASS

- [ ] **Step 5: rakuten-confidence.util.spec.ts を作成する**

```typescript
// backend/src/products/rakuten-confidence.util.spec.ts
import { deriveRakutenConfidence } from './rakuten-confidence.util'

describe('deriveRakutenConfidence', () => {
  it('contains がある場合 high を返す', () => {
    expect(deriveRakutenConfidence({ contains: ['乳'], partial: [], components: [] })).toBe('high')
  })

  it('partial のみある場合 high を返す', () => {
    expect(deriveRakutenConfidence({ contains: [], partial: ['小麦'], components: [] })).toBe('high')
  })

  it('components のみある場合 high を返す', () => {
    expect(deriveRakutenConfidence({ contains: [], partial: [], components: ['バター'] })).toBe('high')
  })

  it('全て空の場合 low を返す', () => {
    expect(deriveRakutenConfidence({ contains: [], partial: [], components: [] })).toBe('low')
  })
})
```

- [ ] **Step 6: rakuten-confidence.util.ts を実装する**

```typescript
// backend/src/products/rakuten-confidence.util.ts
import type { ProductAllergens } from '../shared/types/db.types'

export const deriveRakutenConfidence = (allergens: ProductAllergens): 'high' | 'low' => {
  const hasAnyInfo =
    allergens.contains.length > 0 ||
    allergens.partial.length > 0 ||
    allergens.components.length > 0
  return hasAnyInfo ? 'high' : 'low'
}
```

- [ ] **Step 7: テストがパスすることを確認する**

```bash
pnpm --filter backend test src/products/rakuten-confidence.util.spec.ts
```

Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add backend/src/products/rakuten-affiliate.util.ts backend/src/products/rakuten-affiliate.util.spec.ts backend/src/products/rakuten-confidence.util.ts backend/src/products/rakuten-confidence.util.spec.ts
git commit -m "feat(backend): add rakuten affiliate and confidence utils"
```

---

### Task 3: OFF 参照コード削除 + storeName クリーンアップ

**Files:**
- Modify: `backend/src/products/product.repository.ts`
- Modify: `backend/src/scan/scan.service.ts`

- [ ] **Step 1: product.repository.ts から storeName を削除する**

`UpsertHashProductData` 型から `storeName` を削除:

```typescript
// 変更前
export type UpsertHashProductData = UpsertProductData & {
  storeName?: string | null;
};

// 変更後（storeName を削除）
export type UpsertHashProductData = UpsertProductData
```

`upsertByHash` メソッドの create/update から `storeName` を削除:

```typescript
// create の storeName: data.storeName, を削除
create: {
  idType: 'hash',
  idValue,
  productName: data.productName,
  // storeName 削除
  allergens: data.allergens,
  rawText: data.rawText,
  confidence: data.confidence,
  scanCount: 1,
  expiresAt: calcExpiresAt(1),
},
update: {
  productName: data.productName,
  // storeName 削除
  allergens: data.allergens,
  rawText: data.rawText,
  confidence: data.confidence,
  scanCount: { increment: 1 },
  expiresAt,
},
```

また `ProductRecord` 型にある `confidence` の comment を更新:

```typescript
// 変更前: OFF 由来は null という記述を削除
confidence: string | null;
```

- [ ] **Step 2: scan.service.ts の OFF 関連コメントを削除する**

`scan.service.ts` の `scanBarcode` メソッド内のコメントを更新:

```typescript
// ⚠️ 安全設計: アレルゲン情報が空の jan 商品はヒット扱いにしない。
// OCR 由来・楽天由来の JAN キャッシュは confidence: high のみ配信する —
// 共有キャッシュであり1人の不確実な読み取りが全ユーザーの判定に影響するため
const dbProduct = await this.productRepository.findByJan(janCode);
if (
  dbProduct &&
  !this.hasNoAllergenInfo(dbProduct.allergens) &&
  (dbProduct.confidence === null || dbProduct.confidence === 'high')
) {
```

「全ミス → { found: false }」コメントから OFF 参照を削除:

```typescript
// Step 3: 全ミス（found:false は OCR フォールバックへ）
this.logger.log(`No result found for JAN: ${janCode}`);
return { found: false, from_cache: false };
```

- [ ] **Step 3: 型チェックを実行する**

```bash
pnpm --filter backend typecheck
```

Expected: PASS（storeName 削除後に Prisma が再生成済みのため）

- [ ] **Step 4: テストを実行する**

```bash
pnpm --filter backend test
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add backend/src/products/product.repository.ts backend/src/scan/scan.service.ts
git commit -m "feat(backend): remove OFF references and storeName from Product"
```

---

### Task 4: 楽天インポートスクリプト

**Files:**
- Create: `backend/scripts/import-rakuten-to-db.ts`

> **前提:** `backend/scripts/phase1-jans.json` が存在すること。ファイルは別途配置が必要。存在しない場合はスクリプト実行時にエラーになる（設計上正しい動作）。

- [ ] **Step 1: import-rakuten-to-db.ts を作成する**

```typescript
// backend/scripts/import-rakuten-to-db.ts
/**
 * 楽天スクレイピングデータ（phase1-jans.json）を products テーブルに UPSERT するバッチスクリプト。
 * 使用方法: pnpm --filter backend exec ts-node --project tsconfig.json scripts/import-rakuten-to-db.ts
 *
 * phase1-jans.json の各レコード形式:
 * {
 *   jan_code: string,
 *   product_name: string,
 *   item_url: string,
 *   raw_caption: string,   // 商品説明テキスト（アレルゲン情報を含む可能性あり）
 * }
 */
import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import { buildAffiliateUrl } from '../src/products/rakuten-affiliate.util'
import { deriveRakutenConfidence } from '../src/products/rakuten-confidence.util'
import { calcExpiresAt } from '../src/products/expires-at.util'
import { buildJanIdValue } from '../src/products/product-id.util'
import type { ProductAllergens } from '../src/shared/types/db.types'

const AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID ?? ''
const BATCH_SIZE = 100
const RATE_LIMIT_MS = 100  // バッチ間の待機時間

const PARTIAL_PATTERN = /[（(]一部に(.+?)を含む[）)]/g
const CONTAINS_PATTERN = /[（(](?!一部に)(.+?)を含む[）)]/g

type RawItem = {
  jan_code: string
  product_name: string
  item_url: string
  raw_caption: string
}

const parseAllergens = (rawCaption: string): ProductAllergens => {
  const partial: string[] = []
  const contains: string[] = []

  let match: RegExpExecArray | null
  PARTIAL_PATTERN.lastIndex = 0
  while ((match = PARTIAL_PATTERN.exec(rawCaption)) !== null) {
    const allergens = match[1].split(/[・、,，]/).map((s) => s.trim()).filter(Boolean)
    partial.push(...allergens)
  }

  CONTAINS_PATTERN.lastIndex = 0
  while ((match = CONTAINS_PATTERN.exec(rawCaption)) !== null) {
    const allergens = match[1].split(/[・、,，]/).map((s) => s.trim()).filter(Boolean)
    contains.push(...allergens)
  }

  return {
    contains: [...new Set(contains)],
    partial: [...new Set(partial)],
    components: [],
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const dataPath = path.join(__dirname, 'phase1-jans.json')
  if (!fs.existsSync(dataPath)) {
    console.error(`ERROR: ${dataPath} が見つかりません。ファイルを配置してください。`)
    process.exit(1)
  }

  const items: RawItem[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
  console.log(`読み込み完了: ${items.length} 件`)

  const prisma = new PrismaClient()
  let processed = 0
  let skipped = 0

  try {
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE)

      await Promise.all(
        batch.map(async (item) => {
          if (!item.jan_code || !/^\d{8,14}$/.test(item.jan_code)) {
            skipped++
            return
          }

          const allergens = parseAllergens(item.raw_caption ?? '')
          const confidence = deriveRakutenConfidence(allergens)
          const affiliateUrl = item.item_url
            ? buildAffiliateUrl(item.item_url, AFFILIATE_ID)
            : null
          const idValue = buildJanIdValue(item.jan_code)

          // 既存レコードの scan_count を取得して expires_at を計算する
          const existing = await prisma.product.findUnique({
            where: { idType_idValue: { idType: 'jan', idValue } },
            select: { scanCount: true },
          })
          const nextScanCount = (existing?.scanCount ?? 0) + 1

          await prisma.product.upsert({
            where: { idType_idValue: { idType: 'jan', idValue } },
            create: {
              idType: 'jan',
              idValue,
              productName: item.product_name || null,
              itemUrl: affiliateUrl,
              allergens: allergens as object,
              rawText: item.raw_caption || null,
              confidence,
              scanCount: 1,
              expiresAt: calcExpiresAt(1),
            },
            update: {
              productName: item.product_name || null,
              itemUrl: affiliateUrl,
              allergens: allergens as object,
              rawText: item.raw_caption || null,
              confidence,
              // 既存データがある場合は scan_count を保持し expires_at を更新する
              expiresAt: calcExpiresAt(nextScanCount),
            },
          })
          processed++
        }),
      )

      if (i % 1000 === 0) {
        console.log(`進捗: ${i}/${items.length} (${Math.round(i / items.length * 100)}%)`)
      }

      await sleep(RATE_LIMIT_MS)
    }
  } finally {
    await prisma.$disconnect()
  }

  console.log(`完了: processed=${processed}, skipped=${skipped}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: 型チェックを実行する**

```bash
pnpm --filter backend typecheck
```

Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add backend/scripts/import-rakuten-to-db.ts
git commit -m "feat(backend): add rakuten DB import script"
```

---

### Task 5: 履歴 Repository GROUP BY クエリ

**Files:**
- Modify: `backend/src/history/scan-history.repository.ts`

新しい返却型 `HistoryGroupRecord` を追加し、`findByUser` を GROUP BY クエリに変更する。

- [ ] **Step 1: 型定義を追加する**

`scan-history.repository.ts` の先頭部分に以下の型を追加する:

```typescript
/** GET /history の新レスポンス型（商品単位グループ）。 */
export type ScanRecord = {
  id: string
  scannedAt: Date
  location: ScanHistoryLocation | null
  memo: string | null
}

export type HistoryGroupRecord = {
  productId: string | null
  productName: string | null
  allergens: ProductAllergens
  thumbnailUrl: string | null
  itemUrl: string | null
  latestScanAt: Date
  scans: ScanRecord[]
}
```

`ProductAllergens` を `backend/src/shared/types/db.types` からインポートに追加:

```typescript
import type { ScanHistoryLocation, ProductAllergens } from '../shared/types/db.types'
```

- [ ] **Step 2: findGroupsByUser メソッドを追加する**

`findByUser` の後に以下のメソッドを追加する:

```typescript
/**
 * 商品単位でグループ化した履歴を取得する（GROUP BY product_id）。
 * 判定フィルタはサービス層で re-derive 後に適用するため SQL ではフィルタしない。
 * カーソル: latestScanAt（グループ内の最新スキャン日時）の降順。
 * limit+1 件取得して next_cursor 判定に使う。
 */
async findGroupsByUser(
  userId: string,
  options: { before?: Date; limit: number; q?: string; store?: string },
): Promise<HistoryGroupRecord[]> {
  const { before, limit, q, store } = options

  const beforeFragment = before
    ? Prisma.sql`HAVING (${'group'} = ${'group'} AND MAX(sh.scanned_at) < ${before}::timestamptz)`
    : Prisma.sql`HAVING TRUE`

  const qFragment = q
    ? Prisma.sql`AND p.product_name ILIKE ${'%' + q + '%'}`
    : Prisma.empty

  const storeFragment = store
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM scan_histories sh2
        WHERE sh2.product_id = sh.product_id
          AND sh2.user_id = ${userId}
          AND sh2.location->>'store_name' ILIKE ${'%' + store + '%'}
      )`
    : Prisma.empty

  type GroupRow = {
    product_id: string | null
    product_name: string | null
    allergens: unknown
    thumbnail_url: string | null
    item_url: string | null
    latest_scan_at: Date
    scans: string  // JSON
  }

  const rows = await this.prisma.$queryRaw<GroupRow[]>(Prisma.sql`
    SELECT
      p.id AS product_id,
      p.product_name,
      p.allergens,
      p.thumbnail_url,
      p.item_url,
      MAX(sh.scanned_at) AS latest_scan_at,
      json_agg(
        json_build_object(
          'id', sh.id,
          'scannedAt', sh.scanned_at,
          'location', sh.location,
          'memo', sh.memo
        ) ORDER BY sh.scanned_at DESC
      ) AS scans
    FROM scan_histories sh
    LEFT JOIN products p ON p.id = sh.product_id
    WHERE sh.user_id = ${userId}
    ${qFragment}
    ${storeFragment}
    GROUP BY p.id, p.product_name, p.allergens, p.thumbnail_url, p.item_url
    ${beforeFragment}
    ORDER BY latest_scan_at DESC
    LIMIT ${limit + 1}
  `)

  return rows.map((row) => ({
    productId: row.product_id,
    productName: row.product_name,
    allergens: (row.allergens ?? { contains: [], partial: [], components: [] }) as ProductAllergens,
    thumbnailUrl: row.thumbnail_url,
    itemUrl: row.item_url,
    latestScanAt: row.latest_scan_at,
    scans: (typeof row.scans === 'string' ? JSON.parse(row.scans) : row.scans) as ScanRecord[],
  }))
}
```

**注意:** `HAVING` 句でカーソル比較する。`before` がない場合は `HAVING TRUE`（全件）。

実際の `before` フラグメント修正（`HAVING` と `AND` を両立させる正しい形）:

```typescript
// findGroupsByUser のクエリを以下のように修正する:
const rows = await this.prisma.$queryRaw<GroupRow[]>(Prisma.sql`
  SELECT
    p.id AS product_id,
    p.product_name,
    p.allergens,
    p.thumbnail_url,
    p.item_url,
    MAX(sh.scanned_at) AS latest_scan_at,
    json_agg(
      json_build_object(
        'id', sh.id,
        'scannedAt', sh.scanned_at,
        'location', sh.location,
        'memo', sh.memo
      ) ORDER BY sh.scanned_at DESC
    ) AS scans
  FROM scan_histories sh
  LEFT JOIN products p ON p.id = sh.product_id
  WHERE sh.user_id = ${userId}
  ${qFragment}
  ${storeFragment}
  GROUP BY p.id, p.product_name, p.allergens, p.thumbnail_url, p.item_url
  HAVING (${before !== undefined ? Prisma.sql`MAX(sh.scanned_at) < ${before}::timestamptz` : Prisma.sql`TRUE`})
  ORDER BY latest_scan_at DESC
  LIMIT ${limit + 1}
`)
```

- [ ] **Step 3: 型チェックを実行する**

```bash
pnpm --filter backend typecheck
```

Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add backend/src/history/scan-history.repository.ts
git commit -m "feat(backend): add findGroupsByUser to scan-history repository"
```

---

### Task 6: 履歴 Service / Controller 型変更

**Files:**
- Modify: `backend/src/history/history.service.ts`
- Modify: `backend/src/history/history.controller.ts`

- [ ] **Step 1: HistoryGroup 型を history.service.ts に追加する**

`history.service.ts` の型定義セクションに追加:

```typescript
import type { HistoryGroupRecord, ScanRecord } from './scan-history.repository'
import type { ProductAllergens } from '../shared/types/db.types'

/** GET /history のレスポンス型（商品単位グループ）。 */
export type HistoryGroupItem = {
  product: {
    id: string | null
    name: string | null
    allergens: ProductAllergens
    thumbnailUrl: string | null
    itemUrl: string | null
  }
  judgment: 'ng' | 'partial' | 'ok'
  detected: string[]
  scans: ScanRecord[]
  latestScanAt: string  // ISO8601
}

export type HistoryGroupListResult = {
  items: HistoryGroupItem[]
  next_before: string | null
}
```

既存の `HistoryListResult` は残す（他の箇所が依存している可能性があるため）。

- [ ] **Step 2: getHistory メソッドを GROUP BY 版に変更する**

`history.service.ts` の `getHistory` メソッドを以下のように変更する:

```typescript
async getHistory(
  userId: string,
  query: GetHistoryDto,
): Promise<HistoryGroupListResult> {
  let before: Date | undefined
  if (query.before !== undefined) {
    before = new Date(query.before)
    if (isNaN(before.getTime())) {
      throw new BadRequestException({
        message: '不正なカーソル値です。ISO8601 形式の日付文字列を指定してください',
        code: 'INVALID_CURSOR',
      })
    }
  }

  const judgment = query.judgment ?? 'all'
  this.logger.log(`グループ履歴取得: userId=${userId}, judgment=${judgment}`)

  // limit*3 件フェッチして in-memory フィルタ後に limit 件返す
  // （judgment フィルタは re-derive 後のため SQL に持てない）
  const FETCH_LIMIT = HISTORY_PAGE_LIMIT * 3
  const rawGroups = await this.scanHistoryRepository.findGroupsByUser(userId, {
    before,
    limit: FETCH_LIMIT,
    q: query.q,
    store: query.store,
  })

  const user = await this.usersRepository.findById(userId)
  const allergies: UserAllergies = user?.allergies ?? {}

  // 各グループの allergens から judgment を re-derive する
  const derivedGroups: HistoryGroupItem[] = rawGroups.map((group) => {
    const { judgment: derivedJudgment, detected } = deriveProductJudgment(
      group.allergens,
      allergies,
    )
    return {
      product: {
        id: group.productId,
        name: group.productName,
        allergens: group.allergens,
        thumbnailUrl: group.thumbnailUrl,
        itemUrl: group.itemUrl,
      },
      judgment: derivedJudgment,
      detected,
      scans: group.scans,
      latestScanAt: group.latestScanAt.toISOString(),
    }
  })

  // in-memory で judgment フィルタ
  const filtered =
    judgment === 'all'
      ? derivedGroups
      : derivedGroups.filter((g) => g.judgment === judgment)

  const hasNextPage = filtered.length > HISTORY_PAGE_LIMIT
  const items = hasNextPage ? filtered.slice(0, HISTORY_PAGE_LIMIT) : filtered
  const next_before =
    hasNextPage && items.length > 0 ? items[items.length - 1].latestScanAt : null

  return { items, next_before }
}
```

- [ ] **Step 3: history.controller.ts の返却型を更新する**

```typescript
import type { HistoryGroupListResult, MapLocationsResult } from './history.service'

// getHistory の返却型変更
async getHistory(
  @Req() req: AuthRequest,
  @Query() query: GetHistoryDto,
): Promise<HistoryGroupListResult> {
  return this.historyService.getHistory(req.user.sub, query)
}
```

古い `HistoryListResult` のインポートを削除する。

- [ ] **Step 4: 型チェックを実行する**

```bash
pnpm --filter backend typecheck
```

Expected: PASS

- [ ] **Step 5: テストを実行する**

```bash
pnpm --filter backend test
```

Expected: PASS（既存テストが壊れていないことを確認）

- [ ] **Step 6: コミット**

```bash
git add backend/src/history/history.service.ts backend/src/history/history.controller.ts
git commit -m "feat(backend): change GET /history to HistoryGroup response"
```

---

### Task 7: 履歴フロントエンド型 + API クライアント

**Files:**
- Modify: `frontend/src/app/history/history.types.ts`
- Modify: `frontend/src/lib/api/history.api.ts`
- Modify: `frontend/src/hooks/useHistory.ts`

- [ ] **Step 1: history.types.ts に HistoryGroup 型を追加する**

```typescript
// frontend/src/app/history/history.types.ts に追加

/** 商品単位グループ内の1スキャン。 */
export type ScanEntry = {
  id: string
  scannedAt: string
  location: { store_name: string; lat: number; lng: number } | null
  memo: string | null
}

/** GET /history の新レスポンス型（商品単位グループ）。 */
export type HistoryGroup = {
  product: {
    id: string | null
    name: string | null
    allergens: {
      contains: string[]
      partial: string[]
      components: string[]
    }
    thumbnailUrl: string | null
    itemUrl: string | null
  }
  judgment: 'ng' | 'partial' | 'ok'
  detected: string[]
  scans: ScanEntry[]
  latestScanAt: string
}

/** GET /history の新レスポンス型。 */
export type HistoryGroupListResponse = {
  items: HistoryGroup[]
  next_before: string | null
}
```

- [ ] **Step 2: history.api.ts の getHistory を更新する**

```typescript
// history.api.ts の import に HistoryGroupListResponse を追加
import type {
  HistoryFilter,
  HistoryGroupListResponse,
  PatchHistoryBody,
} from '@/app/history/history.types'

// getHistory の返却型変更
export const getHistory = async (
  params: GetHistoryParams = {},
): Promise<HistoryGroupListResponse> => {
  const query = new URLSearchParams()
  if (params.filter && params.filter !== 'all') {
    query.set('judgment', params.filter)
  }
  if (params.before) {
    query.set('before', params.before)
  }
  if (params.q) {
    query.set('q', params.q)
  }
  if (params.store) {
    query.set('store', params.store)
  }
  const path = `/history${query.toString() ? `?${query.toString()}` : ''}`
  const res = await apiFetch(path)
  return res.json() as Promise<HistoryGroupListResponse>
}
```

- [ ] **Step 3: useHistory.ts を更新する**

```typescript
// useHistory.ts のインポート変更
import type { HistoryFilter, HistoryGroup, HistoryGroupListResponse, PatchHistoryBody } from '@/app/history/history.types'

// 返却型変更
type UseHistoryReturn = {
  items: HistoryGroup[]   // HistoryItem[] → HistoryGroup[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  filter: HistoryFilter
  setFilter: (filter: HistoryFilter) => void
  search: HistorySearch
  setSearch: (search: HistorySearch) => void
  updateHistoryMutation: ReturnType<typeof useMutation<void, Error, { id: string } & PatchHistoryBody>>
  deleteHistoryMutation: ReturnType<typeof useMutation<void, Error, string>>
  bulkDeleteHistoryMutation: ReturnType<typeof useMutation<void, Error, string[]>>
}

// useInfiniteQuery の型パラメータ変更
const {
  data,
  ...
} = useInfiniteQuery<
  HistoryGroupListResponse,
  Error,
  HistoryGroup[],
  [string, HistoryFilter, string, string],
  string | undefined
>({
  // ...
  select: (data) =>
    data.pages.flatMap((page) => page.items),
  getNextPageParam: (lastPage) => lastPage.next_before ?? undefined,
})
```

`items` の型も `HistoryGroup[]` に変更:

```typescript
const items: HistoryGroup[] = data ?? []
```

- [ ] **Step 4: 型チェックを実行する**

```bash
pnpm --filter frontend typecheck
```

Expected: 型エラーがあれば次の Task で UI 変更時に修正する（history/page.tsx が `HistoryItem` を使用しているため）

- [ ] **Step 5: コミット**

```bash
git add frontend/src/app/history/history.types.ts frontend/src/lib/api/history.api.ts frontend/src/hooks/useHistory.ts
git commit -m "feat(frontend): update history types to HistoryGroup"
```

---

### Task 8: 履歴フロントエンド UI（グループ表示 + 楽天リンク）

**Files:**
- Modify: `frontend/src/app/history/page.tsx`
- Modify: `frontend/public/locales/ja/history.json`

- [ ] **Step 1: history.json に新しいキーを追加する**

`frontend/public/locales/ja/history.json` に追加:

```json
{
  "group": {
    "latestScan": "最終スキャン",
    "scanCount": "{{count}}件のスキャン",
    "rakutenLink": "楽天で見る →"
  }
}
```

- [ ] **Step 2: history/page.tsx を更新する**

`page.tsx` の `items` 参照箇所を `HistoryGroup` 型に合わせてリファクタリングする。

「自分のスキャン」タブの表示部分を以下のように変更する（グループカード + 店舗リスト）。
`page.tsx` の `HistoryItem` 依存箇所を全て `HistoryGroup` に置き換える:

```tsx
// インポート変更
import type { HistoryGroup, HistoryFilter, PatchHistoryBody } from './history.types'

// 編集モーダルは最初のスキャン（scans[0]）の ID を使う
// グループカード表示コンポーネント（既存の items.map 箇所を置き換え）
{items.map((group) => {
  const firstScan = group.scans[0]
  const emoji = group.judgment === 'ng' ? '🔴' : group.judgment === 'partial' ? '🟡' : '✅'
  return (
    <div
      key={`${group.product.id}-${group.latestScanAt}`}
      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
    >
      {/* 商品ヘッダー */}
      <div className="flex items-start gap-3 p-3">
        {group.product.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={group.product.thumbnailUrl}
            alt=""
            className="h-14 w-14 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="h-14 w-14 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-2xl">
            🍱
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-900 truncate">
            {group.product.name ?? t('unnamed')}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {emoji} {group.detected.length > 0
              ? group.detected.join(' · ')
              : t('filter.ok')}
          </p>
        </div>
      </div>

      {/* 店舗リスト */}
      <div className="border-t border-gray-50">
        {group.scans.map((scan) => (
          <div
            key={scan.id}
            className="flex items-center gap-2 px-3 py-2 text-xs text-gray-600 border-b border-gray-50 last:border-0"
          >
            <span className="text-gray-400">📍</span>
            <span className="flex-1 truncate">
              {scan.location?.store_name ?? t('location.unknown')}
            </span>
            <time className="text-gray-400 shrink-0">
              {new Date(scan.scannedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
            </time>
          </div>
        ))}
      </div>

      {/* フッター: 楽天リンク + 編集ボタン */}
      {(group.product.itemUrl || group.product.id) && (
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
          {group.product.itemUrl ? (
            <a
              href={group.product.itemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-red-600 font-medium hover:underline"
            >
              {t('group.rakutenLink')}
            </a>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => {
              // 最初のスキャンを編集対象にする
              setEditingItem({
                id: firstScan.id,
                productName: group.product.name,
                storeName: firstScan.location?.store_name ?? null,
                memo: firstScan.memo,
                isPublic: false,
                thumbnailUrl: group.product.thumbnailUrl,
              })
            }}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {t('edit')}
          </button>
        </div>
      )}
    </div>
  )
})}
```

**注意:** 編集モーダル (`editingItem`) の型とステート定義も `HistoryGroup` ベースに合わせる。`HistoryItem` 型への依存を解消する。

- [ ] **Step 3: 型チェックを実行する**

```bash
pnpm --filter frontend typecheck
```

Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add frontend/src/app/history/page.tsx frontend/public/locales/ja/history.json
git commit -m "feat(frontend): history grouped display by product"
```

---

### Task 9: ResultCard に楽天ボタン追加

**Files:**
- Modify: `frontend/src/components/organisms/ResultCard.tsx`
- Modify: `frontend/src/app/scan/scan.types.ts`（`BarcodeScanResponse` に `item_url` 追加）
- Modify: `frontend/public/locales/ja/scan.json`

- [ ] **Step 1: scan.types.ts に item_url を追加する**

```typescript
export type BarcodeScanResponse = {
  found: boolean
  product_name?: string | null
  allergens?: ProductAllergens | null
  judgment?: JudgmentShort | null
  detected?: string[] | null
  risk_level?: 'high' | 'medium' | 'low' | 'ignore' | null
  from_cache: boolean
  raw_text?: string | null
  item_url?: string | null  // 楽天アフィリエイト URL（楽天 DB 由来の場合のみ）
}
```

また `OcrScanResponse` にも追加（OCR 経由 JAN キャッシュ保存後に返す場合を考慮）:

```typescript
export type OcrScanResponse = {
  // ...既存フィールド
  product_name?: string | null
  item_url?: string | null  // 楽天 URL（JAN キャッシュヒット時のみ）
}
```

- [ ] **Step 2: scan.json に楽天キーを追加する**

`frontend/public/locales/ja/scan.json` に追加:

```json
{
  "result": {
    "rakutenBuy": "楽天で購入 →"
  }
}
```

- [ ] **Step 3: ResultCard.tsx に楽天ボタンを追加する**

ResultCard.tsx の `result` prop から `item_url` を取得して表示する箇所を追加:

```tsx
// ResultCard.tsx 内の適切な箇所（免責文の上あたり）に追加
{itemUrl && (
  <a
    href={itemUrl}
    target="_blank"
    rel="noopener noreferrer"
    className="block w-full text-center py-2 px-4 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
  >
    {t('result.rakutenBuy')}
  </a>
)}
```

`itemUrl` は `result.type === 'barcode'` の場合 `result.data.item_url`、`result.type === 'ocr'` の場合 `result.data.item_url` から取得する。

- [ ] **Step 4: バックエンドの BarcodeScanResult に item_url を追加する**

`backend/src/scan/scan.service.ts` の `BarcodeScanResult` 型に `item_url` を追加:

```typescript
export type BarcodeScanResult = {
  found: boolean
  product_name?: string | null
  allergens?: ProductAllergens | null
  judgment?: JudgmentShort | null
  detected?: string[]
  risk_level?: string
  from_cache: boolean
  raw_text?: string | null
  item_url?: string | null  // 楽天アフィリエイト URL
}
```

`buildResultFromDb` や `scanBarcode` の返却時に `item_url` を含める（`dbProduct.itemUrl`）。

- [ ] **Step 5: 型チェックを実行する**

```bash
pnpm -r typecheck
```

Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add frontend/src/components/organisms/ResultCard.tsx frontend/src/app/scan/scan.types.ts frontend/public/locales/ja/scan.json backend/src/scan/scan.service.ts
git commit -m "feat: add rakuten affiliate button to scan result and barcode response"
```

---

### Task 10: useScanQueue Hook 新規作成

**Files:**
- Create: `frontend/src/hooks/useScanQueue.ts`

- [ ] **Step 1: useScanQueue.ts を作成する**

```typescript
// frontend/src/hooks/useScanQueue.ts
'use client'

import { useCallback, useRef, useState } from 'react'
import type { OcrApiResponse } from '@/lib/api/scan.api'
import { getPresignedUrl, postBarcode } from '@/lib/api/scan.api'
import { apiFetch } from '@/lib/api/api-client'
import { detectBarcodeFromImageData } from '@/lib/barcode-detect'  // 既存の ZXing ラッパーを使う
import { OCR_MAX_DIMENSION, OCR_JPEG_QUALITY } from '@/app/scan/scan.constants'
import { preprocessFrame } from '@/lib/image-preprocess'

export type ScanJobState = 'uploading' | 'analyzing' | 'done' | 'error'

export type ScanJob = {
  id: string
  state: ScanJobState
  progress: number            // 0〜100
  capturedImageUrl: string    // blob URL（プレビュー用）
  capturedAt: Date
  result?: OcrApiResponse
  error?: string
}

const MAX_CONCURRENT_JOBS = 5

export const useScanQueue = () => {
  const [jobs, setJobs] = useState<ScanJob[]>([])
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())

  const updateJob = useCallback((id: string, updates: Partial<ScanJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...updates } : j)))
  }, [])

  const addJob = useCallback(
    async (imageBlob: Blob, capturedImageUrl: string): Promise<void> => {
      const jobId = crypto.randomUUID()
      const job: ScanJob = {
        id: jobId,
        state: 'uploading',
        progress: 0,
        capturedImageUrl,
        capturedAt: new Date(),
      }
      setJobs((prev) => [...prev, job])

      const abortController = new AbortController()
      abortControllersRef.current.set(jobId, abortController)

      try {
        // Step 1: Presigned URL 取得
        const { url, s3_key } = await getPresignedUrl()

        // Step 2: XHR で S3 アップロード（進捗取得のため fetch ではなく XHR を使う）
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('PUT', url)
          xhr.setRequestHeader('Content-Type', imageBlob.type || 'image/jpeg')

          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 50)
              updateJob(jobId, { progress: percent })
            }
          })

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve()
            else reject(new Error(`S3 upload failed: ${xhr.status}`))
          })
          xhr.addEventListener('error', () => reject(new Error('S3 upload network error')))
          abortController.signal.addEventListener('abort', () => xhr.abort())
          xhr.send(imageBlob)
        })

        updateJob(jobId, { state: 'analyzing', progress: 50 })

        // Step 3: SSE で OCR 解析（進捗は 50〜100%）
        const res = await apiFetch('/scan/ocr-stream', {
          method: 'POST',
          body: JSON.stringify({ s3_key }),
          headers: { Accept: 'text/event-stream' },
        })

        if (!res.ok) {
          throw new Error(`OCR stream error: ${res.status}`)
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error('No response body')

        let result: OcrApiResponse | null = null
        const decoder = new TextDecoder()
        let buffer = ''
        let analyzeProgress = 50

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const event = JSON.parse(data) as {
                type: string
                data?: OcrApiResponse
                text?: string
              }
              if (event.type === 'raw_text') {
                analyzeProgress = Math.min(90, analyzeProgress + 10)
                updateJob(jobId, { progress: analyzeProgress })
              } else if (event.type === 'result' && event.data) {
                result = event.data
                updateJob(jobId, { progress: 100 })
              } else if (event.type === 'error') {
                throw new Error(event.data as unknown as string)
              }
            } catch {
              // JSON parse error → skip
            }
          }
        }

        if (!result) throw new Error('No result from OCR stream')

        updateJob(jobId, { state: 'done', result, progress: 100 })
      } catch (err) {
        if (abortController.signal.aborted) return
        updateJob(jobId, {
          state: 'error',
          error: err instanceof Error ? err.message : 'unknown error',
        })
      } finally {
        abortControllersRef.current.delete(jobId)
      }
    },
    [updateJob],
  )

  const dismissJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id))
    abortControllersRef.current.get(id)?.abort()
    abortControllersRef.current.delete(id)
  }, [])

  const activeJobs = jobs.filter((j) => j.state !== 'done' && j.state !== 'error')
  const doneJobs = jobs.filter((j) => j.state === 'done' || j.state === 'error')
  const isAtCapacity = activeJobs.length >= MAX_CONCURRENT_JOBS

  return {
    jobs,
    activeJobs,
    doneJobs,
    addJob,
    dismissJob,
    isAtCapacity,
    MAX_CONCURRENT_JOBS,
  }
}
```

- [ ] **Step 2: 型チェックを実行する**

```bash
pnpm --filter frontend typecheck
```

Expected: PASS（`detectBarcodeFromImageData` や `preprocessFrame` がエクスポートされていれば）

> **注意:** `preprocessFrame` / `detectBarcodeFromImageData` の import パスは既存の実装に合わせること。`useScanQueue` ではバーコード検出は行わない（バーコード検出は `useScan` → `useBarcode` の責務）。

- [ ] **Step 3: コミット**

```bash
git add frontend/src/hooks/useScanQueue.ts
git commit -m "feat(frontend): add useScanQueue hook for parallel scan jobs"
```

---

### Task 11: ScanJobChip コンポーネント

**Files:**
- Create: `frontend/src/components/molecules/ScanJobChip.tsx`
- Modify: `frontend/public/locales/ja/scan.json`

- [ ] **Step 1: scan.json に進捗チップのキーを追加する**

```json
{
  "queue": {
    "uploading": "⬆️ 送信中",
    "analyzing": "🔄 解析中",
    "done": "✅ 完了",
    "error": "❌ エラー"
  }
}
```

- [ ] **Step 2: ScanJobChip.tsx を作成する**

```tsx
// frontend/src/components/molecules/ScanJobChip.tsx
'use client'

import { useTranslations } from 'next-intl'
import type { ScanJob } from '@/hooks/useScanQueue'

type Props = {
  job: ScanJob
  isActive: boolean
  onClick: () => void
}

export const ScanJobChip = ({ job, isActive, onClick }: Props) => {
  const t = useTranslations('scan')
  const stateLabel =
    job.state === 'uploading' ? t('queue.uploading') :
    job.state === 'analyzing' ? t('queue.analyzing') :
    job.state === 'done' ? t('queue.done') :
    t('queue.error')

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-shrink-0 rounded-xl px-3 py-2 text-xs font-medium text-white backdrop-blur-sm transition-all
        ${isActive ? 'bg-white/30 ring-2 ring-white' : 'bg-black/40'}
        ${job.state === 'error' ? 'bg-red-500/70' : ''}`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span>{stateLabel}</span>
      </div>
      {/* 進捗バー */}
      {(job.state === 'uploading' || job.state === 'analyzing') && (
        <div className="h-1 w-20 rounded-full bg-white/30 overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-300"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      )}
      {(job.state === 'uploading' || job.state === 'analyzing') && (
        <div className="text-white/80 mt-0.5">{job.progress}%</div>
      )}
    </button>
  )
}
```

- [ ] **Step 3: 型チェックを実行する**

```bash
pnpm --filter frontend typecheck
```

Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add frontend/src/components/molecules/ScanJobChip.tsx frontend/public/locales/ja/scan.json
git commit -m "feat(frontend): add ScanJobChip progress component"
```

---

### Task 12: ResultCardQueue コンポーネント

**Files:**
- Create: `frontend/src/components/organisms/ResultCardQueue.tsx`
- Modify: `frontend/public/locales/ja/scan.json`

- [ ] **Step 1: scan.json にタブキーを追加する**

```json
{
  "queue": {
    "tabLabel": "結果{{n}}",
    "dismiss": "閉じる"
  }
}
```

- [ ] **Step 2: ResultCardQueue.tsx を作成する**

```tsx
// frontend/src/components/organisms/ResultCardQueue.tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ScanJob } from '@/hooks/useScanQueue'
import { ResultCard } from './ResultCard'

type Props = {
  doneJobs: ScanJob[]
  allJobs: ScanJob[]
  onDismiss: (id: string) => void
  onReset: () => void
  geolocation: { lat: number; lng: number } | null
  onFetchPlaceCandidates: () => Promise<unknown>
  onRegisterLocation: (storeName: string, placeId?: string, address?: string) => void
  onPatchHistory: (data: { product_name?: string | null; store_name?: string | null; memo?: string | null; thumbnail_url?: string | null }) => void
}

export const ResultCardQueue = ({
  doneJobs,
  allJobs,
  onDismiss,
  onReset,
  geolocation,
  onFetchPlaceCandidates,
  onRegisterLocation,
  onPatchHistory,
}: Props) => {
  const t = useTranslations('scan')
  const [activeTabId, setActiveTabId] = useState<string | null>(
    doneJobs.length > 0 ? doneJobs[0].id : null,
  )

  if (doneJobs.length === 0) return null

  const activeJob = doneJobs.find((j) => j.id === activeTabId) ?? doneJobs[0]

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 animate-in slide-in-from-bottom-4 duration-300">
      {/* タブバー */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none">
        {allJobs.map((job, index) => {
          const isDone = job.state === 'done' || job.state === 'error'
          const isActive = job.id === activeTabId

          return (
            <button
              key={job.id}
              type="button"
              disabled={!isDone}
              onClick={() => setActiveTabId(job.id)}
              className={`relative flex-shrink-0 rounded-xl overflow-hidden transition-all
                ${isActive ? 'ring-2 ring-white' : ''}
                ${!isDone ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              aria-label={t('queue.tabLabel', { n: index + 1 })}
            >
              {isDone && job.capturedImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={job.capturedImageUrl}
                  alt=""
                  className="h-10 w-10 object-cover"
                />
              ) : (
                <div className="h-10 w-10 bg-gray-800/70 flex items-center justify-center">
                  <span className="text-lg animate-spin">🔄</span>
                </div>
              )}
              {isActive && (
                <div className="absolute bottom-0 inset-x-0 h-0.5 bg-white" />
              )}
            </button>
          )
        })}
      </div>

      {/* アクティブな結果カード */}
      {activeJob?.result && (
        <div className="relative">
          <ResultCard
            result={{ type: 'ocr', data: activeJob.result }}
            onReset={onReset}
            onDiscard={() => onDismiss(activeJob.id)}
            geolocation={geolocation}
            onFetchPlaceCandidates={onFetchPlaceCandidates as Parameters<typeof ResultCard>[0]['onFetchPlaceCandidates']}
            onRegisterLocation={onRegisterLocation}
            onPatchHistory={onPatchHistory}
            onRetakeThumbnail={() => {}}
            thumbnailUrl={null}
          />
        </div>
      )}
      {activeJob?.state === 'error' && (
        <div className="bg-white rounded-t-2xl px-6 py-8 text-center">
          <p className="text-red-600 text-sm mb-4">{activeJob.error}</p>
          <button
            type="button"
            onClick={() => onDismiss(activeJob.id)}
            className="text-sm text-gray-500 underline"
          >
            {t('queue.dismiss')}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 型チェックを実行する**

```bash
pnpm --filter frontend typecheck
```

Expected: PASS（`ResultCard` の props 型に合わせること）

- [ ] **Step 4: コミット**

```bash
git add frontend/src/components/organisms/ResultCardQueue.tsx frontend/public/locales/ja/scan.json
git commit -m "feat(frontend): add ResultCardQueue slide tab component"
```

---

### Task 13: スキャンページ レイアウト変更

**Files:**
- Modify: `frontend/src/app/scan/page.tsx`
- Modify: `frontend/src/hooks/useScan.ts`（addJob 委譲の追加）

- [ ] **Step 1: useScan.ts に useScanQueue との連携を追加する**

`useScan.ts` の `runOcrFlow` を `useScanQueue.addJob` に委譲する形に変更する。
`useScan` の返却型に `scanQueue` 関連プロパティを追加:

```typescript
// useScan.ts に追加するインポート
import { useScanQueue } from './useScanQueue'
import type { ScanJob } from './useScanQueue'

// useScan Hook 内に useScanQueue を追加
const scanQueue = useScanQueue()

// handleCapture の流れ変更:
// 撮影後は即座に addJob を呼び、カメラは idle に戻す（result state に遷移しない）
const handleCapture = useCallback(() => {
  if (isProcessingRef.current || stateRef.current === 'processing') return
  if (scanQueue.isAtCapacity) return  // 上限時はタップ無効

  const imageData = captureFrame()
  if (!imageData) return

  // blob URL 生成（プレビュー用）
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.putImageData(imageData, 0, 0)
  canvas.toBlob((blob) => {
    if (!blob) return
    const capturedImageUrl = URL.createObjectURL(blob)
    void scanQueue.addJob(blob, capturedImageUrl)
  }, 'image/jpeg', OCR_JPEG_QUALITY)
}, [captureFrame, scanQueue, OCR_JPEG_QUALITY])
```

**注意:** 既存の `result` state フローは互換性のために残すが、新規撮影は `useScanQueue` 経由になる。`result` state は `uploadAndScanImage`（ファイルアップロード）では引き続き使用する。

返却型に `scanQueue` を追加:

```typescript
type UseScanReturn = {
  // ...既存
  scanQueue: ReturnType<typeof useScanQueue>
}
```

- [ ] **Step 2: scan/page.tsx を更新する**

カメラ画面（idle 状態）のレイアウトを変更して進捗チップと ResultCardQueue を統合する:

```tsx
// scan/page.tsx の idle/processing 状態レイアウト変更
import { ScanJobChip } from '@/components/molecules/ScanJobChip'
import { ResultCardQueue } from '@/components/organisms/ResultCardQueue'

// ...

const { scanQueue, ...rest } = useScan()
const { jobs, activeJobs, doneJobs, addJob, dismissJob, isAtCapacity } = scanQueue

// カメラ画面（idle / processing / error）
return (
  <>
    <div className="relative flex h-[calc(100dvh-4rem)] flex-col lg:h-screen">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-cover"
        aria-label={t('camera.videoLabel')}
      />

      <div className="absolute inset-0 flex flex-col justify-between p-4">
        {/* 上部: スキャン使用量 + カメラ切り替え */}
        <div className="flex items-center justify-between">
          {scanUsage !== null && (
            <ScanLimitBadge used={scanUsage.used} limit={scanUsage.limit} />
          )}
          <button onClick={toggleFacingMode} aria-label={t('camera.switchCamera')}
            className="rounded-full bg-black/40 p-2 text-white lg:hidden">
            🔄
          </button>
        </div>

        {/* 中段: 進捗チップ（processing 中のジョブがある時のみ表示） */}
        {activeJobs.length > 0 && (
          <div className="flex gap-2 overflow-x-auto py-2 scrollbar-none">
            {activeJobs.map((job) => (
              <ScanJobChip
                key={job.id}
                job={job}
                isActive={false}
                onClick={() => {}}
              />
            ))}
          </div>
        )}

        {/* 下部: 注意文 + 撮影ボタン */}
        <div className="flex flex-col items-center gap-3 pb-4">
          <p className="rounded-lg bg-black/50 px-3 py-1.5 text-center text-xs text-white backdrop-blur-sm">
            {t('caution')}
          </p>
          <div className="flex items-center gap-6">
            <button
              onClick={handleCapture}
              disabled={isAtCapacity}
              aria-label={t('capture')}
              className="flex flex-col items-center gap-1 rounded-2xl bg-black/40 px-4 py-3 text-white backdrop-blur-sm transition-opacity disabled:opacity-50"
            >
              <span className="text-2xl">📷</span>
              <span className="text-xs font-medium">{t('camera.cameraButton')}</span>
            </button>
            {/* ファイルアップロードは既存のまま */}
            <label ...>...</label>
          </div>
        </div>
      </div>

      {/* done ジョブがある時はスライドイン表示 */}
      {doneJobs.length > 0 && (
        <ResultCardQueue
          doneJobs={doneJobs}
          allJobs={jobs}
          onDismiss={dismissJob}
          onReset={() => { reset(); void startScan() }}
          geolocation={geolocation}
          onFetchPlaceCandidates={fetchPlaceCandidates}
          onRegisterLocation={registerLocation}
          onPatchHistory={onPatchHistory}
        />
      )}
    </div>
  </>
)
```

- [ ] **Step 3: 型チェックを実行する**

```bash
pnpm -r typecheck
```

Expected: PASS

- [ ] **Step 4: テストを実行する**

```bash
pnpm -r test
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add frontend/src/app/scan/page.tsx frontend/src/hooks/useScan.ts
git commit -m "feat(frontend): integrate scan queue into scan page"
```

---

### Task 14: ドキュメント更新・最終コミット

**Files:**
- Modify: `docs/design/legal.md`
- Modify: `docs/design/api.md`（GET /history レスポンス型変更）

- [ ] **Step 1: legal.md にアフィリエイト開示文を追記する**

`docs/design/legal.md` に以下を追加:

```markdown
## 楽天アフィリエイトプログラム

商品リンクには楽天アフィリエイトプログラムを使用しており、
リンク経由で購入が完了した場合に当社が報酬を受け取ることがあります。
```

- [ ] **Step 2: docs/design/api.md の GET /history セクションを更新する**

`GET /history` の返却型を `HistoryGroup[]` に変更した旨を記載する。

- [ ] **Step 3: 最終型チェック + テストを実行する**

```bash
pnpm -r typecheck
pnpm -r test
```

Expected: PASS

- [ ] **Step 4: 最終コミット**

```bash
git add docs/design/legal.md docs/design/api.md
git commit -m "docs: update legal.md for rakuten affiliate, api.md for HistoryGroup"
```

---

## セルフレビュー

### 仕様カバレッジ確認

| 仕様要件 | 対応 Task |
|---|---|
| スキャンキュー最大5件同時 | Task 10 (`MAX_CONCURRENT_JOBS = 5`) |
| XHR upload progress (0〜50%) | Task 10 (`useScanQueue.addJob`) |
| SSE analyze progress (50〜100%) | Task 10 (SSE reader) |
| 進捗チップ横スクロール | Task 11 (`ScanJobChip`) |
| スライド式タブ（done 時スライドイン） | Task 12 (`ResultCardQueue`) |
| 撮影ボタン上限時グレーアウト | Task 13 (`disabled={isAtCapacity}`) |
| OFF 廃止・コード削除 | Task 3 |
| `products.item_url` 追加 | Task 1 |
| `products.store_name` 削除 | Task 1 + Task 3 |
| 楽天 import スクリプト | Task 4 |
| アフィリエイトURL生成・ドメイン検証 | Task 2 |
| confidence 導出ロジック | Task 2 |
| JAN キャッシュ配信: high のみ | Task 3（既存ロジック確認済み） |
| 履歴 GROUP BY product_id | Task 5 |
| HistoryGroup 型 API | Task 6 + 7 |
| 履歴グループ UI | Task 8 |
| 楽天ボタン（スキャン結果） | Task 9 |
| 楽天リンク（履歴） | Task 8 |
| アフィリエイト開示文（legal.md） | Task 14 |
| phase1-jans.json が存在しない場合のエラー | Task 4 (`process.exit(1)`) |

### 既知の制約事項

1. **judgment フィルタの精度**: Task 6 で in-memory フィルタを採用。`limit*3` フェッチで補正するが、全件が特定 judgment でない場合にページが空になる可能性がある。MVP では許容。
2. **phase1-jans.json**: リポジトリに含まれない。実行前に `backend/scripts/` に配置が必要。
3. **useScanQueue の barcode 検出**: スキャンキュー版ではバーコード検出を省略している。バーコード → OCR フォールバックが必要な場合は `useScan.ts` の旧フローを参照。
4. **ResultCardQueue と useScan の history_id**: ResultCardQueue から `onPatchHistory` を呼ぶ場合、`history_id` が SSE 結果に含まれる必要がある（`OcrApiResponse.history_id`）。すでに型定義に存在している。
