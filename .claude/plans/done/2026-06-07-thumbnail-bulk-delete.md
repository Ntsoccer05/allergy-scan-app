# サムネイル / 解析中通知 / 一括削除 実装計画

> **エージェント向け:** REQUIRED SUB-SKILL: `executing-plans` または `subagent-driven-development` を使ってこの計画をタスクごとに実装すること。ステップはチェックボックス構文（`- [ ]`）で追跡。

**目標:** スキャン時のサムネイル自動保存・編集、解析中通知テキスト表示、履歴の複数選択一括削除 の 3 機能を実装する。

**アーキテクチャ:**
- サムネイル: `generateThumbnail()` が canvas でリサイズ → S3 Presigned URL で OCR と並列アップロード → `POST /history` に `thumbnail_url` を含める。OCR のレスポンス時間に影響させない（fire-and-forget ではなく、OCR 完了後に await してから履歴保存）。
- 一括削除: バックエンドに `DELETE /history/bulk { ids: string[] }` を追加。フロントは選択モードで選択した件数を表示し、確認後に一括削除。
- 解析中通知: `LoadingOverlay` に `subtitle` prop を追加し、既存の `camera.processingSubtitle` i18n キーを使用。

**技術スタック:** Next.js App Router / TypeScript / NestJS / Prisma / S3 Presigned URL / next-intl

---

## ファイルマップ

| ファイル | 変更種別 | 理由 |
|---|---|---|
| `frontend/src/lib/thumbnail.ts` | 新規作成 | サムネイル生成ロジックを集約 |
| `frontend/src/lib/__tests__/thumbnail.test.ts` | 新規作成 | thumbnail.ts のテスト |
| `frontend/src/components/atoms/LoadingOverlay.tsx` | 変更 | `subtitle` prop 追加 |
| `frontend/src/app/scan/page.tsx` | 変更 | `subtitle` を LoadingOverlay に渡す |
| `frontend/src/hooks/useScan.ts` | 変更 | runOcrFlow に並列サムネイルアップロード追加 |
| `frontend/src/lib/api/scan.api.ts` | 変更 | `getPublicUrlFromPresigned` ヘルパー追加 |
| `backend/src/history/dto/patch-history.dto.ts` | 変更 | `is_public` + `thumbnail_url` 追加 |
| `backend/src/history/scan-history.repository.ts` | 変更 | `thumbnail_url`/`is_public` フィールド修正、`deleteManyByIds` 追加 |
| `backend/src/history/history.service.ts` | 変更 | `bulkDelete` 追加、`updateHistory` で is_public/thumbnail_url 処理 |
| `backend/src/history/history.controller.ts` | 変更 | `DELETE /history/bulk` 追加 |
| `backend/src/history/dto/bulk-delete-history.dto.ts` | 新規作成 | BulkDeleteHistoryDto |
| `backend/src/history/history.service.spec.ts` | 変更 | bulkDelete + updateHistory(is_public) テスト追加 |
| `backend/src/history/history.controller.spec.ts` | 変更 | `DELETE /history/bulk` テスト追加 |
| `frontend/src/lib/api/history.api.ts` | 変更 | `bulkDeleteHistory` 追加 |
| `frontend/public/locales/ja/history.json` | 変更 | 選択モード / サムネイルの i18n キー追加 |
| `frontend/public/locales/en/history.json` | 変更 | 同上（英語） |
| `frontend/src/app/history/page.tsx` | 変更 | 選択モード UI + 編集モーダルのサムネイル欄 |
| `frontend/src/components/organisms/HistoryCard.tsx` | 変更 | `isSelectMode` / `isSelected` / `onSelect` props 追加 |
| `frontend/src/components/organisms/ThumbnailCameraModal.tsx` | 新規作成 | 再撮影用カメラモーダル |

---

## Task 1: サムネイル生成ユーティリティ（`thumbnail.ts`）

