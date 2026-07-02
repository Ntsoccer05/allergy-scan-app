# サムネイル画像クリックで拡大表示（ImageLightbox）実装計画

> **エージェント向け:** REQUIRED SUB-SKILL: `executing-plans` または `subagent-driven-development` を使ってこの計画をタスクごとに実装すること。ステップはチェックボックス構文（`- [ ]`）で追跡。

**目標:** 履歴画面のサムネイル画像をクリックしたとき、フルスクリーンのライトボックスで画像を拡大表示できるようにする。対象は「詳細パネル（HistoryDetailPanel）のサムネイル」と「履歴リストカード（page.tsx）のサムネイル」の2箇所。

**アーキテクチャ:** `ImageLightbox` をステートレスな atom として新規作成する。`HistoryDetailPanel` はコンポーネントローカルな state で制御し、`page.tsx` はページレベルの `lightboxUrl` state で制御する。リストカードのサムネイルクリックは `e.stopPropagation()` で親 div の詳細パネル起動を防ぐ。`ImageLightbox` の z-index は `z-[70]`（詳細パネル z-50・確認ダイアログ z-[60] より上）。

**技術スタック:** Next.js App Router / React / Tailwind CSS / next-intl / @testing-library/react

---

## ファイル変更マップ

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `frontend/src/components/atoms/ImageLightbox.tsx` | 新規作成 | ライトボックス atom |
| `frontend/src/components/atoms/ImageLightbox.test.tsx` | 新規作成 | atom のユニットテスト |
| `frontend/public/locales/ja/history.json` | 修正 | `detail.thumbnailAriaLabel` 追加 |
| `frontend/public/locales/en/history.json` | 修正 | `detail.thumbnailAriaLabel` 追加 |
| `frontend/src/components/organisms/HistoryDetailPanel.tsx` | 修正 | ローカル lightbox state + サムネイルクリック統合 |
| `frontend/src/app/history/page.tsx` | 修正 | `lightboxUrl` state + リストカードサムネイルクリック統合 |

---

## Task 1: `ImageLightbox` atom を TDD で実装

**Files:**
- Create: `frontend/src/components/atoms/ImageLightbox.tsx`
- Create: `frontend/src/components/atoms/ImageLightbox.test.tsx`

- [ ] **Step 1: テストファイルを作成する**

`frontend/src/components/atoms/ImageLightbox.test.tsx` を作成:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ImageLightbox } from './ImageLightbox'

