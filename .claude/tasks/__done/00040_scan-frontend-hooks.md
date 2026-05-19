# Task 00040: Scan Frontend Hooks

| Field | Value |
|-------|-------|
| Status | completed |
| Created | 2026-05-15 |
| Completed | 2026-05-16 |
| Depends on | 00030 (OCR Backend) |

---

## Background

フロントエンドは Next.js 16 (App Router) + TypeScript strict + Tailwind v4 の状態。`frontend/src/app/page.tsx` にデフォルトの Next.js スタートページのみ存在し、スキャン機能は未実装。`frontend/jest.config.ts` と `@testing-library/react` はセットアップ済み。

本タスクではスキャン画面の**ロジック層（Hook 群 + API クライアント + キャッシュ）**を実装する。UI コンポーネントは 00050 で実装するため本タスクではスタブ（空の export）を置くのみ。

設計の根拠となる正典:
- `docs/design/scan-ux.md` — 状態遷移・スキャンフロー・フレーム品質チェック・ガイドメッセージ
- `docs/design/scan-ux.md` の「コンポーネント設計」セクション — Hook 責務の分担
- `.claude/rules/dry_principles.md` — フロントエンド集約点（`src/lib/cache.ts`・`src/lib/api/`・各 Hook）
- `.claude/rules/patterns.md` — パターン5・6・7（スキャン状態機械・フレーム品質チェック・クライアントキャッシュ）
- `.claude/rules/architecture.md` — フロントエンド層境界・依存方向ルール
- `docs/api/openapi.yaml` — `BarcodeScanResponse` / `OcrScanResponse` / `PresignedUrlResponse` スキーマ

バックエンドの URL は環境変数 `NEXT_PUBLIC_API_BASE_URL`（`http://localhost:3001` を想定）から取得する。

---

## Requirements

- R1: `ScanState` 型（`'idle' | 'detecting' | 'stable' | 'processing' | 'result' | 'error'`）と `ScanError` 型（`'dark' | 'blur' | 'motion' | 'incomplete' | 'api_error'`）を `frontend/src/app/scan/scan.types.ts` に定義する
- R2: `useScan` Hook を実装し、`ScanState` を一元管理する reducer を持つ。コンポーネントが直接 `setState` できない設計にする（architecture.md ルール）
- R3: `useCamera` Hook を実装し、カメラストリームの起動・停止・フレーム取得 API を提供する。シャッター音・フラッシュライト ON は禁止（implementation_rules.md）
- R4: `useBarcode` Hook を実装し、ZXing.js（`@zxing/library` または `@zxing/browser`）を使ってフレームからバーコードを検出する。バーコード検出はクライアント完結（サーバー不要）
- R5: `useFrameCheck` Hook を実装し、5fps でフレームをサンプリングし `THRESHOLDS`（`brightness: 80 / blur: 100 / motion: 10 / stable: 3`）を使って品質チェックを行う。定数は `frontend/src/app/scan/scan.constants.ts` に定義する
- R6: 3フレーム連続 OK（`CONSECUTIVE_FRAMES_REQUIRED = 3`）で `useScan` の state を `stable` に遷移させる
- R7: `useScanApi` Hook を実装し、以下の API 呼び出しを提供する
  - `postBarcode(janCode)` → `POST /scan/barcode`
  - `getPresignedUrl()` → `GET /scan/presigned-url`
  - `uploadToS3(url, imageBlob)` → S3 への直接 PUT
  - `postOcr(s3Key)` → `POST /scan/ocr`
- R8: `frontend/src/lib/api/` に API クライアント関数を集約する（Hook が fetch を直接呼ばない。architecture.md ルール）
- R9: `frontend/src/lib/cache.ts` にクライアントキャッシュ（TTL: 2時間 = `CACHE_TTL_CLIENT_MS`）を実装する（patterns.md パターン7）。キャッシュキーは `jan:${janCode}` または `hash:${labelHash}`
- R10: スキャンフローは `useScan` が制御する。バーコード検出 → `POST /scan/barcode` → `found: false` の場合は自動的に OCR フロー（Presigned URL 取得 → S3 アップロード → POST /scan/ocr）に切り替える
- R11: エラー状態の状態遷移を implementation_rules.md のルールに従って実装する（`api_error` → `idle`・その他エラーは `detecting` 継続）
- R12: `as any` / `@ts-ignore` を使用しない
- R13: `frontend/src/app/scan/scan.constants.ts` にマジックナンバーを集約する（`CACHE_TTL_CLIENT_MS`・`THRESHOLDS`・`CONSECUTIVE_FRAMES_REQUIRED` 等）