**Files:**
- Create: `frontend/src/lib/thumbnail.ts`
- Create: `frontend/src/lib/__tests__/thumbnail.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// frontend/src/lib/__tests__/thumbnail.test.ts
import { generateThumbnail, THUMBNAIL_MAX_PX } from '@/lib/thumbnail'

// jsdom では canvas.toBlob が未実装なのでスタブする
const mockToBlob = jest.fn((cb: (b: Blob | null) => void, _type: string, _q: number) => {
  cb(new Blob(['fake'], { type: 'image/jpeg' }))
})

beforeEach(() => {
  // HTMLCanvasElement.prototype.toBlob をモック
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    value: mockToBlob,
    writable: true,
  })

  // HTMLImageElement のロードをシミュレート
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    set(src: string) {
      // src セット後すぐに onload を呼ぶ
      Object.defineProperty(this, 'naturalWidth', { value: 600, configurable: true })
      Object.defineProperty(this, 'naturalHeight', { value: 400, configurable: true })
      Object.defineProperty(this, 'width', { value: 600, configurable: true })
      Object.defineProperty(this, 'height', { value: 400, configurable: true })
      setTimeout(() => this.onload?.(), 0)
    },
    configurable: true,
  })
})

describe('generateThumbnail', () => {
  it('600x400 画像を 300x200 にリサイズして JPEG Blob を返す', async () => {
    const blob = await generateThumbnail('data:image/jpeg;base64,/9j/fake')
    expect(blob).toBeInstanceOf(Blob)
    expect(mockToBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/jpeg',
      0.7,
    )
  })

  it(`長辺が ${THUMBNAIL_MAX_PX} 以下の画像はリサイズされない`, async () => {
    // 100x80 画像をモック
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      set() {
        Object.defineProperty(this, 'width', { value: 100, configurable: true })
        Object.defineProperty(this, 'height', { value: 80, configurable: true })
        setTimeout(() => this.onload?.(), 0)
      },
      configurable: true,
    })
    await generateThumbnail('data:image/jpeg;base64,/9j/tiny')
    const canvas = document.createElement('canvas')
    // canvas サイズが 100x80 のままであることを確認するため toBlob の引数を確認
    expect(mockToBlob).toHaveBeenCalled()
  })

  it('toBlob が null を返した場合は reject する', async () => {
    mockToBlob.mockImplementationOnce((cb) => cb(null))
    await expect(generateThumbnail('data:image/jpeg;base64,/9j/fail')).rejects.toThrow(
      'thumbnail generation failed',
    )
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm --filter frontend test src/lib/__tests__/thumbnail.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/thumbnail'`

- [ ] **Step 3: thumbnail.ts を実装する**

```typescript
// frontend/src/lib/thumbnail.ts
export const THUMBNAIL_MAX_PX = 300
const THUMBNAIL_QUALITY = 0.7

/**
 * dataUrl で渡された画像を長辺 THUMBNAIL_MAX_PX 以下に縮小した JPEG Blob を返す。
 * サムネイル用なので OCR 前処理を適用しない（オリジナル色調を保持する）。
 */
export const generateThumbnail = (dataUrl: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, THUMBNAIL_MAX_PX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas context unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('thumbnail generation failed'))),
        'image/jpeg',
        THUMBNAIL_QUALITY,
      )
    }
    img.onerror = () => reject(new Error('image load failed'))
    img.src = dataUrl
  })
```

- [ ] **Step 4: テストがパスすることを確認する**

```bash
pnpm --filter frontend test src/lib/__tests__/thumbnail.test.ts
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add frontend/src/lib/thumbnail.ts frontend/src/lib/__tests__/thumbnail.test.ts
git commit -m "feat: add generateThumbnail utility for scan thumbnail"
```

---

## Task 2: 解析中通知（`LoadingOverlay` + `scan/page.tsx`）

**Files:**
- Modify: `frontend/src/components/atoms/LoadingOverlay.tsx`
- Modify: `frontend/src/app/scan/page.tsx`

`camera.processingSubtitle` キーは既に ja/en 両方の `scan.json` に存在するため i18n 追加不要。

- [ ] **Step 1: `LoadingOverlay` に `subtitle` prop を追加する**

```typescript
// frontend/src/components/atoms/LoadingOverlay.tsx
'use client'

import { LoadingSpinner } from './LoadingSpinner'

type Props = {
  isOpen: boolean
  message?: string
  subtitle?: string
}

export const LoadingOverlay = ({ isOpen, message, subtitle }: Props) => {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
      <LoadingSpinner size="lg" />
      {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  )
}
```

- [ ] **Step 2: `scan/page.tsx` で `subtitle` を渡す**

`frontend/src/app/scan/page.tsx` の `LoadingOverlay` 行を以下に変更する:

```tsx
<LoadingOverlay
  isOpen={scanState === 'processing'}
  message={t('processing')}
  subtitle={t('camera.processingSubtitle')}
/>
```

- [ ] **Step 3: 型チェックが通ることを確認する**

```bash
pnpm --filter frontend typecheck
```

Expected: no errors

- [ ] **Step 4: コミット**

```bash
git add frontend/src/components/atoms/LoadingOverlay.tsx frontend/src/app/scan/page.tsx
git commit -m "feat: show okToStep hint during scan processing"
```

---

## Task 3: スキャン時サムネイル並列アップロード（`useScan.ts` + `scan.api.ts`）

**Files:**
- Modify: `frontend/src/lib/api/scan.api.ts`
- Modify: `frontend/src/hooks/useScan.ts`

設計:
- OCR 用 Presigned URL 取得・アップロードと並列で、サムネイル用 Presigned URL 取得・サムネイル生成・アップロードを実行する
- OCR 完了 → 結果画面遷移 → `saveHistory` 時に `thumbnailUrlPromise` を `await` してから thumbnail_url を含める
- サムネイル失敗は無視（履歴は thumbnail_url=null で保存）

- [ ] **Step 1: `scan.api.ts` に `getPublicUrlFromPresigned` ヘルパーを追加する**

`frontend/src/lib/api/scan.api.ts` の末尾に追加:

