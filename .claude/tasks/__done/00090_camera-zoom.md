# Task 00090: Camera Zoom（ハードウェアズーム・デジタルズームフォールバック・ピンチ操作・スライダー UI）

| Field | Value |
|-------|-------|
| Status | completed |
| Created | 2026-05-17 |
| completed_date | 2026-05-18 |
| Depends on | 00040 (Scan Frontend Hooks), 00050 (Scan Frontend UI) |

---

## Background

`frontend/src/hooks/useCamera.ts`（L1–92）は Week1（00040）で実装済みであり、`getUserMedia`・`captureFrame`・`startCamera`・`stopCamera` を提供している。現在ズーム機能は存在しない。

`frontend/src/components/CameraView.tsx`（L1–20）は `videoRef` を受け取り `<video>` を描画するだけで、ズーム UI を持たない。

`frontend/src/app/scan/page.tsx`（L1–29）は `useScan` から `videoRef` を受け取り `<CameraView videoRef={videoRef} />` に渡している。

スキャン対象（惣菜・原材料ラベル）は小さい文字が多く、遠距離からでは OCR 精度が低下する。ズーム機能を追加することでユーザーが適切な距離・倍率でラベルを捉えられるようにする。

---

## Requirements

- R1: `useCamera` フックが `zoomLevel`（現在の倍率）・`setZoom`（倍率設定関数）・`supportsHardwareZoom`（ハードウェアズーム対応フラグ）を返す
- R2: ハードウェアズームが利用可能な場合（`MediaStreamTrack.getCapabilities().zoom` が存在する環境）は `MediaStreamTrack.applyConstraints({ advanced: [{ zoom }] })` で光学ズームを適用する
- R3: ハードウェアズームが利用不可の場合（iOS Safari 等）は、`CameraView` の `<video>` 要素に `transform: scale(zoomLevel)` を CSS で適用してデジタルズームとする
- R4: ピンチジェスチャー（`touchstart` / `touchmove` 2本指距離変化）でズームレベルを変化させる。最小値 1.0・最大値 5.0 の範囲にクランプする
- R5: `CameraView` の下部にズームスライダーを表示する。`min=1`・`max=5`・`step=0.1`・デフォルト値 `1.0`
- R6: ズームロジック（ハードウェア判定・applyConstraints 呼び出し・デジタルズーム切り替え・ピンチ距離計算）はすべて `useCamera.ts` に閉じ込める。`CameraView.tsx` や `page.tsx` にズームロジックを書かない
- R7: `useCamera` の既存インターフェース（`videoRef`・`captureFrame`・`startCamera`・`stopCamera`）の型シグネチャを変更しない（後方互換を維持する）
- R8: iOS で `navigator.mediaDevices.getSupportedConstraints().zoom` が `false` または `undefined` の場合、ハードウェアズームを試行せずデジタルズームへ自動フォールバックする
- R9: `as any` / `@ts-ignore` を使用しない
- R10: `console.log` を書かない

---

## Implementation plan

### Phase 1: `useCamera.ts` — ズーム状態とハードウェアズーム判定

- ズームレベルの状態管理（useState）と `supportsHardwareZoom` フラグの判定ロジックを追加する
- `startCamera` 内でストリーム取得後に `MediaStreamTrack.getCapabilities()` を参照し `supportsHardwareZoom` を確定する
- `setZoom(level: number)` 関数を追加する。ハードウェア対応時は `applyConstraints`、非対応時は内部状態の更新のみ行い CSS 側に委ねる
- `zoom` 能力は非標準プロパティのため、型定義に含まれない。`TBD（generator 確認）` — 型アサーションなしに安全に参照する方法（例: `'zoom' in capabilities` ガード）を generator が選択する

### Phase 2: `useCamera.ts` — ピンチジェスチャー検出