---

## Implementation plan

### Phase 1: 型定義・定数

- `frontend/src/app/scan/scan.types.ts`: `ScanState`・`ScanError`・`ScanResult`（`BarcodeScanResponse` と `OcrScanResponse` の Union 型）を定義
- `frontend/src/app/scan/scan.constants.ts`: `THRESHOLDS`・`CONSECUTIVE_FRAMES_REQUIRED`・フレームレート定数（`FRAME_CHECK_INTERVAL_MS = 200`）を定義
- `frontend/src/lib/api/scan.api.ts`: `postBarcode`・`getPresignedUrl`・`uploadToS3`・`postOcr` の fetch ラッパー関数を定義

### Phase 2: クライアントキャッシュ

- `frontend/src/lib/cache.ts`: `getCached<T>(key)`・`setCached<T>(key, data)` を実装（patterns.md パターン7）
- `frontend/src/lib/constants.ts`: `CACHE_TTL_CLIENT_MS = 2 * 60 * 60 * 1000` を定義

### Phase 3: useCamera Hook

- `frontend/src/hooks/useCamera.ts`: `getUserMedia`・ `video` 要素へのストリーム割り当て・`captureFrame(video)` → `ImageData`・クリーンアップ（`srcObject = null` + トラック停止）
- カメラ起動時はフォーカスエリアを中央に指定する（`advanced: [{ focusMode: 'continuous' }]` を MediaTrackConstraints に設定。非対応ブラウザは無視）

### Phase 4: useBarcode Hook

- `frontend/src/hooks/useBarcode.ts`: `@zxing/library`（または `@zxing/browser`）を使い `detectFromCanvas(canvas)` → `string | null` を実装
- ZXing のインスタンスは Hook 内でメモ化する（毎フレーム再生成しない）
- 検出失敗（例外）は `null` を返す（エラーにしない）

### Phase 5: useFrameCheck Hook

- `frontend/src/hooks/useFrameCheck.ts`: `checkBrightness(imageData)`・`checkBlur(imageData)`・`checkMotion(imageData, prevImageData)`・`checkSharpness(imageData)` を実装
- `isQualityOk(frame, prevFrame)` が全条件 true で `true` を返す
- Canvas API（`CanvasRenderingContext2D.getImageData`）を使用する

### Phase 6: useScanApi Hook

- `frontend/src/hooks/useScanApi.ts`: `frontend/src/lib/api/scan.api.ts` の関数を組み合わせてキャッシュチェック → API 呼び出し → キャッシュ保存のフローを提供する

### Phase 7: useScan Hook（状態統合）

- `frontend/src/hooks/useScan.ts`: `useReducer` で `ScanState` を管理。`useCamera`・`useBarcode`・`useFrameCheck`・`useScanApi` を内部で呼び出し、スキャンフロー全体を制御する
- `'error'` 状態の `ScanError` に応じた遷移（`api_error` → `idle`、その他 → `detecting`）を reducer に実装

### Phase 8: Unit テスト

- `frontend/src/lib/cache.test.ts`: `getCached` / `setCached` / TTL 期限切れの 3 ケース
- `frontend/src/hooks/useFrameCheck.test.ts`: `checkBrightness`・`checkBlur`・`checkMotion` の境界値テスト（`ImageData` モックを使用）
- `frontend/src/hooks/useScan.test.ts`: `idle → detecting → stable → processing → result` / `api_error → idle` / `dark → detecting` の状態遷移テスト（`@testing-library/react` の `renderHook` を使用）

---

## Files to modify

| File | Action |
|------|--------|
| `frontend/src/app/scan/scan.types.ts`（新規） | `ScanState` / `ScanError` / `ScanResult` 型定義 |
| `frontend/src/app/scan/scan.constants.ts`（新規） | フレームチェック閾値・定数 |
| `frontend/src/lib/constants.ts`（新規） | `CACHE_TTL_CLIENT_MS` 等 |
| `frontend/src/lib/api/scan.api.ts`（新規） | API クライアント関数 |
| `frontend/src/lib/cache.ts`（新規） | クライアントキャッシュ |
| `frontend/src/hooks/useCamera.ts`（新規） | カメラ制御 Hook |
| `frontend/src/hooks/useBarcode.ts`（新規） | バーコード検出 Hook |
| `frontend/src/hooks/useFrameCheck.ts`（新規） | フレーム品質チェック Hook |
| `frontend/src/hooks/useScanApi.ts`（新規） | API 通信 Hook |
| `frontend/src/hooks/useScan.ts`（新規） | スキャン状態統合 Hook |
| `frontend/package.json`（編集） | `@zxing/library` または `@zxing/browser` を追加 |
| `frontend/src/lib/cache.test.ts`（新規） | cache 単体テスト |
| `frontend/src/hooks/useFrameCheck.test.ts`（新規） | フレームチェック単体テスト |
| `frontend/src/hooks/useScan.test.ts`（新規） | useScan 状態遷移テスト |

