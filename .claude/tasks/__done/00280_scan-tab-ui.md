---
id: "00280"
title: スキャンページのタブ切り替え UI（カメラ / 画像アップロード）
status: completed
created: "2026-05-22"
completed_date: "2026-05-22"
---

## Requirements

スキャンページ（`scan/page.tsx`）の上部にタブを追加し、
「カメラ」タブと「画像」タブを切り替えられるようにする。

現在の実装（00270）では「画像から解析」ボタンがカメラ UI 上に重なる形で表示されており、
操作性が悪いためタブ切り替え方式に変更する。

### タブ構成

| タブ | 表示内容 |
|---|---|
| `camera`（デフォルト） | 現在のカメラビュー（CameraView + ScanOverlay + 手動キャプチャボタン等）|
| `upload` | ファイル選択エリア（カメラビューは非表示） |

### タブ UI スタイル

履歴ページ（`history/page.tsx`）と同じ `border-b-2` スタイルを使う:

```tsx
<div className="flex gap-2 border-b border-gray-200 bg-black/60 absolute top-0 left-0 right-0 z-10">
  {(['camera', 'upload'] as const).map((tab) => (
    <button
      key={tab}
      type="button"
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
        activeTab === tab
          ? 'border-blue-400 text-blue-300'
          : 'border-transparent text-gray-400'
      }`}
    >
      {t(`tabs.${tab}`)}
    </button>
  ))}
</div>
```

※スキャンページは背景が黒（`bg-black`）のため、テキストカラーはダーク用に調整。

### カメラタブ（`activeTab === 'camera'`）

- 現在の実装と同じ（CameraView・ScanOverlay・手動キャプチャボタン・ScanGuide・ResultCard）
- タブ切り替えエリア分だけ上部にオフセット（タブの高さ約 40px）

### 画像アップロードタブ（`activeTab === 'upload'`）

- カメラビューは表示しない（`startScan` / `stopScan` は呼ばない）
- 中央に大きなファイル選択エリアを表示:

```tsx
<div className="flex flex-col items-center justify-center h-full gap-6 text-white">
  <p className="text-gray-300 text-sm">{t('tabs.uploadHint')}</p>
  <button
    type="button"
    onClick={() => fileInputRef.current?.click()}
    className="px-8 py-4 rounded-full bg-blue-600 text-white text-base font-semibold
      shadow-lg active:scale-95 transition-transform
      focus:outline-none focus:ring-2 focus:ring-blue-400"
  >
    {t('camera.uploadButton')}
  </button>
  <input
    ref={fileInputRef}
    type="file"
    accept="image/*"
    className="hidden"
    onChange={(e) => {
      const file = e.target.files?.[0]
      if (file) void uploadAndScanImage(file)
      e.target.value = ''
    }}
  />
