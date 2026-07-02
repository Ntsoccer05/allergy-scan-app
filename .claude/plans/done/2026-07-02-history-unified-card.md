# 履歴ページ カード表示統一 実装計画

> **エージェント向け:** REQUIRED SUB-SKILL: `executing-plans` または `subagent-driven-development` を使ってこの計画をタスクごとに実装すること。ステップはチェックボックス構文（`- [ ]`）で追跡。

**目標:** 履歴ページの3タブ（自分・みんな・システム）のカードと詳細パネルを `HistoryProductCard` + `HistoryDetailPanel` に統一する。

**アーキテクチャ:** mine タブのインライン表示を `HistoryProductCard` として抽出し、others/system タブにも適用する。`HistoryDetailPanel` に `readonly` prop を追加して閲覧専用モードを実現する。廃止コンポーネント（`HistoryCard`・`HistoryDetailModal`）は最後に削除する。

**技術スタック:** Next.js (App Router), TypeScript, React, next-intl

**仕様書:** `docs/specs/2026-07-02-history-unified-card.md`

---

### Task 1: HistoryProductCard 新規作成

**Files:**
- Create: `frontend/src/components/organisms/HistoryProductCard.tsx`

- [ ] **Step 1: ファイルを作成する**

`frontend/src/components/organisms/HistoryProductCard.tsx` を以下の内容で作成する:

