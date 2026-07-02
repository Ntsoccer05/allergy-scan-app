# 履歴ページ カード表示統一 設計仕様

## 目標

履歴ページの「自分のスキャン」「みんなのスキャン」「システム」の3タブで、カードの表示形式と詳細パネルの操作感を統一する。

## 現状の問題

| タブ | カードコンポーネント | 詳細表示 |
|---|---|---|
| 自分のスキャン | `page.tsx` にインライン | `HistoryDetailPanel`（スライドパネル） |
| みんなのスキャン | `HistoryCard` | `HistoryDetailModal`（モーダル） |
| システム | `HistoryCard` | `HistoryDetailModal`（モーダル） |

## 変更後のアーキテクチャ

| タブ | カードコンポーネント | 詳細表示 |
|---|---|---|
| 自分のスキャン | `HistoryProductCard` | `HistoryDetailPanel`（編集・削除あり） |
| みんなのスキャン | `HistoryProductCard` | `HistoryDetailPanel readonly`（閲覧のみ） |
| システム | `HistoryProductCard` | `HistoryDetailPanel readonly`（閲覧のみ） |

---

## コンポーネント仕様

### 1. `HistoryProductCard`（新規作成）

**ファイル**: `frontend/src/components/organisms/HistoryProductCard.tsx`

**表示要素（全タブ共通）**:
- サムネイル 56px（クリックで `onLightboxOpen`）
- 商品名
- アレルゲンラベル（`🔴 contains` / `🟡 partial` の色分け表示）
- 店舗リスト（`scans[]` を 1 行ずつ表示。mine は複数行、others/system は 1 行）

**表示要素（mine のみ・Props が渡されたとき）**:
- ✏️ 編集ボタン（`onEdit`）
- 🗑️ 削除ボタン（`onDelete`）
- 楽天リンク（`itemUrl`）
- 選択モード（`isSelectMode` / `isSelected` / `onSelect`）

**表示要素（others のみ）**:
- 期限切れタグ（`isExpired: true` のとき）

**Props 型**:

```typescript
type Scan = {
  id: string
  storeName: string | null
  scannedAt: string
}

type HistoryProductCardProps = {
  productName: string | null
  judgment: 'ng' | 'partial' | 'ok'
  allergens: { contains: string[]; partial: string[] }
  detected: string[]
  thumbnailUrl: string | null
  lightboxSrc: string | null           // サムネイルクリック時の拡大元（ocrImageUrl ?? thumbnailUrl）
  scans: Scan[]
  onDetailClick: (scanId: string) => void
  onLightboxOpen: (url: string) => void
  // mine のみ（省略可）
  onEdit?: () => void
  onDelete?: (scanId: string) => void
  isSelectMode?: boolean
  isSelected?: boolean
  onSelect?: () => void
  itemUrl?: string | null
  // others のみ（省略可）
  isExpired?: boolean
}
```

---

### 2. `HistoryDetailPanel`（変更）

**ファイル**: `frontend/src/components/organisms/HistoryDetailPanel.tsx`

`readonly` prop を追加する。`readonly: true` のとき：
- 編集フォーム（商品名・店舗名・メモ入力）を非表示
- 編集・削除ボタンを非表示
- サムネイル・アレルゲングループ表示・rawText・店舗名・メモ・免責文はそのまま表示

**変更後の Props 型**:

```typescript
type Props = {
  group: HistoryGroup
  selectedScan: ScanEntryLike
  isOpen: boolean
  onClose: () => void
  readonly?: boolean                                              // 追加
  onPatch?: (scanId: string, data: PatchData) => Promise<void>  // optional に変更
  onDelete?: (scanId: string) => void                           // optional に変更
}
```

---

### 3. `page.tsx`（変更）

**削除する状態**:
- `legacyDetailItem` / `handleLegacyDetailOpen` / `handleLegacyDetailClose`（`HistoryDetailModal` 用）

**追加する状態**:
- `othersDetailTarget: HistoryGroup | null` — みんなのスキャン詳細パネル用
- `systemDetailTarget: HistoryGroup | null` — システム詳細パネル用

**追加するユーティリティ関数**（page.tsx 内部）:

```typescript
// OthersProductItem → HistoryGroup
const othersItemToGroup = (item: OthersProductItem): HistoryGroup => ({
  product: {
    id: item.id,
    name: item.product_name,
    allergens: item.allergens,
    thumbnailUrl: item.thumbnail_url,
    itemUrl: null,
  },
  judgment: item.judgment,
  detected: item.detected,
  scans: [{
    id: item.id,
    scannedAt: item.updated_at,
    location: item.store_name ? { store_name: item.store_name, lat: 0, lng: 0 } : null,
    memo: null,
    thumbnailUrl: item.thumbnail_url,
    ocrImageUrl: null,
    rawText: item.raw_text,
  }],
  latestScanAt: item.updated_at,
})

// SystemProductItem → HistoryGroup
const systemItemToGroup = (item: SystemProductItem): HistoryGroup => ({
  product: {
    id: item.id,
    name: item.product_name,
    allergens: {
      contains: item.allergens_contains,
      partial: item.allergens_partial,
      components: [],
    },
    thumbnailUrl: item.thumbnail_url,
    itemUrl: null,
  },
  judgment: item.judgment,
  detected: item.allergens_contains.length > 0 ? item.allergens_contains : item.allergens_partial,
  scans: [{
    id: item.id,
    scannedAt: item.updated_at,
    location: null,
    memo: `JAN: ${item.jan_code}`,
    thumbnailUrl: item.thumbnail_url,
    ocrImageUrl: null,
    rawText: null,
  }],
  latestScanAt: item.updated_at,
})
```

---

## 廃止するファイル

| ファイル | 理由 |
|---|---|
| `frontend/src/components/organisms/HistoryCard.tsx` | `HistoryProductCard` に完全置き換え |
| `frontend/src/components/organisms/HistoryDetailModal.tsx` | `HistoryDetailPanel readonly` に完全置き換え |

---

## 更新予定のドキュメント

- `docs/design/screens.md`（履歴画面のコンポーネント構成の記述を更新）