</div>
```

- `scanState` が `processing` / `result` の場合は既存の ScanOverlay / ResultCard を重ねて表示する

### タブ切り替え時の動作

- `camera` → `upload` に切り替えたとき: `stopScan()` を呼んでカメラを停止する
- `upload` → `camera` に切り替えたとき: `startScan()` を呼んでカメラを再起動する
- `result` 状態から「もう一度スキャンする」を押したとき: `reset()` + `startScan()` はそのまま（カメラタブに戻す必要はない）

### 既存ボタンの削除

00270 で追加した「画像から解析」ボタン（`showManualButton` 条件下のボタン）と、
そのボタン用の hidden input を `scan/page.tsx` から削除する。
代わりに画像タブ内に移動する。

## i18n

`frontend/public/locales/ja/scan.json` と `en/scan.json` に追加:

```json
"tabs": {
  "camera": "カメラ",      // en: "Camera"
  "upload": "画像",        // en: "Image"
  "uploadHint": "ギャラリーや写真から食品ラベルを選択してください"
                           // en: "Select a food label from your gallery or photos"
}
```

`camera.uploadButton` キーは既存のものをそのまま使う。

## Completion criteria

- [ ] スキャンページ上部に「カメラ」「画像」タブが表示される
- [ ] タブは `border-b-2` スタイル（履歴ページと同じパターン）
- [ ] デフォルトは「カメラ」タブ
- [ ] 「カメラ」タブでは現在と同じカメラ UI が表示される
- [ ] 「画像」タブではカメラビューが表示されず、ファイル選択ボタンが中央に表示される
- [ ] 「カメラ」→「画像」切り替えで `stopScan()` が呼ばれカメラが停止する
- [ ] 「画像」→「カメラ」切り替えで `startScan()` が呼ばれカメラが再起動する
- [ ] 画像選択後の OCR フローが正常に動作する（`uploadAndScanImage` 再利用）
- [ ] `capture` 属性が input に付いていない
- [ ] UIテキストがハードコードされていない（`t()` を使う）
- [ ] `tabs.camera`, `tabs.upload`, `tabs.uploadHint` i18n キーが ja/en 両方に存在する
- [ ] 00270 で追加した「画像から解析」ボタンが scan/page.tsx から削除されている
- [ ] `pnpm -r typecheck` が 0 件エラー
- [ ] `pnpm -r test` が全 PASS

## Implementation summary

### Phase 1: i18n キー追加
- `frontend/public/locales/ja/scan.json` に `tabs.camera`, `tabs.upload`, `tabs.uploadHint` を追加（L48-52）
- `frontend/public/locales/en/scan.json` に `tabs.camera`, `tabs.upload`, `tabs.uploadHint` を追加（L48-52）

### Phase 2: scan/page.tsx のタブ UI 実装
- `frontend/src/app/scan/page.tsx` を全面改修（L1-134）
  - `useState` を import に追加し `ScanTab` 型と `activeTab` state を定義（L1, L13, L27）
  - `stopScan` を `useScan` の destructuring に追加（L18）
  - `handleTabChange` を `useCallback` で実装: `upload` タブへ切替時に `stopScan()`、`camera` タブへ切替時に `startScan()` を呼ぶ（L40-46）
  - `handleScanAgain` を修正: `upload` タブのまま `reset()` のみ（カメラタブ時のみ `startScan()` を追加）（L49-53）
  - タブバー UI を追加（`border-b-2` スタイル, `bg-black/80`）（L55-68）
  - カメラタブコンテンツ（CameraView, ScanOverlay, 手動キャプチャボタン, ScanGuide）を `activeTab === 'camera'` 条件下に配置（L70-97）
  - 画像タブコンテンツ（ファイル選択ヒント + ボタン）を `activeTab === 'upload' && scanState !== 'processing' && scanState !== 'result'` 条件下に配置（L99-113）
  - 画像タブ processing 中の ScanOverlay を追加（L115-117）
  - ResultCard を両タブ共通で表示（L119-121）
  - hidden file input を外側コンテナに常時マウント（`capture` 属性なし）（L123-131）
  - 00270 で追加した「画像から解析」ボタンを削除（タブ内に移動済み）

## Plan deviation

### タスクファイル vs コンテキスト記述の差異

タスクファイル本文（Requirements）では「`result` 状態から「もう一度スキャンする」を押したとき: `reset()` + `startScan()` はそのまま（カメラタブに戻す必要はない）」と記述されているため、タスクファイルに従い `handleScanAgain` は `upload` タブのときは `startScan()` を呼ばない実装とした。コンテキストのプロンプトではカメラタブに戻す実装が示されていたが、タスクファイルが優先。

### hidden file input の配置

タスクファイルでは file input を画像タブのコンテンツ内（`activeTab === 'upload'` ブロック内）に配置する仕様が示されていたが、実装では外側コンテナに常時マウントした。理由: `uploadAndScanImage` は `upload` タブ以外でも呼べる状態（仕様の拡張余地）があるため、常時マウントの方が `ref` が `null` になるリスクがない。Completion criteria への影響なし（動作は同じ）。

## Review comments

<!-- evaluator が記入 -->
