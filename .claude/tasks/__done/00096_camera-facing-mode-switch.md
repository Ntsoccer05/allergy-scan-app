# 00096 カメラ内外切り替え（facingMode switch）

## Metadata

| Key | Value |
|---|---|
| Status | completed |
| Priority | low |
| Created | 2026-05-19 |
| Sprint | Week4（設定・オンボーディング） |

---

## Background

`frontend/src/hooks/useCamera.ts` は現在、外カメラ（`facingMode: 'environment'`）のみをサポートし、切り替え機能を持たない（L88）。

ラベル撮影はほぼ100%外カメラで行うため現状に問題はないが、特殊なシチュエーション（外カメラが破損、タブレットでの立て掛け操作等）に対応するため、Week4 で内外カメラ切り替えボタンを追加する。

### 既に対応済みの注意点

| 項目 | 状態 |
|---|---|
| `facingMode: 'environment'`（`exact` 未使用・フォールバック可） | ✅ L88 で対応済み |
| デフォルト外カメラ固定 | ✅ L88 で対応済み |
| advanced constraints 失敗時の二重フォールバック | ✅ L94-103 try/catch で対応済み |
| iPad の `environment` カメラ方向の罠 | ⚠️ 実機テスト推奨（コードで判別不可） |

### 残課題

- `useCamera` に `facingMode` state と `toggleFacingMode` 関数がない
- スキャン画面に切り替えボタン（UI）がない

---

## Requirements

R1: `useCamera.ts` に `facingMode: 'environment' | 'user'` の state を追加する。デフォルトは `'environment'`。

R2: `toggleFacingMode(): void` 関数を `useCamera` から返し、呼び出し時に現在のストリームを `stopCamera` で停止してから、新しい `facingMode` で `startCamera` 相当の処理を再実行する。

R3: カメラ切り替え時は既存の `facingMode: 'environment'` と同様、`exact` を使わず `ideal` 形式（または直接 `facingMode` 値）を使い、対応カメラがない場合にフォールバックする実装にする。

R4: `UseCameraReturn` 型に `facingMode: 'environment' | 'user'` と `toggleFacingMode: () => void` を追加する。

R5: スキャン画面（`frontend/src/app/scan/` 配下の Camera 表示コンポーネント）に、現在の `facingMode` を示すアイコンボタン（カメラ切り替え）を追加する。ボタンは補助的な位置（画面右上等）に配置し、ラベル撮影の主操作を妨げない。

R6: ボタンのラベルは i18n キー（`scan.camera.switchCamera`）で管理する。`frontend/public/locales/ja/scan.json` に `"switchCamera": "カメラ切り替え"` を追加する（`en/scan.json` は `"switchCamera": "Switch Camera"` を追加）。

R7: `useCamera.spec.ts` または `useCamera.test.ts` が存在する場合、`toggleFacingMode` のテストケースを追加する（存在しない場合は新規作成不要。generator が判断）。

R8: `pnpm --filter frontend typecheck` が終了コード 0 で終了する（型エラー 0 件）。

---

## Implementation plan

### Phase 1: useCamera Hook 更新

`facingMode` state を追加し、`startCamera` 内で `facingMode` を参照するよう変更する。`toggleFacingMode` は現在のストリームを止めてから逆の `facingMode` で再起動する。`exact` を使わず `{ facingMode: newMode }` の形で渡す（フォールバック動作は既存実装と同じ）。

### Phase 2: UI コンポーネント更新

カメラ表示コンポーネントに切り替えボタンを追加する。`useCamera` から `facingMode` / `toggleFacingMode` を受け取り、補助ボタンとして表示する。アイコンは 🔄 またはカメラ反転アイコン（プロジェクトで使用しているアイコンライブラリに準拠）。

### Phase 3: i18n キー追加

`ja/scan.json` と `en/scan.json` に `scan.camera.switchCamera` キーを追加する。

---

## Files to modify

| ファイル | 変更内容 |
|---|---|
| `frontend/src/hooks/useCamera.ts` | `facingMode` state・`toggleFacingMode` 関数追加、`startCamera` を `facingMode` 参照に変更 |
| `frontend/src/app/scan/` 配下のカメラ表示コンポーネント（TBD: generator が Glob で特定） | 切り替えボタン追加 |
| `frontend/public/locales/ja/scan.json` | `scan.camera.switchCamera` キー追加 |
| `frontend/public/locales/en/scan.json` | `scan.camera.switchCamera` キー追加 |