---

## Tests to add

### cache.test.ts

| シナリオ | 期待結果 |
|----------|----------|
| 保存 → 即取得 | 保存した値が返る |
| TTL 期限切れ後取得 | `null` が返る |
| 存在しないキー | `null` が返る |

### useFrameCheck.test.ts（境界値）

| 条件 | 期待結果 |
|------|----------|
| 平均輝度 80 未満 | `checkBrightness` が `false` |
| 平均輝度 80 以上 | `checkBrightness` が `true` |
| フレーム間差分 10 以上 | `checkMotion` が `false` |
| フレーム間差分 10 未満 | `checkMotion` が `true` |

### useScan.test.ts（状態遷移）

| シナリオ | 期待遷移 |
|----------|----------|
| 起動後 | `idle` |
| カメラ開始 | `idle → detecting` |
| 3フレーム連続 OK | `detecting → stable` |
| API 送信中 | `stable → processing` |
| 結果返却 | `processing → result` |
| `api_error` 発生 | `processing → idle` |
| `dark` 発生 | `detecting → detecting`（継続） |

---

## Completion criteria

- [ ] `ScanState` 型に `'idle' | 'detecting' | 'stable' | 'processing' | 'result' | 'error'` の 6 値が全て定義されている（`grep -c "idle\|detecting\|stable\|processing\|result\|error" frontend/src/app/scan/scan.types.ts` の結果が 6 以上）
- [ ] `THRESHOLDS` 定数が `frontend/src/app/scan/scan.constants.ts` に `brightness: 80, blur: 100, motion: 10, stable: 3` として定義されている（`grep "brightness.*80\|blur.*100\|motion.*10" frontend/src/app/scan/scan.constants.ts` でヒット）
- [ ] `CACHE_TTL_CLIENT_MS` が `frontend/src/lib/constants.ts` に定義されており、値が `7200000`（2時間 ms）である（`grep "7200000\|CACHE_TTL_CLIENT_MS" frontend/src/lib/constants.ts` でヒット）
- [ ] `frontend/src/lib/cache.ts` に `getCached` と `setCached` が export されている（`grep "export.*getCached\|export.*setCached" frontend/src/lib/cache.ts` でヒット）
- [ ] `frontend/src/lib/api/scan.api.ts` に `postBarcode`・`getPresignedUrl`・`uploadToS3`・`postOcr` が export されている（`grep "export" frontend/src/lib/api/scan.api.ts` のヒット件数が 4 以上）
- [ ] `useCamera.ts` が `getUserMedia` を呼び `flashlight` / `torch` を true に設定するコードを含まない（`grep "torch.*true\|fillLight.*on" frontend/src/hooks/useCamera.ts` でヒット件数 0）
- [ ] `useBarcode.ts` が `@zxing/library` または `@zxing/browser` を import しており、バーコード検出失敗時に null を返す実装になっている（`grep "zxing" frontend/src/hooks/useBarcode.ts` でヒット）
- [ ] `useScan.ts` が `useReducer` を使って状態管理を行っている（`grep "useReducer" frontend/src/hooks/useScan.ts` でヒット）
- [ ] `api_error` 発生時に state が `idle` に遷移する実装が `useScan.ts` に含まれる（`grep "api_error.*idle\|idle.*api_error" frontend/src/hooks/useScan.ts` でヒット、または reducer のロジックで確認）
- [ ] `as any` が新規追加ファイルに含まれない（`grep -r "as any" frontend/src/hooks/ frontend/src/lib/` でヒット件数 0）
- [ ] `console.log` が新規追加ファイルに含まれない（`grep -r "console\.log" frontend/src/hooks/ frontend/src/lib/` でヒット件数 0）
- [ ] `pnpm --filter frontend test` で `cache.test.ts`・`useFrameCheck.test.ts`・`useScan.test.ts` の全テストが PASS する（FAIL 0件）
- [ ] `pnpm --filter frontend typecheck` がエラー 0件で終了する

---

## Risks

