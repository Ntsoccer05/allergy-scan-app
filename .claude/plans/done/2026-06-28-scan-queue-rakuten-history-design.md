# 設計仕様: スキャンキュー・楽天一次読み取り・履歴商品グループ表示

**作成日**: 2026-06-28  
**対象ブランチ**: feat/security-review（設計のみ。実装は別ブランチ）  
**ステータス**: 承認済み（ブレインストーミング完了）

---

## 1. スキャンキュー（並行読み取り）

### 概要

スキャン処理中（API待ち）でもカメラに戻って次の商品を撮影できるようにする。処理結果はスライド式タブで確認する。

### 状態モデル

```typescript
type ScanJobState = 'uploading' | 'analyzing' | 'done' | 'error'

type ScanJob = {
  id: string                  // crypto.randomUUID()
  state: ScanJobState
  progress: number            // 0〜100（進捗バー用）
  capturedImageUrl: string    // プレビュー用 blob URL
  capturedAt: Date
  result?: OcrResponse
  error?: string
}
```

### Hook 構成

```
useScanQueue（新規）
├── jobs: ScanJob[]                // 全ジョブ（uploading / analyzing / done / error）
├── activeResults: ScanJob[]       // done になったカード（タブ表示対象）
├── addJob(imageBlob: Blob): void  // 撮影 → キュー追加
├── dismissResult(id: string): void // カード確認済み → 除去
└── MAX_CONCURRENT_JOBS = 5

useCamera（既存・変更なし）
└── カメラ制御のみ

useScan（既存・責務縮小）
└── useScanQueue + useCamera を束ねる統合 Hook
```

### 処理フェーズ

| state | 処理内容 | 進捗の取得方法 |
|---|---|---|
| `uploading` | S3 Presigned URL へ PUT | XHR の upload イベントでバイト進捗取得（0〜50%） |
| `analyzing` | `POST /scan/ocr-stream`（SSE） | SSEイベント受信中（50〜100%） |
| `done` | 結果をタブに積む | — |
| `error` | エラー表示 | — |

### 画面レイアウト

```
┌─────────────────────────────┐
│                             │
│      📷 カメラ映像            │  ← 常時 active。撮影ボタンは常押せる
│                             │
├─────────────────────────────┤
│ ジョブ進捗チップ（横スクロール）  │
│ ┌──────────┐ ┌──────────┐  │
│ │⬆️ 送信中  │ │🔄 解析中 │  │  ← 各ジョブのミニ進捗チップ
│ │███░░ 60% │ │██░░░ 40% │  │
│ └──────────┘ └──────────┘  │
├─────────────────────────────┤
│        [📷 撮影ボタン]       │
└─────────────────────────────┘
```

### 結果タブUI（done が1件以上のとき下からスライドイン）

```
┌─────────────────────────────┐
│ [① テキスト] [28px②●] [28px③] │  ← スライド式タブ
│  ──────────                 │     ①: アクティブ（テキスト+下線）
│                             │     ②: 未確認（赤バッジ●）
│  🔴 卵  🟡 大豆             │     ③: 処理中はグレー+スピナー（タップ不可）
│  チキン南蛮弁当              │
│                             │
│  [原材料を確認する▼]         │
│  ⚠️ 購入前にラベルを確認     │
└─────────────────────────────┘
```

| タブ状態 | サイズ | 表示内容 |
|---|---|---|
| アクティブ | テキスト「結果①」+ 下線 | 番号のみ（コンテンツエリア最大化）|
| 非アクティブ・done（確認済み） | 28×28px サムネイル | 画像のみ |
| 非アクティブ・done（未確認） | 28×28px サムネイル | 右上に赤バッジ● |
| 非アクティブ・analyzing | 28×28px グレー | 🔄 スピナー（タップ不可） |

タブは横スクロール。5件すべて done の場合でも横スワイプでアクセスできる。アクティブタブは常に左端に自動スクロール。

### 同時処理上限

- 最大 5 件同時処理
- 上限に達した場合は撮影ボタンをグレーアウト（ジョブ数が 5 未満になると自動解除）

### 実装対象ファイル

| ファイル | 変更内容 |
|---|---|
| `frontend/src/hooks/useScanQueue.ts` | 新規作成（ジョブキュー管理） |
| `frontend/src/hooks/useScan.ts` | useScanQueue への委譲に変更 |
| `frontend/src/components/molecules/ScanJobChip.tsx` | 進捗チップ（新規） |
| `frontend/src/components/organisms/ResultCardQueue.tsx` | スライド式タブ+結果カード（新規） |
| `frontend/src/app/scan/page.tsx` | レイアウト変更 |

---

## 2. 楽天API一次読み取り（OFF廃止）

### 概要

Open Food Facts API を廃止し、楽天スクレイピングデータ（`phase1-jans.json`）を DB に事前投入することでバーコードスキャンの高速化・日本商品カバレッジ向上を図る。スキャン時の外部API呼び出しはなくす。

### バーコードスキャンフロー（改訂）