---

## Tests to add

- `useCamera` の `toggleFacingMode` を呼ぶと `facingMode` が反転することを確認するテスト（テストファイルが存在する場合のみ追加）

---

## Completion criteria

- [ ] `frontend/src/hooks/useCamera.ts` の `UseCameraReturn` 型に `facingMode` と `toggleFacingMode` が含まれる（`grep -c "toggleFacingMode" frontend/src/hooks/useCamera.ts` が 1 以上）
- [ ] `useCamera.ts` の `facingMode` デフォルト値が `'environment'` である（`grep -c "'environment'"` が 1 以上）
- [ ] `useCamera.ts` が `{ facingMode: { exact: ... } }` 形式を使用していない（`grep -c "exact" frontend/src/hooks/useCamera.ts` が 0）
- [ ] スキャン画面にカメラ切り替えボタンが追加されている（generator が確認）
- [ ] `frontend/public/locales/ja/scan.json` に `switchCamera` キーが存在する
- [ ] `frontend/public/locales/en/scan.json` に `switchCamera` キーが存在する
- [ ] `pnpm --filter frontend typecheck` が終了コード 0 で終了する（型エラー 0 件）

---

## Risks

| リスク | 影響 | 回避方針 |
|---|---|---|
| iPad の `environment` が内カメラ方向に付いている機種 | 切り替えが期待通りに動かない | コード上では判別できないため、実機テストを推奨。UI には「カメラが反転している場合は切り替えてください」等のヒントを表示することを検討 |
| 切り替え時にカメラ映像が一瞬ブラックアウトする | UX 劣化 | ストリーム停止→再起動は避けられないため、ローディング状態（`ScanState: 'idle'`）を適切に表示する |
| iOS Safari でカメラ再起動時にパーミッション再確認が出る | UX 劣化 | iOS Safari の挙動は仕様のため許容。切り替え時に「カメラへのアクセスを許可してください」ダイアログが出る旨をドキュメント化する |

---

## Implementation summary（ラウンド2追加修正）

### ラウンド2修正（evaluator FAIL 指摘3点の対応）

- `frontend/src/components/CameraView.tsx`: `aria-label="カメラ映像"` → `aria-label={t('videoLabel')}` に i18n キー化（L45）
- `frontend/src/components/CameraView.tsx`: `aria-label="ズームレベル"` → `aria-label={t('zoomLabel')}` に i18n キー化（L67）
- `frontend/src/components/CameraView.tsx`: 分割代入に `facingMode` を追加し、切り替えボタンのアイコンを `facingMode === 'environment' ? '🔄' : '🔁'` に変更（L21, L55）
- `frontend/public/locales/ja/scan.json`: `camera` オブジェクトに `"videoLabel": "カメラ映像"` と `"zoomLabel": "ズームレベル"` を追加
- `frontend/public/locales/en/scan.json`: `camera` オブジェクトに `"videoLabel": "Camera view"` と `"zoomLabel": "Zoom level"` を追加
- `frontend/src/hooks/useCamera.spec.ts`: `toggleFacingMode` のテストケース2件を追加（environment→user 反転、user→environment 戻り）

### Phase 1: useCamera Hook 更新（`frontend/src/hooks/useCamera.ts`）

- L27: `type FacingMode = 'environment' | 'user'` を追加
- L29–39: `UseCameraReturn` 型に `facingMode: FacingMode` と `toggleFacingMode: () => void` を追加
- L34: `startCamera` の型シグネチャを `(mode?: FacingMode) => Promise<void>` に変更（オプション引数でフォールバック可）
- L51: `const [facingMode, setFacingMode] = useState<FacingMode>('environment')` を追加（デフォルト: `'environment'`）
- L89: `startCamera` の引数に `mode: FacingMode = 'environment'` を追加し、`baseVideo` の `facingMode` を `mode` 参照に変更
- L142–147: `toggleFacingMode` を追加。現在のストリームを `stopCamera` で停止 → `setFacingMode(newMode)` → `startCamera(newMode)` で再起動
- L218: `return` 文に `facingMode`・`toggleFacingMode` を追加
- `exact` は使用せず `{ facingMode: mode }` 形式でフォールバック動作を維持