- 2本指の `touchstart` / `touchmove` イベントで指間距離を計算し `setZoom` を呼ぶロジックを `useCamera.ts` 内にカプセル化する
- ズームレベルのクランプ（最小 1.0・最大 5.0）はこの層で行う
- イベントリスナーのアタッチ先（`videoRef.current` or `window`）は generator が実装可能性を判断して選択する（TBD）
- アンマウント時にリスナーを確実に解除する

### Phase 3: `CameraView.tsx` — デジタルズーム CSS 適用とスライダー UI

- `CameraView` の Props に `zoomLevel: number`・`supportsHardwareZoom: boolean`・`onZoomChange: (level: number) => void` を追加する
- `supportsHardwareZoom === false` のとき `<video>` 要素に `transform: scale(${zoomLevel})` スタイルを適用する（`transform-origin: center center`）
- スライダー `<input type="range">` を `CameraView` の下部に配置する。`min=1`・`max=5`・`step=0.1`・`value={zoomLevel}` とし、`onChange` で `onZoomChange` を呼ぶ

### Phase 4: `scan/page.tsx` — Props 接続

- `useScan` または `useCamera` から `zoomLevel`・`supportsHardwareZoom`・`setZoom` を受け取り `CameraView` に渡す
- `useScan` が `useCamera` を内部利用しているため、`useScan` の戻り値にズーム関連値を追加するか、`page.tsx` で `useCamera` を直接呼ぶかは generator がアーキテクチャ上の干渉を確認して判断する（TBD）

### Phase 5: 定数整備とテスト追加

- `ZOOM_MIN`・`ZOOM_MAX`・`ZOOM_STEP`・`ZOOM_DEFAULT` を `scan.constants.ts` またはカメラ専用定数ファイルに定義する（マジックナンバー禁止）
- `useCamera` のズーム機能に対するユニットテストを追加する

---

## Files to modify

| File | Action |
|------|--------|
| `frontend/src/hooks/useCamera.ts` | ズーム状態・ハードウェア判定・applyConstraints・ピンチ検出を追加 |
| `frontend/src/components/CameraView.tsx` | Props に zoom 系を追加・デジタルズーム CSS 適用・スライダー UI 追加 |
| `frontend/src/app/scan/page.tsx` | CameraView にズーム Props を渡す接続を追加 |
| `frontend/src/app/scan/scan.constants.ts` | `ZOOM_MIN`・`ZOOM_MAX`・`ZOOM_STEP`・`ZOOM_DEFAULT` 定数を追加 |
| `frontend/src/hooks/useCamera.spec.ts`（新規） | ズーム機能のユニットテスト |

---

## Tests to add

### useCamera.spec.ts（新規）

| シナリオ | 期待結果 |
|----------|----------|
| `getCapabilities().zoom` が存在する環境で `setZoom(2)` を呼ぶ | `applyConstraints` が `{ advanced: [{ zoom: 2 }] }` で 1 回呼ばれる |
| `getCapabilities().zoom` が存在しない環境で `setZoom(2)` を呼ぶ | `applyConstraints` が呼ばれず `zoomLevel` が 2 になる |
| `setZoom(0.5)` を呼ぶ | `zoomLevel` が 1.0（最小値クランプ）になる |
| `setZoom(6)` を呼ぶ | `zoomLevel` が 5.0（最大値クランプ）になる |

---

## Completion criteria