describe('ImageLightbox', () => {
  const defaultProps = {
    src: 'https://example.com/image.jpg',
    closeAriaLabel: '閉じる',
    onClose: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render the image with provided src', () => {
    render(<ImageLightbox {...defaultProps} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://example.com/image.jpg')
  })

  it('should render a dialog role', () => {
    render(<ImageLightbox {...defaultProps} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('should call onClose when close button is clicked', () => {
    render(<ImageLightbox {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('should call onClose when overlay background is clicked', () => {
    render(<ImageLightbox {...defaultProps} />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('should NOT call onClose when image itself is clicked', () => {
    render(<ImageLightbox {...defaultProps} />)
    fireEvent.click(screen.getByRole('img'))
    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm --filter frontend test ImageLightbox
```

Expected: FAIL — `Cannot find module './ImageLightbox'`

- [ ] **Step 3: `ImageLightbox` の実装を作成する**

`frontend/src/components/atoms/ImageLightbox.tsx` を作成:

```tsx
'use client'

type Props = {
  src: string
  /** 閉じるボタンの aria-label。親コンポーネントが t('detail.close') を渡す。 */
  closeAriaLabel: string
  onClose: () => void
}

export function ImageLightbox({ src, closeAriaLabel, onClose }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={closeAriaLabel}
        className="absolute top-4 right-4 text-white text-2xl p-2 hover:bg-white/10 rounded-full transition-colors"
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
```

- [ ] **Step 4: テストがパスすることを確認する**

```bash
pnpm --filter frontend test ImageLightbox
```

Expected: PASS — 5 tests passed

- [ ] **Step 5: 型チェックを通す**

```bash
pnpm --filter frontend typecheck
```

Expected: 0 errors

- [ ] **Step 6: コミット**

```bash
git add frontend/src/components/atoms/ImageLightbox.tsx frontend/src/components/atoms/ImageLightbox.test.tsx
git commit -m "feat: add ImageLightbox atom for full-screen image preview"
```

---

## Task 2: i18n キー追加

**Files:**
- Modify: `frontend/public/locales/ja/history.json`
- Modify: `frontend/public/locales/en/history.json`

- [ ] **Step 1: 日本語ロケールに `detail.thumbnailAriaLabel` を追加する**

`frontend/public/locales/ja/history.json` の `detail` オブジェクト内に追加（`detail.caution` の後）:

```json
"caution": "購入前にラベルの実物も必ずご確認ください",
"thumbnailAriaLabel": "画像を拡大表示",
```

- [ ] **Step 2: 英語ロケールに `detail.thumbnailAriaLabel` を追加する**

`frontend/public/locales/en/history.json` の `detail` オブジェクト内に追加（`detail.caution` の後）:

```json
"caution": "Always check the actual label before purchasing",
"thumbnailAriaLabel": "View full image",
```

- [ ] **Step 3: コミット**

```bash
git add frontend/public/locales/ja/history.json frontend/public/locales/en/history.json
git commit -m "feat: add thumbnailAriaLabel i18n key for image lightbox"
```

---

## Task 3: `HistoryDetailPanel` にライトボックスを統合

**Files:**
- Modify: `frontend/src/components/organisms/HistoryDetailPanel.tsx`

現在のサムネイル部分（:167-174）:
```tsx
{displayThumbnail && (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={displayThumbnail}
    alt=""
    className="h-24 w-24 object-cover rounded-xl shrink-0"
  />
)}
```

- [ ] **Step 1: `useState` と `ImageLightbox` の import を追加する**

ファイル先頭の import を編集:

```tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ImageLightbox } from '@/components/atoms/ImageLightbox'
import type { HistoryGroup } from '@/app/history/history.types'
```

- [ ] **Step 2: ライトボックス用の state を追加する**

`HistoryDetailPanel` コンポーネント内の既存 state 宣言の後（:92-97 付近）に追加:

```tsx
const [isEditing, setIsEditing] = useState(false)
const [rawTextOpen, setRawTextOpen] = useState(true)
const [productName, setProductName] = useState(group.product.name ?? '')
const [storeName, setStoreName] = useState(selectedScan.location?.store_name ?? '')
const [memo, setMemo] = useState(selectedScan.memo ?? '')
const [isSaving, setIsSaving] = useState(false)
const [lightboxOpen, setLightboxOpen] = useState(false)  // ← 追加
```

- [ ] **Step 3: サムネイルを button でラップしてクリックハンドラを追加する**

`:167-174` のサムネイル部分を以下に置き換え:

```tsx
{displayThumbnail && (
  <button
    type="button"
    aria-label={t('detail.thumbnailAriaLabel')}
    onClick={() => setLightboxOpen(true)}
    className="block"
  >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src={displayThumbnail}
      alt=""
      className="h-24 w-24 object-cover rounded-xl shrink-0 cursor-pointer"
    />
  </button>
)}
```

- [ ] **Step 4: `ImageLightbox` を `return` 直前にレンダリングする**

`return (` の直前に追加:

```tsx
  return (
    <>
      {lightboxOpen && displayThumbnail && (
        <ImageLightbox
          src={displayThumbnail}
          closeAriaLabel={t('detail.close')}
          onClose={() => setLightboxOpen(false)}
        />
      )}
      <div className="fixed inset-0 z-50 flex flex-col">
        {/* ... 既存の JSX をそのまま維持 ... */}
      </div>
    </>
  )
```

> 注意: 既存の `return` ブロック全体を `<>...</>` フラグメントで包み、`ImageLightbox` を先頭に追加する。

- [ ] **Step 5: 型チェックを通す**

```bash
pnpm --filter frontend typecheck
```

Expected: 0 errors

- [ ] **Step 6: コミット**

```bash
git add frontend/src/components/organisms/HistoryDetailPanel.tsx
git commit -m "feat: add thumbnail lightbox to HistoryDetailPanel"
```

---

## Task 4: `page.tsx` リストカードのサムネイルにライトボックスを統合

**Files:**
- Modify: `frontend/src/app/history/page.tsx`

対象: `:517-530` 付近の `displayThumbnail` を表示している `<img>` タグ:

```tsx
{displayThumbnail ? (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={displayThumbnail}
    alt=""
    className="h-14 w-14 rounded-lg object-cover shrink-0"
  />
) : (
  <div className="h-14 w-14 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-2xl">
    🍱
  </div>
)}
```

- [ ] **Step 1: `ImageLightbox` の import と `lightboxUrl` state を追加する**

ファイル先頭の import に追加:

```tsx
import { ImageLightbox } from '@/components/atoms/ImageLightbox'
```

`useState` の既存宣言群（`:164-180` 付近）の後に追加:

```tsx
const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
```

- [ ] **Step 2: リストカードのサムネイルを button でラップしてクリックハンドラを追加する**

`:517-530` 付近のサムネイル部分を以下に置き換え:

```tsx
{displayThumbnail ? (
  <button
    type="button"
    aria-label={t('detail.thumbnailAriaLabel')}
    className="shrink-0"
    onClick={(e) => {
      e.stopPropagation()
      setLightboxUrl(displayThumbnail)
    }}
  >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      src={displayThumbnail}
      alt=""
      className="h-14 w-14 rounded-lg object-cover cursor-pointer"
    />
  </button>
) : (
  <div className="h-14 w-14 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-2xl">
    🍱
  </div>
)}
```

- [ ] **Step 3: ページ末尾（`</main>` の直前）に `ImageLightbox` をレンダリングする**

`:1027` 付近の `</main>` 直前に追加:

```tsx
      {/* サムネイル拡大ライトボックス */}
      {lightboxUrl && (
        <ImageLightbox
          src={lightboxUrl}
          closeAriaLabel={t('detail.close')}
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </main>
```

- [ ] **Step 4: 型チェックを通す**

```bash
pnpm --filter frontend typecheck
```

Expected: 0 errors

- [ ] **Step 5: コミット**

```bash
git add frontend/src/app/history/page.tsx
git commit -m "feat: add thumbnail lightbox to history list cards"
```

---

## Task 5: Chrome 実機チェック & 最終確認

- [ ] **Step 1: 全テストを通す**

```bash
pnpm --filter frontend test
```

Expected: PASS（ImageLightbox の 5 テスト含む）

- [ ] **Step 2: `chrome-check` スキルを呼び出して実機チェックを行う**

`chrome-check` スキルを使い、以下を確認:

1. 履歴ページ（`/history`）を開く
2. リストカードのサムネイル画像をタップ → ライトボックスが全画面で開くこと
3. ライトボックスの `✕` ボタンをタップ → 閉じること
4. ライトボックスの黒いオーバーレイ部分をタップ → 閉じること
5. リストカードのサムネイル以外（商品名テキスト部分など）をタップ → 詳細パネルが開くこと（既存動作が壊れていないこと）
6. 詳細パネルを開いてサムネイルをタップ → ライトボックスが開くこと（z-index: 70 で詳細パネルの上に表示）
7. コンソールエラーがないこと（`mcp__chrome-devtools__list_console_messages`）
8. ネットワーク 4xx/5xx がないこと（`mcp__chrome-devtools__list_network_requests`）