### Phase 2: CameraView コンポーネント更新（`frontend/src/components/CameraView.tsx`）

- L4: `useTranslations` を `next-intl` からインポート
- L12–13: Props に `facingMode: 'environment' | 'user'` と `onToggleFacingMode: () => void` を追加
- L23: `const t = useTranslations('camera')` を追加（`scan.json` の `camera` セクションを参照）
- L42–50: 右上に切り替えボタン（🔄アイコン、`aria-label={t('switchCamera')}`）を追加
- スキャン主操作（ズームスライダー）を妨げない右上配置

### Phase 2（続）: useScan Hook 更新（`frontend/src/hooks/useScan.ts`）

- `UseScanReturn` 型に `facingMode: 'environment' | 'user'` と `toggleFacingMode: () => void` を追加
- `useCamera()` の分割代入に `facingMode`・`toggleFacingMode` を追加
- `return` 文に `facingMode`・`toggleFacingMode` を追加

### Phase 2（続）: scan/page.tsx 更新（`frontend/src/app/scan/page.tsx`）

- `useScan()` の分割代入に `facingMode`・`toggleFacingMode` を追加
- `CameraView` に `facingMode={facingMode}` と `onToggleFacingMode={toggleFacingMode}` を渡すように更新

### Phase 3: i18n キー追加

- `frontend/public/locales/ja/scan.json`: `camera.switchCamera = "カメラ切り替え"` を追加
- `frontend/public/locales/en/scan.json`: `camera.switchCamera = "Switch Camera"` を追加

---

## Plan deviation

none

---

## Review comments

## 自動評価（2026-05-19 00:00） - ラウンド 1

### 総合判定
**FAIL** （Critical: 0 / High: 0 / Medium: 0 / Low: 3）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 5/7 明示確認。typecheck 0件、unit 63件全合格）
  - `toggleFacingMode` 出現数: 3 (>= 1) ✅
  - `'environment'` 出現数: 4 (>= 1) ✅
  - `exact` 出現数: 0 ✅
  - i18n キー `switchCamera` ja/en 両方存在 ✅
  - typecheck 終了コード 0 ✅
  - スキャン画面に切り替えボタン追加: ✅（CameraView.tsx L47-55）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ❌（`toggleFacingMode` の新規ロジックに対してテストが 0 件。useCamera.spec.ts は存在するが未追加）
- 4. 敵対的観点: ✅（Critical/High 0 件。破壊的操作なし）
- 5. 保守性: ❌（i18n ハードコード 2 件 / unused prop 1 件）

### 不合格理由（generator への差戻しフィードバック）

#### 【種別】Maintainability（i18n 違反 / anti_patterns.md §17）

**【再現手順】**
1. `frontend/src/components/CameraView.tsx` を開く
2. L44 および L66 を確認する
3. `aria-label="カメラ映像"` と `aria-label="ズームレベル"` が日本語ハードコードになっている

**【期待される修正案】**
- `frontend/public/locales/ja/scan.json` の `camera` オブジェクトに `"videoLabel": "カメラ映像"` と `"zoomLabel": "ズームレベル"` を追加する
- `frontend/public/locales/en/scan.json` の `camera` オブジェクトに `"videoLabel": "Camera feed"` と `"zoomLabel": "Zoom level"` を追加する
- `frontend/src/components/CameraView.tsx:44` の `aria-label="カメラ映像"` を `aria-label={t('videoLabel')}` に変更する
- `frontend/src/components/CameraView.tsx:66` の `aria-label="ズームレベル"` を `aria-label={t('zoomLabel')}` に変更する
- 参照: `.claude/rules/anti_patterns.md` §17 / `.claude/rules/coding_rules.md` i18n セクション

---

#### 【種別】Maintainability（facingMode が props 型に定義されているが分割代入で受け取られていない）

**【再現手順】**
1. `frontend/src/components/CameraView.tsx` を開く
2. L7-14 の `CameraViewProps` 型: `facingMode: 'environment' | 'user'` が定義されている
3. L16-22 の分割代入: `facingMode` が欠落している（`onToggleFacingMode` のみ受け取っている）
4. `facingMode` が実際には使用されていない。将来的にカメラ方向に応じたアイコン変更等を行う場合にバグの原因となる

