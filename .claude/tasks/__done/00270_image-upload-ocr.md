---
id: "00270"
title: 画像アップロードからの OCR 解析
status: completed
created: "2026-05-22"
completed_date: "2026-05-22"
---

## Requirements

スキャンページにファイル選択ボタンを追加し、カメラ撮影の代わりにギャラリーや
ファイルシステムから選んだ画像を OCR 解析できるようにする。

**バックエンド変更なし**。既存の `fetchPresignedUrl` → S3 PUT → `scanOcrStream`
パイプラインをそのまま再利用する。

### 機能詳細

1. スキャンページ（`scan/page.tsx`）の手動キャプチャボタン付近に
   「画像から解析」ボタンを追加する。
2. ボタン押下時、`<input type="file" accept="image/*">` を `.click()` してファイルを選択させる。
   - `capture` 属性は**付けない**（スマホでもギャラリーからの選択を許可するため）
3. ファイル選択後の処理フロー:
   - `useScan` の `uploadAndScanImage(file: File)` 関数（新規追加）を呼ぶ
   - `dispatch({ type: 'PROCESSING' })` に遷移
   - `File` → Canvas 経由で `ImageData` に変換（`OCR_MAX_DIMENSION` でリサイズ）
   - `preprocessFrame` を適用
   - `fetchPresignedUrl` → `putS3` → `scanOcrStream` → `dispatch RESULT` または `dispatch ERROR`
   - 成功後は既存の `buildHistoryBody` + `saveHistory` で履歴保存

### UI 配置

```
[手動キャプチャボタン]
[画像から解析ボタン]  ← 新規追加（手動キャプチャボタンの下）
```

- 表示条件: `scanState === 'detecting' || scanState === 'idle'`
  （手動キャプチャボタンと同じ `showManualButton` 条件）

### i18n

`frontend/public/locales/ja/scan.json` と `en/scan.json` に追加:

```json
"camera": {
  "uploadButton": "画像から解析" // ja
  "uploadButton": "Analyze from image" // en
}
```

既存の `camera` セクションに追記する。

## Completion criteria

- [ ] `scan/page.tsx` に「画像から解析」ボタンが追加されている
- [ ] ボタン押下時、ファイル選択ダイアログが開く（`input[type=file]` の `.click()`）
- [ ] `capture` 属性が `input` に付いていない
- [ ] ファイル選択後、`scanState` が `processing` に遷移する
- [ ] OCR 成功後、`scanState` が `result` に遷移し `ResultCard` が表示される
- [ ] OCR 失敗時、`scanState` が `idle` に遷移しエラーが表示される
- [ ] 履歴が保存される（`saveHistory` 呼び出し）
- [ ] `uploadButton` i18n キーが ja/en 両方に存在する
- [ ] UI テキストがハードコードされていない（`t('camera.uploadButton')` を使う）
- [ ] `pnpm -r typecheck` が 0 件エラー
- [ ] `pnpm -r test` が全 PASS

## Implementation summary

### Phase 1: i18n キー追加
- `frontend/public/locales/ja/scan.json` の `camera` セクションに `"uploadButton": "画像から解析"` を追加（L46）
- `frontend/public/locales/en/scan.json` の `camera` セクションに `"uploadButton": "Analyze from image"` を追加（L46）

### Phase 2: useScan.ts — uploadAndScanImage 実装
- `UseScanReturn` 型に `uploadAndScanImage: (file: File) => Promise<void>` を追加（L109）
- `uploadAndScanImage` 関数を `manualCapture` の直後に実装（L400-L430）
  - `createImageBitmap(file)` で File → ImageBitmap 変換
  - Canvas 経由で OCR_MAX_DIMENSION にリサイズ → `getImageData` → `runOcrFlow` に委譲
  - catch 時は `dispatch({ type: 'ERROR', error: 'api_error' })`（api_error → idle 遷移）
- return 文に `uploadAndScanImage` を追加（L466）

### Phase 3: scan/page.tsx — UI 追加
- `useRef` を React imports に追加（L3）
- `useTranslations` を `next-intl` から import（L4）
- `useScan()` の destructuring に `uploadAndScanImage` を追加（L18）
- `const fileInputRef = useRef<HTMLInputElement | null>(null)` を追加（L23）
- hidden file input を追加（L52-L63）: `type="file"`, `accept="image/*"`, `capture` 属性なし
  - `onChange` で `uploadAndScanImage(file)` 呼び出し + `e.target.value = ''` でリセット
- `showManualButton` 条件下に「画像から解析」ボタンを追加（L79-L89）: `t('camera.uploadButton')` を使用

### Phase 4: useScan.spec.ts — テスト追加
- `describe('useScan - uploadAndScanImage')` ブロックを追加（L492-L590）
- `global.createImageBitmap` をモック（jsdom 非対応のため）
- テスト1: OCR 成功時に `scanState` が `result` に遷移することを検証
- テスト2: OCR ストリームがエラーを返した場合に `scanState` が `idle` に遷移することを検証

## Plan deviation

none

## Review comments

<!-- evaluator が記入 -->