```typescript
/**
 * Presigned PUT URL から query string を除いた公開 URL を生成する。
 * S3 バケットがパブリック読み取り可能な場合のみ有効。
 * 例: https://bucket.s3.amazonaws.com/key?X-Amz-... → https://bucket.s3.amazonaws.com/key
 */
export const getPublicUrlFromPresigned = (presignedUrl: string): string => {
  const url = new URL(presignedUrl)
  url.search = ''
  return url.toString()
}
```

- [ ] **Step 2: `useScan.ts` の `runOcrFlow` にサムネイル並列ブランチを追加する**

`frontend/src/hooks/useScan.ts` の先頭 import に追加:

```typescript
import { generateThumbnail } from '@/lib/thumbnail'
import { getPublicUrlFromPresigned } from '@/lib/api/scan.api'
```

`runOcrFlow` 内の `const capturedImageUrl = canvas.toDataURL(...)` の直後（`const blob = ...` の前）に追加:

```typescript
// Branch B: サムネイルアップロード（OCR と並列実行。失敗は無視して thumbnail_url=null とする）
const thumbnailUrlPromise: Promise<string | null> = (async () => {
  try {
    const thumbBlob = await generateThumbnail(capturedImageUrl)
    const { url: thumbPresigned } = await fetchPresignedUrl()
    await putS3(thumbPresigned, thumbBlob)
    return getPublicUrlFromPresigned(thumbPresigned)
  } catch {
    return null
  }
})()
```

同じ関数内の `saveHistory(historyBody)` 呼び出し部分を以下に変更:

```typescript
// Branch A (OCR) 完了後にサムネイル URL を取得（Branch B がまだ実行中なら await で待つ）
const thumbnailUrl = await thumbnailUrlPromise
const saved = await saveHistory({
  ...historyBody,
  thumbnail_url: thumbnailUrl ?? undefined,
})
if (saved) {
  scanHistoryIdRef.current = saved.id
}
```

- [ ] **Step 3: 型チェックが通ることを確認する**

```bash
pnpm --filter frontend typecheck
```

Expected: no errors

- [ ] **Step 4: コミット**

```bash
git add frontend/src/lib/api/scan.api.ts frontend/src/hooks/useScan.ts
git commit -m "feat: upload thumbnail in parallel with OCR on scan confirm"
```

---

## Task 4: バックエンド — PATCH /history/:id に `is_public` + `thumbnail_url` 追加

**Files:**
- Modify: `backend/src/history/dto/patch-history.dto.ts`
- Modify: `backend/src/history/scan-history.repository.ts`
- Modify: `backend/src/history/history.service.ts`
- Modify: `backend/src/history/history.service.spec.ts`

注: `ScanHistoryRecord.thumbnailUrl` は既に実装済み。`is_public` (Prisma: `isPublic`) は GET /history で未返却だったため、`findByUser` / `findById` の select に追加し `ScanHistoryRecord` に `isPublic` フィールドを追加する。

- [ ] **Step 1: 失敗するテストを書く**

`backend/src/history/history.service.spec.ts` の `describe('HistoryService')` ブロック内末尾に追加:

```typescript
describe('updateHistory with is_public', () => {
  it('is_public を渡すと repository.update を is_public=true で呼ぶ', async () => {
    repository.findById.mockResolvedValue(makeRecord({ userId: 'user-1' }))
    repository.update.mockResolvedValue(undefined)

    await service.updateHistory('rec-uuid', 'user-1', {
      is_public: true,
    })

    expect(repository.update).toHaveBeenCalledWith(
      'rec-uuid',
      expect.objectContaining({ isPublic: true }),
    )
  })

  it('thumbnail_url を渡すと repository.update を thumbnailUrl で呼ぶ', async () => {
    repository.findById.mockResolvedValue(makeRecord({ userId: 'user-1' }))
    repository.update.mockResolvedValue(undefined)

    await service.updateHistory('rec-uuid', 'user-1', {
      thumbnail_url: 'https://example.com/thumb.jpg',
    })

    expect(repository.update).toHaveBeenCalledWith(
      'rec-uuid',
      expect.objectContaining({ thumbnailUrl: 'https://example.com/thumb.jpg' }),
    )
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm --filter backend test history.service
```

Expected: FAIL — `PatchHistoryDto` に `is_public`/`thumbnail_url` がない

- [ ] **Step 3: `PatchHistoryDto` を更新する**

```typescript
// backend/src/history/dto/patch-history.dto.ts
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PatchLocationDto {
  @IsString()
  store_name!: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

export class PatchHistoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  product_name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  store_name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string | null;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @IsOptional()
  @IsUrl()
  thumbnail_url?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatchLocationDto)
  location?: PatchLocationDto;
}
```

- [ ] **Step 4: `ScanHistoryRecord` に `isPublic` を追加し、select を更新する**

`backend/src/history/scan-history.repository.ts` の `ScanHistoryRecord` 型を更新:

```typescript
export type ScanHistoryRecord = {
  id: string;
  userId: string;
  productId: string | null;
  productName: string | null;
  judgment: string;
  detected: string[];
  location: ScanHistoryLocation | null;
  thumbnailUrl: string | null;
  isPublic: boolean;   // 追加
  memo: string | null;
  scannedAt: Date;
};
```

