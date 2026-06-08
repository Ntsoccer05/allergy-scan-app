# サムネイル画像 / 解析中通知 / 履歴一括削除 設計仕様

## 目標

1. スキャン時にサムネイル画像を自動生成・S3保存し、履歴カードに表示する
2. 編集モーダルでサムネイルをカメラ再撮影で更新できる
3. スキャン解析中に「商品を離してOKです」を表示する
4. 自分のスキャン履歴で複数選択→一括削除できる

## アーキテクチャ

- フロントエンド: Next.js App Router / TypeScript
- バックエンド: NestJS + Prisma（既存の `PATCH /history/:id` を流用。`DELETE /history/bulk` を新規追加）
- ストレージ: S3 Presigned URL（Lambda 6MB制限のためクライアント直接アップロード）

---

## 機能1: サムネイル自動保存（スキャン時）

### 並列処理フロー

撮影確定後、以下を並列実行する。OCRのレスポンス時間にサムネイル処理を混入させない。

```
撮影確定（ScanState: preview → processing）
  ├── [Branch A] getPresignedUrl() → uploadToS3(ocrBlob) → postOcr(s3Key) → result表示
  └── [Branch B] getPresignedUrl() → generateThumbnail(capturedImage) → uploadToS3(thumbBlob) → thumbnailUrl保持

OCR完了 → 結果画面へ遷移（Branch Bの完了を待たない）
POST /history 呼び出し時: thumbnailUrl が取得済みなら渡す、未完了ならnull
```

Branch A（OCR）が完了した時点で結果を表示する。Branch B（サムネイル）の完了/失敗は OCR フローに影響させない。サムネイルアップロード失敗は無視（履歴は保存される、thumbnail_url がnullになるだけ）。

### サムネイル生成仕様

**新規ファイル:** `frontend/src/lib/thumbnail.ts`

```typescript
const THUMBNAIL_MAX_PX = 300
const THUMBNAIL_QUALITY = 0.7

export const generateThumbnail = (dataUrl: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, THUMBNAIL_MAX_PX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('thumbnail generation failed'))),
        'image/jpeg',
        THUMBNAIL_QUALITY,
      )
    }
    img.onerror = reject
    img.src = dataUrl
  })
}
```

### useScan.ts の変更点

`confirmCapture()` または相当するOCR開始関数内で、Branch A と Branch B を並列起動する。

```typescript
// Branch B: サムネイルアップロード（fire-and-forget、エラーは握りつぶす）
const thumbnailUrlPromise = (async () => {
  try {
    const { url, key } = await getPresignedUrl()
    const thumbBlob = await generateThumbnail(capturedImage)
    await uploadToS3(url, thumbBlob)
    return `${S3_BASE_URL}/${key}`
  } catch {
    return null
  }
})()

// Branch A: OCR（こちらが主）
const ocrResult = await runOcr(capturedImage)  // 既存処理

// 履歴保存時にサムネイルURLを含める（Branch Bの完了は await する）
const thumbnailUrl = await thumbnailUrlPromise
await postHistory({ ...ocrResult, thumbnail_url: thumbnailUrl })
```

---

## 機能2: サムネイル更新（履歴編集モーダル）

### 編集モーダルの変更

`frontend/src/app/history/page.tsx` の `EditFormData` に `thumbnail_url` を追加:

```typescript
type EditFormData = {
  product_name: string
  store_name: string
  memo: string
  is_public: boolean
  thumbnail_url: string | null  // 追加
}
```

モーダル内にサムネイルエリアを追加:

```tsx
{/* サムネイル */}
<div>
  <label className="text-sm font-medium text-gray-700">{t('edit.thumbnail')}</label>
  <div className="mt-1 relative">
    {editForm.thumbnail_url ? (
      <img src={editForm.thumbnail_url} className="h-24 w-24 rounded object-cover" alt="" />
    ) : (
      <div className="h-24 w-24 rounded bg-gray-100" />
    )}
    <button
      type="button"
      onClick={() => setShowThumbnailCamera(true)}
      className="mt-2 text-sm text-blue-600"
    >
      {t('edit.retake')}  {/* 「再撮影」 */}
    </button>
  </div>
</div>
```

「再撮影」ボタン → カメラモーダルを開く → 撮影 → プレビュー確認 → 確定でサムネイルをS3アップロード → `editForm.thumbnail_url` を更新（まだ保存しない）→ モーダルの「保存」で `PATCH /history/:id { thumbnail_url: newUrl }` を呼ぶ。