**【期待される修正案】**
- `frontend/src/components/CameraView.tsx:16-22` の分割代入に `facingMode` を追加し、実装内で使用する（例: ボタンアイコンを `facingMode === 'environment' ? '🔄' : '🔁'` のように現在の向きを示す表示にする）、または Props 型から削除して呼び出し元（`scan/page.tsx`）からの渡しをやめる。いずれかで unused prop を解消する
- 参照: TypeScript unused variables の原則。型定義と実装の整合性

---

#### 【種別】Coverage（R7 違反: toggleFacingMode テスト未追加）

**【再現手順】**
1. `frontend/src/hooks/useCamera.spec.ts` が存在することを確認する（存在する）
2. `grep -c "toggleFacingMode" frontend/src/hooks/useCamera.spec.ts` の結果が 0 であることを確認する
3. タスク要件 R7「テストファイルが存在する場合、toggleFacingMode のテストケースを追加する」を満たしていない

**【期待される修正案】**
- `frontend/src/hooks/useCamera.spec.ts` に以下のテストケースを追加する:
  ```typescript
  describe('useCamera - toggleFacingMode', () => {
    beforeEach(() => {
      setupMediaDevicesMock(makeMockStream(false), false)
    })

    it('toggleFacingMode を呼ぶと facingMode が environment から user に反転する', async () => {
      const { result } = renderHook(() => useCamera())
      expect(result.current.facingMode).toBe('environment')

      await act(async () => {
        result.current.toggleFacingMode()
      })

      expect(result.current.facingMode).toBe('user')
    })

    it('toggleFacingMode を2回呼ぶと facingMode が environment に戻る', async () => {
      const { result } = renderHook(() => useCamera())

      await act(async () => {
        result.current.toggleFacingMode()
      })
      await act(async () => {
        result.current.toggleFacingMode()
      })

      expect(result.current.facingMode).toBe('environment')
    })
  })
  ```
- 参照: タスク要件 R7 / `.claude/rules/anti_patterns.md`（テストなき機能追加禁止原則）

### 改善提案（次タスク繰越し可）
- [UX] `facingMode` を活用してカメラ切り替えボタンのアイコンを現在の向きに応じて変えると（例: `environment` 時は後向きカメラアイコン、`user` 時は前向きカメラアイコン）、ユーザーが現在の状態を把握しやすい

---

## 自動評価（2026-05-19） - ラウンド 2

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 0）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 7/7 通過、typecheck 0件、unit 65件全合格）
  - `toggleFacingMode` 出現数: 3 (>= 1) ✅
  - `'environment'` 出現数: 4 (>= 1) ✅
  - `exact` 出現数: 0 ✅
  - `switchCamera` i18n キー ja/en 両方存在 ✅
  - typecheck 終了コード 0 ✅
  - スキャン画面に切り替えボタン追加: ✅（CameraView.tsx L48-57）
  - facingMode が CameraView の分割代入に含まれて使用: ✅（L21, L55）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（`toggleFacingMode` テスト2件追加: environment→user 反転・user→environment 戻り）
- 4. 敵対的観点: ✅（Critical/High 0 件。外部入力なし・ローカル状態トグルのみ）
- 5. 保守性: ✅（i18n ハードコード 0 件 / 層違反 0 件 / マジックナンバー 0 件 / unused prop 0 件）

### ラウンド1 FAIL 指摘の修正確認
- `aria-label="カメラ映像"` ハードコード → `aria-label={t('videoLabel')}` に修正済み ✅
- `aria-label="ズームレベル"` ハードコード → `aria-label={t('zoomLabel')}` に修正済み ✅
- `facingMode` が分割代入に追加されL55でアイコン切り替えに使用 ✅
- `useCamera.spec.ts` に `toggleFacingMode` テスト2件追加済み ✅

### 改善提案（PASS）
- [UX] 🔄 と 🔁 の2絵文字はユーザーには「カメラ反転」の方向の違いが直感的でない。将来的にアイコンライブラリ（lucide-react 等）の `CameraIcon` + `FlipHorizontal` 相当への置き換えを検討する