- [ ] `frontend/src/hooks/useCamera.ts` が `zoomLevel`・`setZoom`・`supportsHardwareZoom` をエクスポートしている（`grep "zoomLevel\|setZoom\|supportsHardwareZoom" frontend/src/hooks/useCamera.ts` でヒット件数 3 以上）
- [ ] `frontend/src/hooks/useCamera.ts` に `applyConstraints` の呼び出しコードが存在する（`grep "applyConstraints" frontend/src/hooks/useCamera.ts` でヒット）
- [ ] `frontend/src/hooks/useCamera.ts` に `touchstart` および `touchmove` のイベントリスナー登録コードが存在する（`grep "touchstart\|touchmove" frontend/src/hooks/useCamera.ts` でヒット件数 2 以上）
- [ ] `frontend/src/components/CameraView.tsx` の Props に `zoomLevel`・`supportsHardwareZoom`・`onZoomChange` が定義されている（`grep "zoomLevel\|supportsHardwareZoom\|onZoomChange" frontend/src/components/CameraView.tsx` でヒット件数 3 以上）
- [ ] `frontend/src/components/CameraView.tsx` に `type="range"` のスライダーが存在し `min="1"` `max="5"` `step="0.1"` を持つ（`grep 'type="range"' frontend/src/components/CameraView.tsx` でヒット、かつ `grep 'min="1".*max="5"\|min.*max' frontend/src/components/CameraView.tsx` でヒット）
- [ ] `frontend/src/components/CameraView.tsx` に `transform: scale` または `transform:scale` を含むコードが存在する（`grep "scale" frontend/src/components/CameraView.tsx` でヒット）
- [ ] `frontend/src/app/scan/scan.constants.ts` に `ZOOM_MIN`・`ZOOM_MAX`・`ZOOM_STEP`・`ZOOM_DEFAULT` が定義されている（`grep "ZOOM_MIN\|ZOOM_MAX\|ZOOM_STEP\|ZOOM_DEFAULT" frontend/src/app/scan/scan.constants.ts` でヒット件数 4）
- [ ] ズームレベルのクランプに `1.0` や `5.0` のマジックナンバーが直書きされておらず定数経由になっている（`grep "ZOOM_MIN\|ZOOM_MAX" frontend/src/hooks/useCamera.ts` でヒット）
- [ ] `frontend/src/hooks/useCamera.ts` の既存の戻り値（`videoRef`・`captureFrame`・`startCamera`・`stopCamera`）が削除されていない（`grep "videoRef\|captureFrame\|startCamera\|stopCamera" frontend/src/hooks/useCamera.ts` でヒット件数 4 以上）
- [ ] `as any` が変更ファイルに含まれない（`grep -r "as any" frontend/src/hooks/useCamera.ts frontend/src/components/CameraView.tsx frontend/src/app/scan/page.tsx` でヒット件数 0）
- [ ] `console.log` が変更ファイルに含まれない（`grep -r "console\.log" frontend/src/hooks/useCamera.ts frontend/src/components/CameraView.tsx` でヒット件数 0）
- [ ] `pnpm --filter frontend typecheck` がエラー 0件で終了する
- [ ] `pnpm --filter frontend test` で `useCamera.spec.ts` の全テストが PASS する（FAIL 0件）

---

## Risks

| リスク | 回避方針 |
|--------|----------|
| `MediaStreamTrack.getCapabilities()` の `zoom` プロパティが TypeScript の型定義に含まれない | `'zoom' in track.getCapabilities()` のようなランタイムガードで存在確認を行い、型アサーションなしで分岐する。定義が必要な場合は `interface` 拡張（`as any` 禁止） |
| iOS Safari で `touchmove` の `passive` イベントにより `preventDefault()` が警告を出す | ピンチ時のスクロール抑制が必要な場合は `{ passive: false }` で登録する。ただし抑制不要なら `passive: true` のまま設計して警告を回避する（TBD: generator が実装可能性を確認） |
| `useScan` が `useCamera` を内部で呼んでいるため、`useCamera` の戻り値拡張が `useScan` の型に波及する | `useScan` の戻り値型 `UseScanReturn` を確認し、ズーム系を追加する場合は型を明示的に更新する。`page.tsx` で `useCamera` を直接呼ぶ場合は `useScan` の変更不要 |
| デジタルズーム時の `transform: scale` が `object-cover` と干渉してレイアウトが崩れる | `transform-origin: center center` を明示し、`<video>` のコンテナに `overflow: hidden` を設定することで映像がはみ出さないよう制御する（TBD: generator が確認） |
| ピンチ操作とスライダーが同時に競合して倍率が不安定になる | どちらも同一の `setZoom` を呼ぶ設計にすることで状態は単一ソースに集約される |