カメラモーダルは `useCamera` を使った小コンポーネント（`ThumbnailCameraModal`）として実装する。スキャン画面と同じタップ撮影・プレビュー確認フローを踏む。

### バックエンド

`PATCH /history/:id` は既に `thumbnail_url` を受け付けているため、バックエンド変更不要。

---

## 機能3: 解析中通知

### スキャン画面の変更

`processing` 状態のローディング表示に一文を追加するのみ。

```tsx
{/* processing中の既存ローディングUI内に追加 */}
<p className="text-sm text-gray-500 mt-2">{t('scan.processing.okToStep')}</p>
```

### i18nキー追加

`frontend/public/locales/ja/scan.json`:
```json
"processing": {
  "okToStep": "商品を離しても大丈夫です"
}
```

`frontend/public/locales/en/scan.json`:
```json
"processing": {
  "okToStep": "You can step away from the product"
}
```

---

## 機能4: 履歴一括削除

### バックエンド: DELETE /history/bulk

**新規エンドポイント:**

```
DELETE /history/bulk
Authorization: Cookie
Body: { ids: string[] }  // 最大100件
Response: 204 No Content
```

`scan_histories` から `user_id = req.user.sub AND id IN (ids)` で削除。他ユーザーのIDが混入しても `user_id` 条件で安全に除外される。

**変更ファイル:**
- `backend/src/history/history.controller.ts` — `@Delete('bulk')` 追加
- `backend/src/history/history.service.ts` — `bulkDelete(userId, ids)` 追加
- `backend/src/history/scan-history.repository.ts` — `deleteManyByIds(userId, ids)` 追加
- `backend/src/history/dto/bulk-delete-history.dto.ts` — DTO作成

**DTO:**
```typescript
export class BulkDeleteHistoryDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  ids!: string[]
}
```

### フロントエンド: 選択モードUI

**状態管理（history/page.tsx に追加）:**
```typescript
const [isSelectMode, setIsSelectMode] = useState(false)
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
```

**UI構成（自分のスキャンタブ）:**

```
通常モード:
  [すべて][NG][一部含む][OK]    [選択]ボタン（右端）

選択モード:
  [✕キャンセル]  N件選択中  [全選択]
  ↓ カード一覧（チェックボックス付き、フィルター適用中の件数のみ）
  ↓ 画面下部固定バー
  [削除（N件）]（N=0のときグレーアウト）
```

**HistoryCard の変更:**
- `isSelectMode?: boolean` props を追加
- `isSelected?: boolean` props を追加
- `onSelect?: (id: string) => void` props を追加
- 選択モード時: カード左端にチェックボックス表示、タップで選択トグル

**一括削除API:**
`frontend/src/lib/api/history.api.ts` に追加:
```typescript
export const bulkDeleteHistory = async (ids: string[]): Promise<void> => {
  await apiFetch('/history/bulk', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  })
}
```

**削除フロー:**
1. 「削除（N件）」タップ
2. 確認ダイアログ: 「N件の履歴を削除しますか？」
3. `DELETE /history/bulk { ids: [...] }`
4. 選択モード解除 → リスト再取得

---

## 影響ドキュメント（実装完了後に更新）

| ドキュメント | 更新内容 |
|---|---|
| `docs/design/api.md` | `DELETE /history/bulk` 追加 |
| `CLAUDE.md` | APIエンドポイント一覧に `DELETE /history/bulk` 追加 |

---

## セルフレビュー

### 仕様カバレッジ

| 要件 | カバー |
|---|---|
| スキャン時にサムネイル自動保存（OCRと並列・レスポンス時間に影響なし） | ✅ 機能1 |
| 履歴編集モーダルでサムネイルをカメラ再撮影で更新 | ✅ 機能2 |
| 解析中に「商品を離してOKです」を常時表示 | ✅ 機能3 |
| 履歴の複数選択（チェックボックス） | ✅ 機能4 |
| 一括削除（選択した件数のみ） | ✅ 機能4 |
| 全選択ボタン（副次的） | ✅ 機能4 |
| フィルターと連動（現在表示中の件数のみ選択対象） | ✅ 機能4 |

### 型一貫性

- `BulkDeleteHistoryDto.ids` は `string[]`、フロントの `selectedIds: Set<string>` は保存時に `[...selectedIds]` で変換
- `generateThumbnail` は `Promise<Blob>` を返し、`uploadToS3(url, blob)` の既存シグネチャと一致

### セキュリティ

- `DELETE /history/bulk` は `user_id = req.user.sub` 条件を必ず付ける（他ユーザーのID混入を防ぐ）
- サムネイルアップロード失敗は無視（アプリの安定性優先）
