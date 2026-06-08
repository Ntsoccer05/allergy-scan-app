# 確立済みパターン（実装コーディングガイド）

## バックエンド（NestJS）

### パターン1: バーコードスキャンフロー

```
POST /scan/barcode { jan_code }
    ↓
1. NestJS メモリキャッシュ確認（TTL: 60秒）
    ↓ キャッシュミス
2. DB の expires_at 確認（有効期限内なら即返却）
    ↓ 期限切れ or 未登録
3. Open Food Facts API 照合
    ↓ ミス
4. { found: false } を返却（クライアントが OCR に自動切り替え）
```

### パターン2: OCRスキャンフロー

```
GET /scan/presigned-url → S3 URL を発行
クライアントが S3 に直接 PUT（Lambda 6MB 制限回避）
POST /scan/ocr { s3_key }
    ↓
1. S3 から画像取得
2. ユーザーの有効アレルギー取得
3. allergen_components から成分リスト取得（exclude 型を除外）
4. Gemini Flash API に送信（プロンプト動的生成）
5. incomplete: true → 即 400 返却
6. confidence: low → 422 返却（再スキャン誘導）
7. products テーブルに UPSERT（scan_count +1、expires_at 再計算）
8. scan_histories に記録
9. クライアントに結果返却
```

### パターン3: UPSERT パターン（products テーブル）

```sql
INSERT INTO products (id_type, id_value, allergens, scan_count, expires_at, ...)
VALUES ($1, $2, $3, 1, $4, ...)
ON CONFLICT (id_type, id_value)
DO UPDATE SET
  allergens   = EXCLUDED.allergens,
  scan_count  = products.scan_count + 1,
  expires_at  = <再計算>,
  updated_at  = NOW()
```

常にこのパターンで書く。`findFirst` してから `update` する2ステップは競合状態が生じるため禁止。

---

### パターン4: カーソルベースページネーション（履歴）

```sql
SELECT * FROM scan_histories
WHERE user_id = $1
  AND ($2 = 'all' OR judgment = $2)
  AND ($3::timestamp IS NULL OR scanned_at < $3)
ORDER BY scanned_at DESC
LIMIT 20
```

オフセットページネーションは使わない。スキャン履歴は常時追加されるため、ページ境界がずれる。

---

## フロントエンド（Next.js）

### パターン5: スキャン状態機械

```typescript
type ScanState =
  | 'idle'        // カメラ起動・待機（撮影ボタン有効）
  | 'preview'     // 撮影プレビュー表示（撮り直し / 確定）
  | 'processing'  // API 送信中（S3 アップロード → OCR / バーコード）
  | 'result'      // 結果表示中
  | 'error'       // エラー
```

状態遷移は必ず `useScan` Hook 内の reducer で管理する。コンポーネントが `setScanState` を直接呼ばない。

### パターン6: タップ撮影フロー（手動キャプチャ）

```typescript
// useScan Hook の撮影フロー（タップ撮影・プレビュー確認あり）
// 1. idle   : カメラ映像ライブ表示 + 撮影ボタン（📷）
// 2. タップ → captureFrame() でフレームを JPEG キャプチャ
// 3. preview: 撮影画像表示 + 「撮り直す」「確定する」ボタン
// 4. 確定   → S3 Presigned URL へ PUT → POST /scan/ocr or /scan/barcode
// 5. result : 結果カードがスライドイン
// 6. エラー → idle に戻す（api_error はユーザー操作が必要なため自動リトライしない）

const captureFrame = (): void => {
  const canvas = document.createElement('canvas')
  canvas.width = videoRef.current!.videoWidth
  canvas.height = videoRef.current!.videoHeight
  canvas.getContext('2d')!.drawImage(videoRef.current!, 0, 0)
  setCapturedImage(canvas.toDataURL('image/jpeg', 0.9))
  dispatch({ type: 'PREVIEW' })
}
```

### パターン7: クライアントキャッシュ（TTL: 2 時間）

```typescript
// src/lib/cache.ts
const cache = new Map<string, { data: unknown; expiresAt: number }>()

export const getCached = <T>(key: string): T | null => {
  const entry = cache.get(key)
  if (!entry || Date.now() > entry.expiresAt) return null
  return entry.data as T
}

export const setCached = <T>(key: string, data: T): void => {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_CLIENT_MS })
}
```

スキャン結果のキャッシュキーは `jan:${janCode}` または `hash:${labelHash}`。

### パターン8: アレルギー設定の表示順

設定画面のアレルギー一覧は `GET /allergens` で取得した `display_order` 順で表示する。フロントエンドでハードコードしない。

```
mandatory（特定原材料 9品目・表示義務あり）→ 上部に表示
recommended（準ずるもの 20品目・表示推奨）→ 「もっと見る」で展開
```

### パターン9: 店舗名のフォールバック

```
GPS 座標取得
    ↓
Google Places API 検索（半径 100m）
    ↓ ヒット → 店舗名を表示
    ↓ ミス → Google Geocoding API で逆ジオコーディング → 住所を表示
    ↓ GPS 未取得 → 「📍 場所不明」
```