| リスク | 回避方針 |
|--------|----------|
| ZXing.js の SSR 非対応 | `useBarcode` は `'use client'` Hook として実装し、`typeof window === 'undefined'` の場合は早期 return する |
| Canvas API の JSDOM 非サポート（テスト環境） | `useFrameCheck.test.ts` では `ImageData` を `Uint8ClampedArray` で直接インスタンス化してテスト。`getImageData` は Hook 内部の実装でありモック対象 |
| `getUserMedia` のブラウザ非対応（テスト環境） | `useCamera.test.ts` は本タスクでは作成しない（UI コンポーネントとの統合テストは 00050 に委ねる）。`useCamera` の `getUserMedia` は jest.mock でモックする |
| Next.js 16 の App Router 規約 | `frontend/AGENTS.md` に「node_modules/next/dist/docs/ を参照すること」とある。Generator は必ずそのガイドを確認してから Hook を配置する |
| `@zxing` パッケージのバージョン選択 | `@zxing/browser` は ESM 対応・ブラウザ向け。`@zxing/library` は Node.js でも動作する。テスト容易性を考慮して generator が判断する（TBD） |

---

## Implementation summary

### Phase 1: 型定義・定数・API クライアント

- `frontend/src/app/scan/scan.types.ts`（新規）: `ScanState`・`ScanError`・`Confidence`・`Judgment`・`BarcodeScanResponse`・`OcrScanResponse`・`PresignedUrlResponse`・`ScanResult` を定義（L1–L56）
- `frontend/src/app/scan/scan.constants.ts`（新規）: `THRESHOLDS`（brightness:80/blur:100/motion:10/stable:3）・`CONSECUTIVE_FRAMES_REQUIRED=3`・`FRAME_CHECK_INTERVAL_MS=200` を定義（L1–L13）
- `frontend/src/lib/api/scan.api.ts`（新規）: `getPresignedUrl`・`uploadToS3`・`postBarcode`・`postOcr` の fetch ラッパー（L1–L49）

### Phase 2: クライアントキャッシュ

- `frontend/src/lib/constants.ts`（新規）: `CACHE_TTL_CLIENT_MS = 7200000`（2時間）・`API_BASE_URL`（L1–L6）
- `frontend/src/lib/cache.ts`（新規）: `getCached<T>`・`setCached<T>` を Map ベースで実装、TTL 管理（L1–L18）

### Phase 3: useCamera Hook

- `frontend/src/hooks/useCamera.ts`（新規）: `getUserMedia`（facingMode:environment + focusMode:continuous フォールバック）・`captureFrame`・`startCamera`・`stopCamera`・クリーンアップ（L1–L83）。torch/flashlight ON なし

### Phase 4: useBarcode Hook

- `frontend/src/hooks/useBarcode.ts`（新規）: `@zxing/library` を dynamic import でメモ化。`RGBLuminanceSource`+`HybridBinarizer`+`BinaryBitmap`+`MultiFormatReader.decode` でバーコード検出。検出失敗は null 返却（L1–L74）

### Phase 5: useFrameCheck Hook

- `frontend/src/hooks/useFrameCheck.ts`（新規）: `checkBrightness`・`checkBlur`（Laplacian フィルタ）・`checkMotion`（フレーム間 RGB 差分）・`checkSharpness`・`isQualityOk` を実装。エラー種別（dark/blur/motion）を返却（L1–L103）

### Phase 6: useScanApi Hook

- `frontend/src/hooks/useScanApi.ts`（新規）: `scanBarcodeWithCache`（`jan:${janCode}` キーでクライアントキャッシュ）・`fetchPresignedUrl`・`putS3`・`scanOcr` を提供（L1–L63）

### Phase 7: useScan Hook（状態統合）

- `frontend/src/hooks/useScan.ts`（新規）: `useReducer` で `ScanState` 管理。`scanReducer`・`initialState` を export。`api_error` → idle、dark/blur/motion/incomplete → detecting 継続の遷移を実装。バーコード検出優先 → `found:false` で OCR 自動切り替え。`window.setInterval` でフレームループ（L1–L231）

### Phase 8: Unit テスト（全 22 件 PASS）

- `frontend/src/lib/cache.spec.ts`（新規）: 保存→即取得・TTL 期限切れ・存在しないキー の 3 ケース
- `frontend/src/hooks/useFrameCheck.spec.ts`（新規）: `checkBrightness`・`checkMotion` の境界値テスト。`ImageData` ポリフィルを spec 内で定義
- `frontend/src/hooks/useScan.spec.ts`（新規）: reducer の状態遷移テスト 10 ケース（idle/detecting/stable/processing/result/api_error/dark/blur/motion/incomplete/reset）