```
バーコードスキャン
  ↓
NestJS メモリキャッシュ（60s）    → ヒット: ~0ms
  ↓ ミス
DB 確認（楽天データ投入済み）      → ヒット: ~10-20ms
  ↓ ミス（未収録・海外商品等）
found: false → OCR 直接フォールバック → ~3-8秒
```

Open Food Facts の呼び出しは完全に削除。コメント残骸も除去する。

### raw_caption 解析方針（バッチ処理）

`phase1-jans.json`（50,083件）の `raw_caption` を以下の順で解析する。

**Step 1: 正規表現（一括表示パターン抽出）**

```typescript
// 「（一部に〜を含む）」「（〜を含む）」のパターンを抽出
const PARTIAL_PATTERN = /[（(]一部に(.+?)を含む[）)]/g
const CONTAINS_PATTERN = /[（(](.+?)を含む[）)]/g
```

→ `allergens.partial` / `allergens.contains` に格納

**Step 2: Gemini バッチ（原材料全文の構造化）**

raw_caption 内の原材料欄テキストを Gemini に渡し、`allergens.components[]` を構造化する。
バッチ処理のため Gemini 無料枠スロットリング（15回/分）を考慮した間隔制御を入れる。

### confidence 値

| データ由来 | confidence |
|---|---|
| OCR（Gemini 直接解析） | `high` |
| 楽天 raw_caption 由来 | `medium` |
| OFF 由来（削除） | —（廃止）|

confidence は **テキストの解析可否**のみで判断する。`raw_caption` は官製テキストであり OCR 読み取り精度という概念は存在しない。「含む」か「一部に含む」かはアレルゲンの検出種別（`allergens.contains` vs `allergens.partial`）で表現し、confidence には影響させない。

```typescript
// backend/src/products/rakuten-confidence.util.ts（新規）
export const deriveConfidence = (allergens: ProductAllergens): Confidence => {
  // アレルゲン情報が何らかパースできた → high（官製テキスト由来のため）
  const hasAnyInfo =
    allergens.contains.length > 0 ||
    allergens.partial.length > 0 ||
    allergens.components.length > 0
  if (hasAnyInfo) return 'high'
  // アレルゲン情報が一切パースできなかった → low（JAN キャッシュ配信不可）
  return 'low'
}
```

| raw_caption の内容 | confidence | JAN キャッシュ配信 |
|---|---|---|
| 「〜を含む」が記載あり | `high` | ✅ 全ユーザーに配信 |
| 「一部に〜を含む」のみ記載 | `high` | ✅ 全ユーザーに配信 |
| アレルゲン情報が一切なし | `low` | ❌ 配信しない |

「含む」vs「一部に含む」の区別は `allergens.contains` / `allergens.partial` フィールドで表現する。confidence はあくまで「情報の取得精度」であり「アレルギーの強度」ではない。

スキャン結果画面の「⚠️ ラベルの実物も必ずご確認ください」は confidence に関わらず常時表示する。

### 楽天アフィリエイトURL

```typescript
// backend/src/scan/scan.constants.ts
export const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID ?? ''
export const RAKUTEN_ITEM_HOST = 'item.rakuten.co.jp'

// backend/src/products/rakuten-affiliate.util.ts（新規）
export const buildAffiliateUrl = (itemUrl: string): string | null => {
  try {
    const parsed = new URL(itemUrl)
    if (parsed.hostname !== RAKUTEN_ITEM_HOST) return null  // ドメイン検証必須
    return (
      `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFFILIATE_ID}/allergy_scan/` +
      `?pc=${encodeURIComponent(itemUrl)}&m=${encodeURIComponent(itemUrl)}`
    )
  } catch {
    return null
  }
}
```

- `item_url` はインポート時と URL 返却時の **2箇所** でドメイン検証する
- 変換済みアフィリエイト URL を `products.item_url` カラムとして DB に保存する

### DBスキーマ変更

```prisma
model Product {
  // 追加
  itemUrl    String?  @map("item_url")   // 楽天アフィリエイトURL

  // 削除（scan_histories.location に移管済みのため）
  // storeName  String?  @map("store_name")  ← 後述の履歴設計で削除
}
```

### UI表示（「楽天で購入 →」ボタン）

| 画面 | 表示条件 | 表示内容 |
|---|---|---|
| スキャン結果 | `item_url` が存在するとき | 「楽天で購入 →」ボタン |
| 履歴 | `item_url` が存在するとき | 「楽天で見る →」リンク |

### プライバシーポリシー対応（必須）

```
追記内容:
「商品リンクには楽天アフィリエイトプログラムを使用しており、
 リンク経由で購入が完了した場合に当社が報酬を受け取ることがあります。」
```

### 削除対象

| ファイル | 対応 |
|---|---|
| `backend/src/shared/open-food-facts.client.ts` | 削除済み（git status 確認済み） |
| `backend/src/shared/types/open-food-facts.types.ts` | 削除済み（git status 確認済み） |
| `backend/src/scan/scan.service.ts` | OFF 参照コメントを削除 |
| `backend/src/products/product.repository.ts` | OFF 参照を削除 |

### 実装対象ファイル