`UpdateScanHistoryData` 型を更新:

```typescript
export type UpdateScanHistoryData = {
  productName?: string | null;
  storeName?: string | null;
  memo?: string | null;
  isPublic?: boolean;      // 追加
  thumbnailUrl?: string | null;  // 追加
};
```

`findByUser` の select に `isPublic: true` を追加し、`map` で `isPublic: record.isPublic` を追加する:

```typescript
select: {
  id: true,
  userId: true,
  productId: true,
  productName: true,
  judgment: true,
  detected: true,
  location: true,
  thumbnailUrl: true,
  isPublic: true,   // 追加
  memo: true,
  scannedAt: true,
},
// ...
return records.map((record) => ({
  // ... 既存フィールド ...
  thumbnailUrl: record.thumbnailUrl,
  isPublic: record.isPublic,  // 追加
  memo: record.memo,
  scannedAt: record.scannedAt,
}));
```

同様に `findById` の select と map にも `isPublic` を追加する。

`create()` の `select` と返却値にも `isPublic` を追加する:

```typescript
// create の select に追加:
isPublic: true,

// create の return に追加:
isPublic: record.isPublic,
```

`update()` メソッドに `isPublic` と `thumbnailUrl` の処理を追加する:

```typescript
async update(id: string, data: UpdateScanHistoryData): Promise<void> {
  const updateData: Record<string, unknown> = {};

  if (data.productName !== undefined) {
    updateData.productName = data.productName;
  }

  if (data.storeName !== undefined) {
    const existing = await this.findById(id);
    const existingLocation = existing?.location;
    updateData.location = {
      store_name: data.storeName,
      lat: existingLocation?.lat ?? 0,
      lng: existingLocation?.lng ?? 0,
    };
  }

  if (data.memo !== undefined) {
    updateData.memo = data.memo;
  }

  if (data.isPublic !== undefined) {
    updateData.isPublic = data.isPublic;
  }

  if (data.thumbnailUrl !== undefined) {
    updateData.thumbnailUrl = data.thumbnailUrl;
  }

  await this.prisma.scanHistory.update({
    where: { id },
    data: updateData,
  });
}
```

- [ ] **Step 5: `HistoryService.updateHistory()` を更新する**

`history.service.ts` の `updateHistory` メソッドで `scanHistoryRepository.update()` 呼び出しを更新:

```typescript
await this.scanHistoryRepository.update(id, {
  productName: data.product_name,
  storeName: data.store_name,
  memo: data.memo,
  isPublic: data.is_public,
  thumbnailUrl: data.thumbnail_url,
});
```

- [ ] **Step 6: テストがパスすることを確認する**

```bash
pnpm --filter backend test history.service
```

Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add backend/src/history/dto/patch-history.dto.ts \
        backend/src/history/scan-history.repository.ts \
        backend/src/history/history.service.ts \
        backend/src/history/history.service.spec.ts