```tsx
'use client'

import { useTranslations } from 'next-intl'

type Scan = {
  id: string
  storeName: string | null
  scannedAt: string
}

export type HistoryProductCardProps = {
  productName: string | null
  judgment: 'ng' | 'partial' | 'ok'
  allergens: { contains: string[]; partial: string[] }
  detected: string[]
  thumbnailUrl: string | null
  lightboxSrc: string | null
  scans: Scan[]
  onDetailClick: (scanId: string) => void
  onLightboxOpen: (url: string) => void
  onEdit?: () => void
  onDelete?: (scanId: string) => void
  isSelectMode?: boolean
  isSelected?: boolean
  onSelect?: () => void
  itemUrl?: string | null
  isExpired?: boolean
}

export const HistoryProductCard = ({
  productName,
  judgment,
  allergens,
  detected,
  thumbnailUrl,
  lightboxSrc,
  scans,
  onDetailClick,
  onLightboxOpen,
  onEdit,
  onDelete,
  isSelectMode,
  isSelected,
  onSelect,
  itemUrl,
  isExpired,
}: HistoryProductCardProps) => {
  const t = useTranslations('history')
  const firstScan = scans[0]
  if (!firstScan) return null

  const emoji = judgment === 'ng' ? '🔴' : judgment === 'partial' ? '🟡' : '✅'
  const ngItems = detected.filter((a) => allergens.contains.includes(a))
  const partialItems = detected.filter((a) => allergens.partial.includes(a))
  const otherItems = detected.filter(
    (a) => !allergens.contains.includes(a) && !allergens.partial.includes(a),
  )
  const allergenLabel =
    detected.length > 0
      ? [
          ngItems.length > 0 ? `🔴 ${ngItems.join(' · ')}` : null,
          partialItems.length > 0 ? `🟡 ${partialItems.join(' · ')}` : null,
          otherItems.length > 0 ? `${emoji} ${otherItems.join(' · ')}` : null,
        ]
          .filter(Boolean)
          .join('  ')
      : null

  return (
    <li
      className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-colors ${
        isSelectMode && isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-100'
      }`}
    >
      {/* 選択モードのチェックボックス */}
      {isSelectMode && (
        <div
          className="flex items-center gap-3 px-3 pt-3 cursor-pointer"
          onClick={() => onSelect?.()}
        >
          <input
            type="checkbox"
            readOnly
            checked={isSelected ?? false}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 pointer-events-none"
          />
          <span className="text-sm text-gray-600">{productName ?? t('unnamed')}</span>
        </div>
      )}

      {/* 商品ヘッダー（通常モードのみ） */}
      {!isSelectMode && (
        <>
          {isExpired && (
            <p className="text-xs text-amber-600 px-3 pt-2">{t('expiredTag')}</p>
          )}
          <div
            className="flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => onDetailClick(firstScan.id)}
          >
            {thumbnailUrl ? (
              <button
                type="button"
                aria-label={t('detail.thumbnailAriaLabel')}
                className="shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  if (lightboxSrc) onLightboxOpen(lightboxSrc)
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl}
                  alt=""
                  className="h-14 w-14 rounded-lg object-cover cursor-pointer"
                />
              </button>
            ) : (
              <div className="h-14 w-14 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-2xl">
                🍱
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-900 truncate">
                {productName ?? t('unnamed')}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                {allergenLabel ?? `${emoji} ${t('filter.ok')}`}
              </p>
            </div>

            {/* 編集・削除ボタン（mine のみ） */}
            {(onEdit || onDelete) && (
              <div className="flex items-center gap-0.5 shrink-0">
                {onEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit()
                    }}
                    aria-label={t('detail.editAriaLabel')}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    ✏️
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(firstScan.id)
                    }}
                    aria-label={t('detail.deleteAriaLabel')}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    🗑️
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 店舗リスト */}
          <div className="border-t border-gray-50">
            {scans.map((scan) => (
              <button
                key={scan.id}
                type="button"
                onClick={() => onDetailClick(scan.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-left"
              >
                <span className="text-gray-400">📍</span>
                <span className="flex-1 truncate">
                  {scan.storeName ?? t('location.unknown')}
                </span>
                <time className="text-gray-400 shrink-0">
                  {new Date(scan.scannedAt).toLocaleDateString('ja-JP', {
                    month: 'numeric',
                    day: 'numeric',
                  })}
                </time>
              </button>
            ))}
          </div>

          {/* 楽天リンク（mine のみ） */}
          {itemUrl && (
            <div className="px-3 py-2 bg-gray-50">
              <a
                href={itemUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-red-600 font-medium hover:underline"
              >
                {t('group.rakutenLink')}
              </a>
            </div>
          )}
        </>
      )}
    </li>
  )
}
```

- [ ] **Step 2: 型チェックをパスすることを確認する**

```
pnpm --filter frontend typecheck
```

Expected: エラーなし（または既存のエラーのみ）

- [ ] **Step 3: コミット**

```bash
git add frontend/src/components/organisms/HistoryProductCard.tsx
git commit -m "feat: add HistoryProductCard unified card component"
```

---

### Task 2: HistoryDetailPanel に readonly prop を追加

**Files:**
- Modify: `frontend/src/components/organisms/HistoryDetailPanel.tsx`

- [ ] **Step 1: Props 型と関数シグネチャを変更する**

`HistoryDetailPanel.tsx` の Props 型（25〜32行目）を以下に変更する:

```typescript
type Props = {
  group: HistoryGroup
  selectedScan: ScanEntryLike
  isOpen: boolean
  onClose: () => void
  readonly?: boolean
  onPatch?: (scanId: string, data: PatchData) => Promise<void>
  onDelete?: (scanId: string) => void
}
```

関数シグネチャ（85〜92行目）も更新する:

```typescript
export const HistoryDetailPanel = ({
  group,
  selectedScan,
  isOpen,
  onClose,
  readonly = false,
  onPatch,
  onDelete,
}: Props) => {
```

- [ ] **Step 2: handleSave / handleDeleteClick を optional 対応にする**

`handleSave`（123〜135行目）と `handleDeleteClick`（137〜143行目）を以下に置き換える:

```typescript
const handleSave = async (): Promise<void> => {
  if (!onPatch) return
  setIsSaving(true)
  try {
    await onPatch(selectedScan.id, {
      product_name: productName || null,
      store_name: storeName || null,
      memo: memo || null,
    })
    setIsEditing(false)
  } finally {
    setIsSaving(false)
  }
}

const handleDeleteClick = (): void => {
  if (!onDelete) return
  const confirmed = window.confirm(t('deleteConfirm'))
  if (!confirmed) return
  onDelete(selectedScan.id)
  onClose()
}
```

- [ ] **Step 3: 編集モード条件を readonly 対応にする**

`isEditing ? ( ... ) : ( ... )` のブロック（249〜317行目）を以下に置き換える:

```tsx
{/* 編集モード（readonly でないときのみ表示） */}
{isEditing && !readonly ? (
  <div className="space-y-3">
    <div>
      <label className="block text-xs text-gray-500 mb-1">
        {t('detail.productName')}
      </label>
      <input
        value={productName}
        onChange={(e) => setProductName(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
      />
    </div>
    <div>
      <label className="block text-xs text-gray-500 mb-1">
        {t('detail.storeName')}
      </label>
      <input
        value={storeName}
        onChange={(e) => setStoreName(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
      />
    </div>
    <div>
      <label className="block text-xs text-gray-500 mb-1">
        {t('detail.memo')}
      </label>
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 resize-none"
      />
    </div>
    <div className="flex gap-3 pt-1">
      <button
        type="button"
        onClick={() => setIsEditing(false)}
        className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600"
      >
        {t('detail.cancel')}
      </button>
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={isSaving}
        className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {isSaving ? '...' : t('detail.save')}
      </button>
    </div>
  </div>
) : (
  /* 表示モード */
  <div className="space-y-2 text-sm text-gray-600">
    <div className="flex items-center gap-2">
      <span>📍</span>
      <span>{selectedScan.location?.store_name ?? t('location.unknown')}</span>
    </div>
    {selectedScan.memo && (
      <div className="flex items-start gap-2">
        <span>📝</span>
        <span>{selectedScan.memo}</span>
      </div>
    )}
    <p className="text-xs text-gray-400">
      {new Date(selectedScan.scannedAt).toLocaleString('ja-JP')}
    </p>
  </div>
)}
```

- [ ] **Step 4: 編集・削除ボタンを readonly 時に非表示にする**

「編集・削除ボタン（表示モード時のみ）」のブロック（347〜365行目）を以下に置き換える:

```tsx
{/* 編集・削除ボタン（通常モードかつ readonly でないときのみ） */}
{!isEditing && !readonly && (
  <div className="flex gap-3 pt-1">
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700"
    >
      {t('detail.edit')}
    </button>
    <button
      type="button"
      onClick={handleDeleteClick}
      className="flex-1 py-2.5 border border-red-200 rounded-lg text-sm text-red-600"
    >
      {t('detail.delete')}
    </button>
  </div>
)}
```

- [ ] **Step 5: 型チェックをパスすることを確認する**

```
pnpm --filter frontend typecheck
```

Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add frontend/src/components/organisms/HistoryDetailPanel.tsx
git commit -m "feat: add readonly mode to HistoryDetailPanel"
```

---

### Task 3: page.tsx の mine タブを HistoryProductCard に置き換え

**Files:**
- Modify: `frontend/src/app/history/page.tsx`

- [ ] **Step 1: HistoryProductCard を import する**

`page.tsx` の先頭 import セクションに追加する（既存の `HistoryCard` import は残しておく）:

```typescript
import { HistoryProductCard } from '@/components/organisms/HistoryProductCard'
```

- [ ] **Step 2: mine タブの `<ul>` 内の `<li>` を HistoryProductCard に置き換える**

`activeTab === 'mine'` ブロック内、`<ul className="grid ...">` の中身（472〜623行目）を以下に置き換える:

```tsx
<ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
  {displayedMyItems.map((group) => {
    const firstScan = group.scans[0]
    if (!firstScan) return null
    const firstScanId = firstScan.id
    const isSelected = selectedGroupKeys.has(firstScanId)
    const displayThumbnail = firstScan.thumbnailUrl ?? group.product.thumbnailUrl
    const lightboxSrc = firstScan.ocrImageUrl ?? displayThumbnail

    return (
      <HistoryProductCard
        key={`${group.product.id ?? 'no-id'}-${group.latestScanAt}`}
        productName={group.product.name}
        judgment={group.judgment}
        allergens={group.product.allergens}
        detected={group.detected}
        thumbnailUrl={displayThumbnail}
        lightboxSrc={lightboxSrc}
        scans={group.scans.map((s) => ({
          id: s.id,
          storeName: s.location?.store_name ?? null,
          scannedAt: s.scannedAt,
        }))}
        onDetailClick={(scanId) => {
          const scan = group.scans.find((s) => s.id === scanId) ?? firstScan
          handleDetailOpen(group, scan)
        }}
        onLightboxOpen={(url) => setLightboxUrl(url)}
        onEdit={!isSelectMode ? () => handleEditOpen(group) : undefined}
        onDelete={!isSelectMode ? (scanId) => setDeleteConfirmId(scanId) : undefined}
        isSelectMode={isSelectMode}
        isSelected={isSelected}
        onSelect={() => handleToggleSelect(firstScanId)}
        itemUrl={group.product.itemUrl}
      />
    )
  })}
</ul>
```

- [ ] **Step 3: 型チェックをパスすることを確認する**

```
pnpm --filter frontend typecheck
```

Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add frontend/src/app/history/page.tsx
git commit -m "refactor: replace inline mine tab card with HistoryProductCard"
```

---

### Task 4: others/system タブを HistoryProductCard + HistoryDetailPanel readonly に置き換え

**Files:**
- Modify: `frontend/src/app/history/page.tsx`

- [ ] **Step 1: import を更新する**

`page.tsx` の import を以下に更新する（`HistoryCard` と `HistoryDetailModal` の import を削除し、型 import に `OthersProductItem` / `SystemProductItem` を追加）:

```typescript
import { HistoryDetailPanel } from '@/components/organisms/HistoryDetailPanel'
// HistoryCard と HistoryDetailModal の import を削除する
import type { HistoryGroup, HistoryFilter, PatchHistoryBody, OthersProductItem, SystemProductItem } from './history.types'
```

- [ ] **Step 2: others/system 用 state と変換関数を追加する**

`legacyDetailItem` state の宣言（167行目付近）を以下に置き換える:

```typescript
const [othersDetailGroup, setOthersDetailGroup] = useState<HistoryGroup | null>(null)
const [systemDetailGroup, setSystemDetailGroup] = useState<HistoryGroup | null>(null)

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

`handleLegacyDetailOpen` / `handleLegacyDetailClose`（241〜243行目付近）は削除する。

- [ ] **Step 3: others タブの `<ul>` を HistoryProductCard に置き換える**

`activeTab === 'others'` ブロック内の `<ul>` 中身（694〜725行目）を以下に置き換える:

```tsx
<ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
  {othersItems.map((item) => (
    <HistoryProductCard
      key={item.id}
      productName={item.product_name}
      judgment={item.judgment}
      allergens={item.allergens}
      detected={item.detected}
      thumbnailUrl={item.thumbnail_url}
      lightboxSrc={item.thumbnail_url}
      scans={[{
        id: item.id,
        storeName: item.store_name,
        scannedAt: item.updated_at,
      }]}
      onDetailClick={() => setOthersDetailGroup(othersItemToGroup(item))}
      onLightboxOpen={(url) => setLightboxUrl(url)}
      isExpired={item.is_expired}
    />
  ))}
</ul>
```

- [ ] **Step 4: system タブの `<ul>` を HistoryProductCard に置き換える**

`activeTab === 'system'` ブロック内の `<ul>` 中身（780〜806行目）を以下に置き換える:

```tsx
<ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
  {systemItems.map((item) => (
    <HistoryProductCard
      key={item.id}
      productName={item.product_name}
      judgment={item.judgment}
      allergens={{
        contains: item.allergens_contains,
        partial: item.allergens_partial,
      }}
      detected={
        item.allergens_contains.length > 0 ? item.allergens_contains : item.allergens_partial
      }
      thumbnailUrl={item.thumbnail_url}
      lightboxSrc={item.thumbnail_url}
      scans={[{
        id: item.id,
        storeName: null,
        scannedAt: item.updated_at,
      }]}
      onDetailClick={() => setSystemDetailGroup(systemItemToGroup(item))}
      onLightboxOpen={(url) => setLightboxUrl(url)}
    />
  ))}
</ul>
```

- [ ] **Step 5: 詳細パネル JSX を others/system 用に追加し、HistoryDetailModal JSX を削除する**

JSX 内の `{/* 詳細モーダル（others / system タブ用） */}` ブロック（839〜853行目）を削除し、代わりに `{/* 詳細パネル（自分のスキャン用） */}` ブロックの直後に以下を追加する:

```tsx
{/* 詳細パネル（みんなのスキャン用・readonly） */}
{othersDetailGroup && (
  <HistoryDetailPanel
    group={othersDetailGroup}
    selectedScan={othersDetailGroup.scans[0]!}
    isOpen={true}
    onClose={() => setOthersDetailGroup(null)}
    readonly
  />
)}

{/* 詳細パネル（システム用・readonly） */}
{systemDetailGroup && (
  <HistoryDetailPanel
    group={systemDetailGroup}
    selectedScan={systemDetailGroup.scans[0]!}
    isOpen={true}
    onClose={() => setSystemDetailGroup(null)}
    readonly
  />
)}
```

- [ ] **Step 6: 型チェックをパスすることを確認する**

```
pnpm --filter frontend typecheck
```

Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add frontend/src/app/history/page.tsx
git commit -m "refactor: unify others/system tabs to HistoryProductCard and HistoryDetailPanel readonly"
```

---

### Task 5: 廃止ファイルを削除して最終確認

**Files:**
- Delete: `frontend/src/components/organisms/HistoryCard.tsx`
- Delete: `frontend/src/components/organisms/HistoryDetailModal.tsx`

- [ ] **Step 1: 参照が残っていないことを確認する**

```bash
grep -r "HistoryCard\|HistoryDetailModal" frontend/src --include="*.tsx" --include="*.ts" -l
```

Expected: `HistoryCard.tsx` と `HistoryDetailModal.tsx` のみ（他に参照なし）

- [ ] **Step 2: ファイルを削除する**

PowerShell で実行:

```powershell
Remove-Item frontend/src/components/organisms/HistoryCard.tsx
Remove-Item frontend/src/components/organisms/HistoryDetailModal.tsx
```

- [ ] **Step 3: 型チェックをパスすることを確認する**

```
pnpm --filter frontend typecheck
```

Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add -A
git commit -m "chore: remove deprecated HistoryCard and HistoryDetailModal"
```