| ファイル | 変更内容 |
|---|---|
| `backend/scripts/import-rakuten-to-db.ts` | 新規作成（phase1-jans.json → DB UPSERT バッチ）|
| `backend/src/products/rakuten-affiliate.util.ts` | 新規作成（アフィリエイトURL生成）|
| `backend/prisma/schema.prisma` | `item_url` カラム追加 |
| `backend/src/scan/scan.service.ts` | OFFフロー削除・コメント除去 |
| `frontend/src/components/organisms/ResultCard.tsx` | 「楽天で購入」ボタン追加 |
| `frontend/src/app/history/page.tsx` | 「楽天で見る」リンク追加 |
| `docs/design/legal.md` | アフィリエイト開示文追記 |

---

## 3. 履歴：同一商品・異なる場所のグループ表示

### 概要

同一商品を複数店舗でスキャンした場合、履歴画面では商品を1枚のカードにまとめ、その下に店舗一覧を表示する（商品単位グループ化）。

### DBスキーマ変更

```prisma
model Product {
  // 削除: JANコード商品は店舗に属さないため
  // storeName  String?  @map("store_name")
}
```

店舗情報は `scan_histories.location` JSONB（`{ store_name, lat, lng }`）で管理する。新テーブルは不要。

### APIレスポンス変更

```typescript
// 現行: スキャンイベントの時系列リスト
// GET /history → ScanHistory[]

// 新: 商品単位グループ（latestScanAt 降順）
type HistoryGroup = {
  product: {
    id: string
    name: string | null
    allergens: ProductAllergens
    thumbnailUrl: string | null
    itemUrl: string | null        // 楽天アフィリエイトURL
  }
  judgment: 'ng' | 'partial' | 'ok'
  scans: {
    id: string
    scannedAt: Date
    location: { store_name: string; lat: number; lng: number } | null
    memo: string | null
  }[]
  latestScanAt: Date              // カーソルページネーション用
}

// GET /history → HistoryGroup[]
```

### カーソルページネーション

グループの並び順は `latestScanAt`（グループ内で最も新しいスキャン日時）の降順。

```sql
SELECT
  p.id,
  p.product_name,
  p.allergens,
  p.thumbnail_url,
  p.item_url,
  MAX(sh.scanned_at) AS latest_scan_at,
  json_agg(
    json_build_object(
      'id', sh.id,
      'scanned_at', sh.scanned_at,
      'location', sh.location,
      'memo', sh.memo
    ) ORDER BY sh.scanned_at DESC
  ) AS scans
FROM scan_histories sh
LEFT JOIN products p ON p.id = sh.product_id
WHERE sh.user_id = $1
GROUP BY p.id, p.product_name, p.allergens, p.thumbnail_url, p.item_url
HAVING ($cursor::timestamptz IS NULL OR MAX(sh.scanned_at) < $cursor)
ORDER BY latest_scan_at DESC
LIMIT 20
```

### 画面レイアウト

```
┌─────────────────────────────┐
│ 🕐 スキャン履歴              │
│ [全て][NG][注意][OK]         │
│                             │
│ ┌─────────────────────────┐ │
│ │ 🖼️ キャラメルコーン      │ │
│ │ 🔴 卵・乳                │ │
│ │ ─────────────────────── │ │
│ │ 📍 セブン渋谷店   6/28  │ │
│ │ 📍 イオン新宿店   6/25  │ │
│ │ 📍 ファミマ六本木 6/20  │ │
│ │              [楽天で見る]│ │  ← item_url あり時のみ
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ 🖼️ じゃがりこ           │ │
│ │ ✅ 該当なし              │ │
│ │ ─────────────────────── │ │
│ │ 📍 ローソン渋谷店 6/27  │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

### 惣菜（hash商品）の扱い

label_hash は「商品名 + 店舗名 + 原材料先頭50文字」のSHA-256。
異なる店舗の惣菜は別ハッシュ = 別 product → 自然にグループ化されない（正しい挙動）。

### 実装対象ファイル

| ファイル | 変更内容 |
|---|---|
| `backend/prisma/schema.prisma` | `products.store_name` 削除 |
| `backend/src/history/history.repository.ts` | GROUP BY product_id クエリに変更 |
| `backend/src/history/history.service.ts` | HistoryGroup 型に変更 |
| `frontend/src/app/history/history.types.ts` | HistoryGroup 型定義追加 |
| `frontend/src/app/history/page.tsx` | 商品カード + 店舗リスト表示に変更 |

---

## 更新予定のドキュメント（実装完了後）

| ドキュメント | 更新内容 |
|---|---|
| `docs/design/scan-ux.md` | スキャンキューフロー・タブUI追記 |
| `docs/design/api.md` | `GET /history` レスポンス型変更・`POST /scan/barcode` フロー変更 |
| `docs/design/database.md` | `products.store_name` 削除・`products.item_url` 追加 |
| `docs/design/screens.md` | 履歴画面グループ表示・楽天ボタン追記 |
| `docs/design/legal.md` | 楽天アフィリエイト開示文追記 |
| `CLAUDE.md` | APIエンドポイント一覧の `GET /history` レスポンス更新 |
| `.claude/rules/architecture.md` | キャッシュ confidence 条件更新（medium まで配信）|