---

## Implementation summary

### Phase 5（先行）: `scan.constants.ts` — ズーム定数追加（L1–5）
- `ZOOM_MIN`・`ZOOM_MAX`・`ZOOM_STEP`・`ZOOM_DEFAULT` を追加。マジックナンバー一切なし。

### Phase 1 & 2: `useCamera.ts` — ズーム状態・ハードウェア判定・ピンチジェスチャー（L1–187）
- `MediaTrackCapabilitiesWithZoom`・`MediaTrackConstraintSetWithZoom` の interface 拡張を定義（`as any` 禁止）
- `zoomLevel`（useState）、`supportsHardwareZoom`（useState）、`pinchStartDistanceRef`、`pinchStartZoomRef` を追加
- `setZoom(level)` を `useCallback` で実装: clampZoom でクランプ後、`'zoom' in capabilities` ガードで分岐し、対応時のみ `applyConstraints` を呼ぶ
- `startCamera` 内でストリーム取得後に `getSupportedConstraints().zoom` → `getCapabilities().zoom` の2段階チェックで `supportsHardwareZoom` を確定（iOS Safari フォールバック対応）
- `touchstart`・`touchmove` を `window` に `passive: true` で登録。ピンチ距離から倍率を計算して `setZoom` を呼ぶ。アンマウント時にリスナーを解除
- 既存の `videoRef`・`captureFrame`・`startCamera`・`stopCamera` の型シグネチャは変更なし（後方互換維持）

### Phase 3: `CameraView.tsx` — デジタルズーム CSS・スライダー UI（L1–55）
- Props に `zoomLevel: number`・`supportsHardwareZoom: boolean`・`onZoomChange: (level: number) => void` を追加
- `supportsHardwareZoom === false` 時に `transform: scale(${zoomLevel})` / `transformOrigin: center center` をインラインスタイルで適用
- `<video>` をラップする `<div>` に `overflow-hidden` を追加してはみ出しを制御
- `<input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP}>` スライダーを下部に配置

### Phase 4: `useScan.ts` / `scan/page.tsx` — Props 接続（L67–82 / L11–24）
- `UseScanReturn` に `zoomLevel`・`setZoom`・`supportsHardwareZoom` を追加し、`useCamera()` の戻り値から受け取って return
- `page.tsx` で `useScan()` から3値を受け取り `<CameraView>` に渡す

### Phase 5 続き: `useCamera.spec.ts` — ユニットテスト新規作成（L1–119）
- `MediaStream`・`MediaStreamTrack` を jest モックで差し替え
- ハードウェアズームあり環境: `setZoom(2)` で `applyConstraints({ advanced: [{ zoom: 2 }] })` が1回呼ばれることを検証
- ハードウェアズームなし環境: `applyConstraints` 非呼び出し・`zoomLevel === 2` を検証
- `setZoom(0.5)` → `zoomLevel === 1.0`（最小クランプ）
- `setZoom(6)` → `zoomLevel === 5.0`（最大クランプ）

---

## Plan deviation

- **Phase 実行順序の変更**: 定数整備（Phase 5）を Phase 1 より前に実施した。`useCamera.ts` 内で定数を import する必要があったため先行した。
- **`useScan.ts` の変更**: タスクの `Files to modify` に含まれていなかったが、`page.tsx` から `useCamera` のズーム値を利用するにあたり `useScan` 経由が既存アーキテクチャ（`page.tsx` は `useScan` のみ直接呼ぶ設計）と整合するため変更した。変更は戻り値への追加のみで既存機能に影響なし。

---

## Review comments

TBD（evaluator が記入）