---

## DB パターン

### パターン10: 商品 ID の2階層管理

| ID種別 | 対象 | キー例 |
|---|---|---|
| `jan` | メーカー製加工食品 | `jan#4901234567890` |
| `hash` | 惣菜・バーコードなし商品 | `hash#a3f8c2d1...` |

label_hash の生成: 「商品名 + 店舗名 + 原材料の先頭50文字」を SHA-256 でハッシュ化。

### パターン11: expires_at の計算

| scan_count | 有効期限 | 定数名 |
|---|---|---|
| 1〜5 件 | 30 日 | `EXPIRES_AT_DAYS.LOW_SCAN_COUNT` |
| 6〜20 件 | 90 日 | `EXPIRES_AT_DAYS.MID_SCAN_COUNT` |
| 21 件〜 | 180 日 | `EXPIRES_AT_DAYS.HIGH_SCAN_COUNT` |

計算は `src/products/expires-at.util.ts` の `getExpiryDays()` を使う。

### パターン12: allergen の judgment_type 別判定表現

`allergens.judgment_type` によって表示する絵文字・表現が変わる。混同禁止。

| judgment_type | category | 含む表現 | 一部含む表現 | なし表現 |
|---|---|---|---|---|
| `allergy` | mandatory / recommended | 🔴 NG | 🟡 注意 | ✅ なし |
| `caution` | addiction / skin | ⚠️ 含む | — | ✅ なし |

カテゴリー別トグルロジック:
- `allergy` カテゴリー: ON にした瞬間 → `partialAlert` も自動 ON、OFF にした瞬間 → `partialAlert` も自動 OFF
- `caution` カテゴリー: 単純な ON/OFF のみ（`partialAlert` なし）

集約点: `src/lib/allergen.utils.ts` の `toggleAllergen`（allergy 用）/ `toggleCaution`（caution 用）。

---

### パターン13: OCR レスポンスの detection_type 別処理

Gemini からの OCR レスポンスはアレルギーごとの `results[]` 配列と UI ハイライト用の `highlights[]` 配列を持つ。

```typescript
// ✅ detection_type ごとの UI 表示分岐
const displayMap = {
  contains:    '🔴 NG',          // 原材料として直接含む
  partial:     '🟡 注意',        // 一括表示パターン（一部に〜を含む）
  may_contain: '🟠 注意喚起',    // 製造ラインのコンタミ（原材料ではない）
} as const

// ✅ highlights を使って raw_text 内の検出テキストをハイライト
result.highlights.forEach(({ text, judgment }) => {
  // judgment: 'ng' → 🔴, 'partial' → 🟡, 'may_contain' → 🟠
})
```

**重要**: `may_contain` は製造ライン汚染の注意喚起であり、原材料への直接混入（`contains`）と区別して表示すること。NG 判定（🔴）にしない。

### パターン14: allergen_components のフィールド構造

`allergen_components` テーブルの主要フィールド:

```typescript
type AllergenComponent = {
  id: string
  allergen_name: string         // allergens.name への FK
  canonical_name: string        // 代表表記（プロンプト表示用）
  aliases: string[]             // 表記ゆれ・英語表記（JSONB）
  component_type: 'direct' | 'derivative' | 'processed' | 'compound' | 'additive' | 'contains_label' | 'exclude'
  detection_type: 'contains' | 'partial' | 'may_contain'
  risk_level: 'high' | 'medium' | 'low' | 'ignore'
  note: string | null
}
```

プロンプト生成時は `canonical_name` を使い、`exclude` 型を必ず除外する。`risk_level === 'high'` の成分は `⚠️risk_level:high` をプロンプトに明示する。

---

### パターン15: Prisma `$queryRaw` による複雑クエリ

LEFT JOIN + IS NULL フィルタなど、Prisma の型安全クエリビルダーで表現しにくい複雑な SQL は `$queryRaw` と `Prisma.sql` タグ付きテンプレートリテラルを使う。

```typescript
// ✅ Prisma.sql タグ付きテンプレート（型安全・SQLインジェクション防止）
import { Prisma } from '@prisma/client'

const rows = await this.prisma.$queryRaw<ProductRow[]>(Prisma.sql`
  SELECT p.*
  FROM products p
  LEFT JOIN scan_histories sh
    ON sh.product_id = p.id AND sh.user_id = ${userId}
  WHERE sh.id IS NULL
    AND p.expires_at > NOW()
    AND (${cursor}::timestamptz IS NULL OR p.updated_at < ${cursor}::timestamptz)
  ORDER BY p.updated_at DESC
  LIMIT ${limit}
`)

// ❌ $queryRawUnsafe は文字列連結でSQLインジェクションのリスクがあるため禁止
// await this.prisma.$queryRawUnsafe(`SELECT * FROM products WHERE ...${userId}`)
```

- cursor は `Date` 型で受け取り、`?cursor=<ISO文字列>` としてクライアントに返す
- `$queryRaw` の戻り値は `unknown[]` になるため、必ず型パラメータ `<RowType[]>` を指定する