git commit -m "feat: support is_public and thumbnail_url in PATCH /history/:id"
```

---

## Task 5: バックエンド — `DELETE /history/bulk`

**Files:**
- Create: `backend/src/history/dto/bulk-delete-history.dto.ts`
- Modify: `backend/src/history/scan-history.repository.ts`
- Modify: `backend/src/history/history.service.ts`
- Modify: `backend/src/history/history.controller.ts`
- Modify: `backend/src/history/history.service.spec.ts`
- Modify: `backend/src/history/history.controller.spec.ts`

- [ ] **Step 1: 失敗するテストを書く（Service）**

`history.service.spec.ts` の `describe('HistoryService')` ブロック内末尾に追加:

```typescript
describe('bulkDelete', () => {
  it('指定した ids に対して deleteManyByIds を呼ぶ', async () => {
    // deleteManyByIds をモックに追加
    repository.deleteManyByIds = jest.fn().mockResolvedValue(undefined);

    await service.bulkDelete('user-1', ['id-1', 'id-2']);

    expect(repository.deleteManyByIds).toHaveBeenCalledWith('user-1', ['id-1', 'id-2']);
  });

  it('ids が空配列の場合は deleteManyByIds を呼ばない', async () => {
    repository.deleteManyByIds = jest.fn().mockResolvedValue(undefined);

    await service.bulkDelete('user-1', []);

    expect(repository.deleteManyByIds).not.toHaveBeenCalled();
  });
});
```

`history.controller.spec.ts` の末尾に追加（`describe('HistoryController')` 内）:

```typescript
describe('DELETE /history/bulk', () => {
  it('200: ids が配列として渡されると bulkDelete を呼ぶ', async () => {
    const app = await buildApp({
      bulkDelete: jest.fn().mockResolvedValue(undefined),
    });

    await request(app.getHttpServer())
      .delete('/history/bulk')
      .set('X-Test-User-Id', 'user-1')
      .send({ ids: ['id-1', 'id-2'] })
      .expect(204);
  });

  it('400: ids が配列でない場合は BadRequest', async () => {
    const app = await buildApp({
      bulkDelete: jest.fn(),
    });

    await request(app.getHttpServer())
      .delete('/history/bulk')
      .set('X-Test-User-Id', 'user-1')
      .send({ ids: 'not-array' })
      .expect(400);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm --filter backend test history.service history.controller
```

Expected: FAIL — `bulkDelete` が存在しない

- [ ] **Step 3: `BulkDeleteHistoryDto` を作成する**

```typescript
// backend/src/history/dto/bulk-delete-history.dto.ts
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class BulkDeleteHistoryDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  ids!: string[];
}
```

- [ ] **Step 4: `ScanHistoryRepository.deleteManyByIds()` を追加する**

`backend/src/history/scan-history.repository.ts` の `deleteById()` メソッドの後に追加:

```typescript
/**
 * 指定した ID リストのうち、userId が一致するレコードを一括削除する。
 * 他ユーザーの ID が混入しても user_id 条件で安全に除外される。
 */
async deleteManyByIds(userId: string, ids: string[]): Promise<void> {
  await this.prisma.scanHistory.deleteMany({
    where: {
      id: { in: ids },
      userId,
    },
  });
}
```

- [ ] **Step 5: `HistoryService.bulkDelete()` を追加する**

`history.service.ts` の `deleteHistory()` メソッドの後に追加:

```typescript
/**
 * 指定した ID リストのスキャン履歴を一括削除する。
 * userId 条件を必ず付けて他ユーザーのデータを操作しない。
 * ids が空の場合はDBアクセスなしで即返却する。
 */
async bulkDelete(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await this.scanHistoryRepository.deleteManyByIds(userId, ids);
  this.logger.log(`一括削除: userId=${userId}, count=${ids.length}`);
}
```

- [ ] **Step 6: `HistoryController.bulkDelete()` を追加する**

`history.controller.ts` の import に追加:

```typescript
import { BulkDeleteHistoryDto } from './dto/bulk-delete-history.dto';
```

`deleteHistory()` メソッドの後に追加:

```typescript
/** DELETE /history/bulk: 指定した ID リストのスキャン履歴を一括削除する。 */
@Delete('bulk')
@HttpCode(HttpStatus.NO_CONTENT)
async bulkDeleteHistory(
  @Req() req: AuthRequest,
  @Body() body: BulkDeleteHistoryDto,
): Promise<void> {
  await this.historyService.bulkDelete(req.user.sub, body.ids);
}
```

**重要:** `@Delete('bulk')` は `@Delete(':id')` より前に配置すること（NestJS のルーティング優先度のため）。

- [ ] **Step 7: テストがパスすることを確認する**

```bash
pnpm --filter backend test history.service history.controller
```

Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add backend/src/history/dto/bulk-delete-history.dto.ts \
        backend/src/history/scan-history.repository.ts \
        backend/src/history/history.service.ts \
        backend/src/history/history.controller.ts \
        backend/src/history/history.service.spec.ts \
        backend/src/history/history.controller.spec.ts
git commit -m "feat: add DELETE /history/bulk endpoint for batch deletion"
```

---

## Task 6: フロントエンド — 一括削除API + 履歴 i18n キー

**Files:**
- Modify: `frontend/src/lib/api/history.api.ts`
- Modify: `frontend/public/locales/ja/history.json`
- Modify: `frontend/public/locales/en/history.json`

- [ ] **Step 1: `bulkDeleteHistory` を `history.api.ts` に追加する**

```typescript
// frontend/src/lib/api/history.api.ts の末尾に追加
export const bulkDeleteHistory = async (ids: string[]): Promise<void> => {
  await apiFetch('/history/bulk', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  })
}
```

- [ ] **Step 2: `ja/history.json` に新 i18n キーを追加する**

既存の `editModal` オブジェクトに `thumbnail` と `retake` キーを追加:

```json
"editModal": {
  "title": "履歴を編集",
  "productName": "商品名",
  "storeName": "店舗名",
  "memo": "メモ",
  "thumbnail": "サムネイル",
  "retake": "再撮影",
  "save": "保存",
  "cancel": "キャンセル"
},
```

ファイル末尾の `}` の前に `select` オブジェクトを追加:

```json
"select": {
  "enter": "選択",
  "cancel": "キャンセル",
  "count": "{n}件選択中",
  "selectAll": "全選択",
  "delete": "削除（{n}件）",
  "confirmDelete": "{n}件の履歴を削除しますか？この操作は取り消せません。"
}
```

- [ ] **Step 3: `en/history.json` に新 i18n キーを追加する**

```json
"editModal": {
  "title": "Edit History",
  "productName": "Product Name",
  "storeName": "Store Name",
  "memo": "Memo",
  "thumbnail": "Thumbnail",
  "retake": "Retake",
  "save": "Save",
  "cancel": "Cancel"
},
```

```json
"select": {
  "enter": "Select",
  "cancel": "Cancel",
  "count": "{n} selected",
  "selectAll": "Select all",
  "delete": "Delete ({n})",
  "confirmDelete": "Delete {n} items? This action cannot be undone."
}
```

- [ ] **Step 4: 型チェックが通ることを確認する**

```bash
pnpm --filter frontend typecheck
```

Expected: no errors

- [ ] **Step 5: コミット**

```bash
git add frontend/src/lib/api/history.api.ts \
        frontend/public/locales/ja/history.json \
        frontend/public/locales/en/history.json
git commit -m "feat: add bulkDeleteHistory API and i18n keys for select mode"
```

---

## Task 7: フロントエンド — 履歴ページ選択モード UI

**Files:**
- Modify: `frontend/src/app/history/page.tsx`
- Modify: `frontend/src/components/organisms/HistoryCard.tsx`

- [ ] **Step 1: `HistoryCard` に選択モード props を追加する**

`frontend/src/components/organisms/HistoryCard.tsx`:

```typescript
type HistoryCardProps = {
  item: HistoryItem
  isOwner?: boolean
  onEdit?: (item: HistoryItem) => void
  onDelete?: (id: string) => Promise<void>
  isSelectMode?: boolean     // 追加
  isSelected?: boolean       // 追加
  onSelect?: (id: string) => void  // 追加
}

export const HistoryCard = ({
  item,
  isOwner = false,
  onEdit,
  onDelete,
  isSelectMode = false,
  isSelected = false,
  onSelect,
}: HistoryCardProps) => {
```

カード全体の `<div>` を以下に変更（タップ時に選択モードで `onSelect` を呼ぶ）:

```tsx
<div
  className={`bg-white rounded-xl shadow-sm border px-4 py-3 space-y-2 transition-colors ${
    isSelectMode
      ? isSelected
        ? 'border-blue-500 bg-blue-50 cursor-pointer'
        : 'border-gray-100 cursor-pointer'
      : 'border-gray-100'
  }`}
  onClick={isSelectMode ? () => onSelect?.(item.id) : undefined}
>
```

カードの左端（サムネイルの左）にチェックボックスを追加する。`<div className="flex items-start gap-3">` の先頭に追加:

```tsx
{isSelectMode && (
  <input
    type="checkbox"
    checked={isSelected}
    onChange={() => onSelect?.(item.id)}
    onClick={(e) => e.stopPropagation()}
    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
    aria-label={item.productName ?? item.id}
  />
)}
```

- [ ] **Step 2: `history/page.tsx` に選択モード状態を追加する**

import に追加:

```typescript
import { bulkDeleteHistory } from '@/lib/api/history.api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
```

`useHistory()` 呼び出しの後に選択モード状態を追加:

```typescript
const [isSelectMode, setIsSelectMode] = useState(false)
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
const queryClient = useQueryClient()

const bulkDeleteMutation = useMutation<void, Error, string[]>({
  mutationFn: bulkDeleteHistory,
  onSuccess: () => {
    setIsSelectMode(false)
    setSelectedIds(new Set())
    void queryClient.invalidateQueries({ queryKey: ['history'] })
  },
})

const handleToggleSelect = (id: string) => {
  setSelectedIds((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
}

const handleSelectAll = () => {
  setSelectedIds(new Set(myItems.map((item) => item.id)))
}

const handleBulkDelete = () => {
  const ids = [...selectedIds]
  if (ids.length === 0) return
  const confirmed = window.confirm(t('select.confirmDelete', { n: ids.length }))
  if (!confirmed) return
  bulkDeleteMutation.mutate(ids)
}

const handleEnterSelectMode = () => {
  setIsSelectMode(true)
  setSelectedIds(new Set())
}

const handleExitSelectMode = () => {
  setIsSelectMode(false)
  setSelectedIds(new Set())
}
```

- [ ] **Step 3: 自分のスキャンタブのヘッダー行を更新する**

フィルタタブの `<div className="flex gap-2 mb-4 overflow-x-auto">` の前に、選択モードに応じたヘッダー行を追加:

```tsx
{/* 選択モード切り替えヘッダー */}
{!isSelectMode ? (
  <div className="flex items-center justify-between mb-2">
    <div className="flex gap-2 overflow-x-auto">
      {FILTER_TAB_VALUES.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setFilter(value)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filter === value
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {t(`filter.${value}`)}
        </button>
      ))}
    </div>
    <button
      type="button"
      onClick={handleEnterSelectMode}
      className="shrink-0 ml-2 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-600"
    >
      {t('select.enter')}
    </button>
  </div>
) : (
  <div className="flex items-center justify-between mb-2">
    <button
      type="button"
      onClick={handleExitSelectMode}
      className="text-sm text-gray-500"
    >
      {t('select.cancel')}
    </button>
    <span className="text-sm font-medium text-gray-700">
      {t('select.count', { n: selectedIds.size })}
    </span>
    <button
      type="button"
      onClick={handleSelectAll}
      className="text-sm text-blue-600"
    >
      {t('select.selectAll')}
    </button>
  </div>
)}
```

既存のフィルタタブ `<div className="flex gap-2 mb-4 overflow-x-auto">` のブロックは選択モード非表示のヘッダー内に移動済みなので削除する（上記で統合したため）。

- [ ] **Step 4: `HistoryCard` に選択モード props を渡す**

`myItems.map()` の `<HistoryCard>` に追加:

```tsx
<HistoryCard
  item={item}
  isOwner={item.userId === userId}
  onEdit={isSelectMode ? undefined : handleEditOpen}
  onDelete={isSelectMode ? undefined : handleDelete}
  isSelectMode={isSelectMode}
  isSelected={selectedIds.has(item.id)}
  onSelect={handleToggleSelect}
/>
```

- [ ] **Step 5: 画面下部固定削除バーを追加する**

`</main>` の直前（編集モーダルの後）に追加:

```tsx
{/* 選択モード: 画面下部固定削除バー */}
{isSelectMode && (
  <div className="fixed bottom-16 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3 lg:bottom-0">
    <button
      type="button"
      onClick={handleBulkDelete}
      disabled={selectedIds.size === 0 || bulkDeleteMutation.isPending}
      className="w-full py-3 rounded-xl bg-red-500 text-white text-sm font-medium
        disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {bulkDeleteMutation.isPending
        ? t('loading')
        : t('select.delete', { n: selectedIds.size })}
    </button>
  </div>
)}
```

- [ ] **Step 6: 型チェックが通ることを確認する**

```bash
pnpm --filter frontend typecheck
```

Expected: no errors

- [ ] **Step 7: コミット**

```bash
git add frontend/src/app/history/page.tsx \
        frontend/src/components/organisms/HistoryCard.tsx
git commit -m "feat: add bulk delete selection mode to history page"
```

---

## Task 8: フロントエンド — 編集モーダルサムネイル再撮影

**Files:**
- Create: `frontend/src/components/organisms/ThumbnailCameraModal.tsx`
- Modify: `frontend/src/app/history/page.tsx`

- [ ] **Step 1: `ThumbnailCameraModal` コンポーネントを作成する**

```typescript
// frontend/src/components/organisms/ThumbnailCameraModal.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useCamera } from '@/hooks/useCamera'
import { generateThumbnail } from '@/lib/thumbnail'
import { getPresignedUrl, uploadToS3, getPublicUrlFromPresigned } from '@/lib/api/scan.api'

type Props = {
  isOpen: boolean
  onClose: () => void
  onCaptured: (url: string) => void
}

export const ThumbnailCameraModal = ({ isOpen, onClose, onCaptured }: Props) => {
  const t = useTranslations('scan')
  const { videoRef, captureFrame, startCamera, stopCamera } = useCamera()
  const [step, setStep] = useState<'camera' | 'preview'>('camera')
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      setStep('camera')
      setPreviewDataUrl(null)
      void startCamera()
    } else {
      stopCamera()
    }
  }, [isOpen, startCamera, stopCamera])

  const handleCapture = () => {
    const frame = captureFrame()
    if (!frame) return
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    const canvas = canvasRef.current
    canvas.width = frame.width
    canvas.height = frame.height
    canvas.getContext('2d')!.putImageData(frame, 0, 0)
    setPreviewDataUrl(canvas.toDataURL('image/jpeg', 0.9))
    setStep('preview')
  }

  const handleRetake = () => {
    setStep('camera')
    setPreviewDataUrl(null)
  }

  const handleConfirm = async () => {
    if (!previewDataUrl) return
    setIsUploading(true)
    try {
      const thumbBlob = await generateThumbnail(previewDataUrl)
      const { url: presignedUrl } = await getPresignedUrl()
      await uploadToS3(presignedUrl, thumbBlob)
      onCaptured(getPublicUrlFromPresigned(presignedUrl))
      onClose()
    } catch {
      onClose()
    } finally {
      setIsUploading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      {/* カメラ / プレビュー */}
      {step === 'camera' ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="flex-1 w-full object-cover"
          />
          <div className="flex items-center justify-around p-6 bg-black/80">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl border border-white/40 text-white text-sm"
            >
              {t('preview.retake')}
            </button>
            <button
              type="button"
              onClick={handleCapture}
              aria-label={t('capture')}
              className="h-16 w-16 rounded-full border-4 border-white bg-white/20"
            >
              <span className="text-2xl">📷</span>
            </button>
            <div className="w-20" />
          </div>
        </>
      ) : (
        <>
          {previewDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewDataUrl}
              alt=""
              className="flex-1 w-full object-contain bg-black"
            />
          )}
          <div className="flex items-center justify-around p-6 bg-black/80">
            <button
              type="button"
              onClick={handleRetake}
              disabled={isUploading}
              className="px-5 py-2 rounded-xl border border-white/40 text-white text-sm disabled:opacity-50"
            >
              {t('preview.retake')}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={isUploading}
              className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {isUploading ? '...' : t('preview.confirm')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: `history/page.tsx` の `EditFormData` に `thumbnail_url` を追加する**

```typescript
type EditFormData = {
  product_name: string
  store_name: string
  memo: string
  is_public: boolean
  thumbnail_url: string | null  // 追加
}
```

- [ ] **Step 3: `handleEditOpen` と `handleEditClose` を更新する**

```typescript
const handleEditOpen = (item: HistoryItem) => {
  setEditingItem(item)
  setEditForm({
    product_name: item.productName ?? '',
    store_name: item.location?.store_name ?? '',
    memo: item.memo ?? '',
    is_public: item.is_public,
    thumbnail_url: item.thumbnail_url,  // 追加
  })
}

const handleEditClose = () => {
  setEditingItem(null)
  setEditForm({
    product_name: '',
    store_name: '',
    memo: '',
    is_public: false,
    thumbnail_url: null,  // 追加
  })
  setShowThumbnailCamera(false)  // 後のステップで追加
}
```

- [ ] **Step 4: `showThumbnailCamera` 状態と `ThumbnailCameraModal` を追加する**

import に追加:

```typescript
import { ThumbnailCameraModal } from '@/components/organisms/ThumbnailCameraModal'
```

`editingItem` / `editForm` の state 宣言の後に追加:

```typescript
const [showThumbnailCamera, setShowThumbnailCamera] = useState(false)
```

- [ ] **Step 5: `handleEditSave` に `thumbnail_url` を含める**

```typescript
const handleEditSave = () => {
  if (!editingItem) return
  updateHistoryMutation.mutate(
    {
      id: editingItem.id,
      product_name: editForm.product_name || null,
      store_name: editForm.store_name || null,
      memo: editForm.memo || null,
      is_public: editForm.is_public,
      thumbnail_url: editForm.thumbnail_url,  // 追加
    },
    { onSuccess: handleEditClose },
  )
}
```

- [ ] **Step 6: 編集モーダルにサムネイル欄を追加する**

`<div className="space-y-3">` 内の先頭（商品名フィールドの前）に追加:

```tsx
{/* サムネイル */}
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    {t('editModal.thumbnail')}
  </label>
  <div className="flex items-center gap-3">
    {editForm.thumbnail_url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={editForm.thumbnail_url}
        alt=""
        className="h-16 w-16 rounded object-cover shrink-0"
      />
    ) : (
      <div className="h-16 w-16 rounded bg-gray-100 shrink-0" />
    )}
    <button
      type="button"
      onClick={() => setShowThumbnailCamera(true)}
      className="text-sm text-blue-600 hover:text-blue-800"
    >
      {t('editModal.retake')}
    </button>
  </div>
</div>
```

- [ ] **Step 7: `ThumbnailCameraModal` を編集モーダルの外側（`</main>` の前）に配置する**

```tsx
{/* サムネイル再撮影モーダル */}
<ThumbnailCameraModal
  isOpen={showThumbnailCamera}
  onClose={() => setShowThumbnailCamera(false)}
  onCaptured={(url) => {
    setEditForm((prev) => ({ ...prev, thumbnail_url: url }))
    setShowThumbnailCamera(false)
  }}
/>
```

- [ ] **Step 8: 型チェックが通ることを確認する**

```bash
pnpm --filter frontend typecheck
```

Expected: no errors

- [ ] **Step 9: コミット**

```bash
git add frontend/src/components/organisms/ThumbnailCameraModal.tsx \
        frontend/src/app/history/page.tsx
git commit -m "feat: add thumbnail retake in history edit modal"
```

---

## セルフレビュー

### 仕様カバレッジ

| 要件 | 対応タスク |
|---|---|
| スキャン時にサムネイル自動保存（OCRと並列・レスポンス時間に影響なし） | Task 1 + Task 3 |
| 履歴編集モーダルでサムネイルをカメラ再撮影で更新 | Task 8 |
| 解析中に「商品を離しても大丈夫です」を常時表示 | Task 2 |
| 履歴の複数選択（チェックボックス、フィルター連動） | Task 7 |
| 一括削除（確認ダイアログ + 削除） | Task 5 + Task 7 |
| 全選択ボタン（副次的） | Task 7 |
| i18n（ja/en） | Task 6 |
| `is_public` が PATCH /history/:id で保存できていなかった問題 | Task 4 |
| `isPublic` が GET /history で返されていなかった問題 | Task 4 |

### プレースホルダースキャン

すべてのステップに具体的なコードを記載済み。"TBD" なし。

### 型一貫性

- `generateThumbnail(dataUrl: string): Promise<Blob>` — Task 1 で定義、Task 3 と Task 8 で使用
- `getPublicUrlFromPresigned(url: string): string` — Task 3 で定義、Task 8 で使用
- `BulkDeleteHistoryDto.ids: string[]` — Task 5 で定義、Task 6/7 のフロントの `Set<string>` を `[...selectedIds]` で変換
- `ScanHistoryRecord.isPublic: boolean` — Task 4 で追加、`HistoryItem.is_public` と一致
- `EditFormData.thumbnail_url: string | null` — Task 8 で追加、`PatchHistoryBody.thumbnail_url` と一致

### セキュリティ確認

- `DELETE /history/bulk` は `userId` 条件必須（`deleteManyByIds` 参照）
- `ThumbnailCameraModal` は `onCaptured` を通じてのみ URL を外部に渡す（直接 fetch 呼び出しなし）
- `thumbnail_url` の `@IsUrl()` バリデーションあり（DTO）