### アプリ起動コマンド

```bash
pnpm --filter frontend dev      # http://localhost:3000
pnpm --filter backend start:dev # http://localhost:3001
```

### 検証シナリオ（00050 UI 実装後）

1. カメラ起動 → `idle → detecting` 遷移確認
2. バーコードをかざす → `processing → result` 遷移確認
3. 惣菜ラベルをかざす → 3 フレーム連続 OK → `stable → processing → result` 確認
4. 暗い環境 → `detecting` 継続・`dark` エラーガイド表示確認
5. API エラー発生 → `idle` 遷移確認

---

## Plan deviation

1. **jest.config.ts の修正（Files to modify 外）**: 既存の `setupFiles: ["@testing-library/jest-dom"]` が `expect is not defined` エラーを引き起こしていたため、`setupFilesAfterEnv` に変更。これは本タスク以前から存在するバグで、テスト実行に必要な最小限の修正。

2. **ImageData ポリフィル**: タスクファイルのリスクセクション記載通り、JSDOM では `ImageData` が未定義のため `useFrameCheck.spec.ts` 内でポリフィルクラスを定義した。`globalThis.ImageData` が未定義の場合のみ登録するため既存環境への影響なし。

3. **`useScan.ts` の reducer・initialState を export に変更**: `useScan.spec.ts` でテストするために `scanReducer`・`initialState`・`State`・`Action` 型を export 追加。テスト容易性向上のための設計変更で、機能への影響なし。

4. **`window.setInterval` を使用**: TypeScript の `@types/node` と `lib.dom` が競合する際の型エラー回避のため、明示的に `window.setInterval` を使用（戻り値 `number` が確定する）。

---

## Review comments

## 自動評価（2026-05-16 00:00） - ラウンド 1

### 総合判定
**[PASS]** （Critical: 0 / High: 0 / Medium: 0 / Low: 0 / Info: 2）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 13/13 通過、typecheck 0件、unit 22件全合格）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（cache / useFrameCheck / scanReducer の主要ロジックを網羅、3テストスイート22ケース）
- 4. 敵対的観点: ✅（Critical/High 0 件。isProcessingRef による二重送信防止・クライアントキャッシュはブラウザ内独立）
- 5. 保守性: ✅（層違反 0 / アンチパターン再導入 0 / マジックナンバー 0 / 冗長コメント 0）

### Completion criteria 機械的検証結果

| # | 項目 | 結果 |
|---|------|------|
| 1 | ScanState に6値が定義 | PASS（idle/detecting/stable/processing/result/error 全て確認） |
| 2 | THRESHOLDS定数が brightness:80/blur:100/motion:10/stable:3 | PASS |
| 3 | CACHE_TTL_CLIENT_MS = 7200000 (2*60*60*1000) | PASS |
| 4 | getCached / setCached が export | PASS |
| 5 | scan.api.ts に4関数が export | PASS（getPresignedUrl/uploadToS3/postBarcode/postOcr） |
| 6 | torch/fillLight true コードなし | PASS（ヒット件数0） |
| 7 | useBarcode が @zxing/library を import し失敗時 null 返却 | PASS |
| 8 | useScan が useReducer を使用 | PASS（useReducer確認、scanReducer+dispatch構造） |
| 9 | api_error → idle 遷移の実装 | PASS（scanReducer の ERROR case で api_error → idle を確認） |
| 10 | as any が新規ファイルに含まれない | PASS（hooks/・lib/ 全0件） |
| 11 | console.log が新規ファイルに含まれない | PASS（hooks/・lib/ 全0件） |
| 12 | 全テスト PASS | PASS（22件全合格） |
| 13 | typecheck エラー 0件 | PASS |

### 改善提案（PASS時 / 次タスク繰越し可）

- [Info][useScan.ts:166] `dispatch({ type: 'STABLE' })` 直後の `stateRef.current === 'stable'` 分岐は到達不能。dispatch は非同期（React re-render 後）のため、この時点で stateRef はまだ 'detecting'。条件を `stateRef.current === 'detecting'` のみに簡略化しても動作は同じ。機能的問題なし。
- [Info][scan.types.ts:1] 型定義のみのファイルに `'use client'` ディレクティブが付いているが、型定義は SSR/CSR 問わず利用されるため不要。Next.js App Router では型ファイルへの `'use client'` 付与は慣習的に推奨されない。動作上の問題はなし。
