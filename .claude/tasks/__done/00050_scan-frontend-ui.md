# Task 00050: Scan Frontend UI Components and /scan Page

| Field | Value |
|-------|-------|
| Status | completed |
| Created | 2026-05-15 |
| completed_date | 2026-05-16 |
| Depends on | 00040 (Scan Frontend Hooks) |

---

## Background

タスク 00040 で Hook 群（`useScan` / `useCamera` / `useBarcode` / `useFrameCheck` / `useScanApi`）・API クライアント・クライアントキャッシュが整備される。本タスクでは UI コンポーネントと `/scan` ページを実装し、スキャン機能をエンドツーエンドで動作させる。

設計の根拠となる正典:
- `docs/design/scan-ux.md` — 結果 UI・ガイドメッセージ・ボトムナビゲーション
- `docs/design/ocr.md` — 安全設計ルール（免責表示・raw_text 表示・incomplete 対応）
- `docs/design/legal.md` — スキャン結果の免責表示タイミング
- `.claude/rules/implementation_rules.md` — 免責 UI 省略禁止・OK 判定のみ SNS 共有可
- `.claude/rules/anti_patterns.md` — アンチパターン #15・#16（免責事項の除去禁止・NG 判定時の免責省略禁止）
- `.claude/rules/architecture.md` — フロントエンド層境界（UI コンポーネントはビジネスロジックを持たない）

現状（00040 完了後の想定）:
- `frontend/src/hooks/useScan.ts` — スキャン状態統合 Hook（`ScanState`・`ScanResult` を返す）
- `frontend/src/app/scan/scan.types.ts` — `ScanState` / `ScanError` / `ScanResult` 型定義済み
- `frontend/src/app/page.tsx` — デフォルトスタートページのまま（未変更）

---

## Requirements

- R1: `frontend/src/app/scan/page.tsx` を `'use client'` ページとして実装し、`useScan` Hook を使ってカメラ映像とスキャン状態を管理する
- R2: `CameraView` コンポーネントを実装し、`<video>` 要素でカメラライブ映像を表示する。ロジック（API 呼び出し等）を持たず Props で受け取るだけにする（architecture.md ルール）
- R3: `ScanGuide` コンポーネントを実装し、`ScanState` / `ScanError` に応じたガイドメッセージを `docs/design/scan-ux.md` のガイドメッセージテーブルに従って表示する
- R4: `ScanOverlay` コンポーネントを実装し、`detecting` / `stable` / `processing` 状態に応じた視覚エフェクト（枠表示・アニメーション等）を表示する
- R5: `ResultCard` コンポーネントを実装し、以下を必ず表示する
  - アレルギーごとの判定（🔴含む / 🟡一部含む / ✅なし）
  - `raw_text`（「原材料を確認する ▼」タップで展開）
  - 「⚠️ 購入前にラベルの実物も必ずご確認ください」を常時表示（省略禁止）
  - NG 判定時に「このアプリの判定は参考情報です。アナフィラキシーのリスクがある方は必ず実物ラベルでご確認ください」を追加表示（省略禁止）
- R6: `ResultCard` は判定が `なし`（OK）のときのみ SNS 共有ボタンを表示する。`含む` / `一部含む` のときは共有ボタンを表示しない（anti_patterns.md #4 遵守）
- R7: ボトムナビゲーション（スキャン・履歴・設定の3タブ）を `frontend/src/components/BottomNav.tsx` に実装し、`/scan`・`/history`・`/settings` へのリンクを持つ。現在ページをハイライトする
- R8: `frontend/src/app/layout.tsx` に `BottomNav` を追加し、全ページで表示される
- R9: `frontend/src/app/page.tsx`（ルートページ）を `/scan` にリダイレクトする（Next.js の `redirect()` 使用）
- R10: iOS の Vibration API 非対応を考慮し、結果表示時のフィードバックは視覚（アニメーション）のみとする。`navigator.vibrate()` を直接呼ばず、Platform 判定（`navigator.userAgent` で Android 判定）を行ってから呼ぶ（implementation_rules.md ルール）
- R11: モバイルファーストで実装する。`max-width: 480px` を基準にレイアウトを組む（implementation_rules.md ルール）
- R12: `as any` / `@ts-ignore` を使用しない

---

## Implementation plan

### Phase 1: /scan ページ + CameraView コンポーネント

- `frontend/src/app/scan/page.tsx`: `'use client'` で `useScan` を呼び出し、`CameraView`・`ScanGuide`・`ScanOverlay`・`ResultCard` を配置する
- `frontend/src/components/CameraView.tsx`: `videoRef: RefObject<HTMLVideoElement>`・`onMounted: (video: HTMLVideoElement) => void` Props を受け取り `<video autoPlay playsInline muted>` をレンダリング
- `frontend/src/app/page.tsx`: `redirect('/scan')` に書き換え

### Phase 2: ScanGuide コンポーネント

- `frontend/src/components/ScanGuide.tsx`: `state: ScanState`・`error?: ScanError` Props を受け取り、`scan-ux.md` のガイドメッセージテーブルに従ったメッセージを `<p>` タグで表示する
- ガイドメッセージ文字列は `frontend/src/app/scan/scan.constants.ts`（または `scan.types.ts`）の `GUIDE_MESSAGES` 定数として定義し、コンポーネントにハードコードしない

### Phase 3: ScanOverlay コンポーネント

- `frontend/src/components/ScanOverlay.tsx`: `state: ScanState` Props を受け取り、`detecting` / `stable` 時に走査線アニメーション、`processing` 時にスピナーを表示する
- CSS アニメーションは Tailwind v4 の `animate-*` クラスを使用する

### Phase 4: ResultCard コンポーネント

- `frontend/src/components/ResultCard.tsx`: `result: ScanResult`・`onClose: () => void` Props を受け取る
- 下からスライドインするアニメーション（`translate-y-full → translate-y-0`）で表示する
- アレルギー判定の絵文字マッピング: `'含む' → '🔴'`・`'一部含む' → '🟡'`・`'なし' → '✅'`・`'判定不能' → '⚠️'`
- `raw_text` は折りたたみ表示（`<details>` または useState で開閉制御）
- 免責文言（2種類）の表示制御を実装する（R5 参照）
- SNS 共有ボタン: `judgment === 'なし'` のときのみ X（旧 Twitter）リンクを表示する

### Phase 5: BottomNav + layout 更新

- `frontend/src/components/BottomNav.tsx`: `usePathname` で現在パスを取得し、スキャン・履歴・設定の3タブを表示。現在タブをハイライト（Tailwind で色変更）
- `frontend/src/app/layout.tsx`: `<BottomNav />` を `{children}` の下に追加

### Phase 6: Unit テスト

- `frontend/src/components/ResultCard.test.tsx`:
  - `judgment: '含む'` → 免責文言2種が両方レンダリングされる
  - `judgment: '含む'` → 共有ボタンが存在しない
  - `judgment: 'なし'` → 免責文言（常時表示分）がレンダリングされる + 共有ボタンが存在する
  - `raw_text` がレンダリングされる
- `frontend/src/components/ScanGuide.test.tsx`:
  - state / error の組み合わせでガイドメッセージが正しく表示される

---

## Files to modify

| File | Action |
|------|--------|
| `frontend/src/app/scan/page.tsx`（新規） | /scan ページ（'use client'） |
| `frontend/src/app/page.tsx`（編集） | /scan へリダイレクト |
| `frontend/src/components/CameraView.tsx`（新規） | カメラ映像表示コンポーネント |
| `frontend/src/components/ScanGuide.tsx`（新規） | ガイドメッセージコンポーネント |
| `frontend/src/components/ScanOverlay.tsx`（新規） | 検出中エフェクトコンポーネント |
| `frontend/src/components/ResultCard.tsx`（新規） | 結果カードコンポーネント |
| `frontend/src/components/BottomNav.tsx`（新規） | ボトムナビゲーション |
| `frontend/src/app/layout.tsx`（編集） | BottomNav を追加 |
| `frontend/src/components/ResultCard.test.tsx`（新規） | ResultCard 単体テスト |
| `frontend/src/components/ScanGuide.test.tsx`（新規） | ScanGuide 単体テスト |

---

## Tests to add

### ResultCard.test.tsx

| シナリオ | 検証内容 |
|----------|----------|
| judgment: '含む' | 「⚠️ 購入前にラベルの実物も必ずご確認ください」がある |
| judgment: '含む' | 「アナフィラキシーのリスク」文言がある |
| judgment: '含む' | 共有ボタンが存在しない（`queryByRole('link', {name: /シェア/})` → null） |
| judgment: 'なし' | 「⚠️ 購入前にラベルの実物も必ずご確認ください」がある |
| judgment: 'なし' | 共有ボタンが存在する |
| raw_text あり | raw_text のテキストがレンダリングされる（展開前でも DOM 内に存在する） |

### ScanGuide.test.tsx

| state / error | 期待メッセージ |
|---------------|---------------|
| `idle` | 「バーコードまたは原材料欄にかざしてください」 |
| `detecting` | 「読み取り中...」 |
| `error, dark` | 「明るい場所に移動してください」 |
| `error, incomplete` | 「原材料またはバーコード全体が映るように撮影してください。」 |
| `error, api_error` | 「通信エラーが発生しました。再度お試しください」 |

---

## Completion criteria

- [ ] `frontend/src/app/scan/page.tsx` が存在し `'use client'` ディレクティブを含む（`grep "'use client'" frontend/src/app/scan/page.tsx` でヒット）
- [ ] `ResultCard.tsx` に「購入前にラベルの実物も必ずご確認ください」の文字列が含まれる（`grep "購入前にラベルの実物" frontend/src/components/ResultCard.tsx` でヒット）
- [ ] `ResultCard.tsx` の NG 判定時の免責文言として「アナフィラキシー」の文字列を含む（`grep "アナフィラキシー" frontend/src/components/ResultCard.tsx` でヒット）
- [ ] `ResultCard.tsx` で `judgment === 'なし'` 以外のときに共有ボタンを表示しない条件分岐が実装されている（`grep "なし\|judgment" frontend/src/components/ResultCard.tsx` でヒット）
- [ ] `ResultCard.tsx` で `raw_text` を表示する実装がある（`grep "raw_text" frontend/src/components/ResultCard.tsx` でヒット）
- [ ] `ScanGuide.tsx` がガイドメッセージをハードコードせず `GUIDE_MESSAGES` 定数またはマッピング変数から取得している（`grep "GUIDE_MESSAGES\|guideMessage\|messageMap" frontend/src/components/ScanGuide.tsx` でヒット）
- [ ] `BottomNav.tsx` が `/scan`・`/history`・`/settings` の 3 リンクを持つ（`grep "/scan\|/history\|/settings" frontend/src/components/BottomNav.tsx` のヒット件数が 3 以上）
- [ ] `frontend/src/app/layout.tsx` に `BottomNav` が import されて使用されている（`grep "BottomNav" frontend/src/app/layout.tsx` でヒット）
- [ ] `frontend/src/app/page.tsx` が `/scan` への `redirect` を含む（`grep "redirect.*scan\|scan.*redirect" frontend/src/app/page.tsx` でヒット）
- [ ] `navigator.vibrate` を Platform 判定なしに直接呼ぶコードが含まれない（`grep -r "navigator\.vibrate" frontend/src/` でヒット件数 0、または Platform 判定ブロック内のみ）
- [ ] `as any` が新規追加ファイルに含まれない（`grep -r "as any" frontend/src/components/ frontend/src/app/scan/` でヒット件数 0）
- [ ] `pnpm --filter frontend test` で `ResultCard.test.tsx`（6件）・`ScanGuide.test.tsx`（5件）が全 PASS する（FAIL 0件）
- [ ] `pnpm --filter frontend typecheck` がエラー 0件で終了する

---

## Risks

| リスク | 回避方針 |
|--------|----------|
| `<video>` の SSR エラー | `/scan/page.tsx` は `'use client'` で実装する。`CameraView` も `'use client'` コンポーネントとして実装する |
| `usePathname` の App Router 対応 | Next.js 16 App Router では `next/navigation` の `usePathname` を使用する。`next/router` ではない |
| Tailwind v4 のアニメーションクラス差異 | Tailwind v4 では `animate-spin`・`animate-pulse` 等は維持されているが、カスタムアニメーションの書き方が変わっている可能性がある。`frontend/AGENTS.md` の指示に従い `node_modules/next/dist/docs/` を参照すること（TBD: generator が確認） |
| `ResultCard` テストでの `details` 要素 | `<details>` 要素の展開状態制御はブラウザ依存。JSDOM では `open` 属性の操作で制御できるが、`userEvent.click` で `<summary>` をクリックする方法を使う |
| `@testing-library/react` でのカメラ関連テスト | `CameraView`・`ScanOverlay` は本タスクでテスト対象外とする（`getUserMedia` のモックが複雑なため）。`ResultCard`・`ScanGuide` のみ単体テストする |

---

## Implementation summary

### Phase 1: /scan ページ + CameraView + ルートリダイレクト
- `frontend/src/app/scan/page.tsx`: L1〜L24。`'use client'` + `useScan` Hook を呼び出し、カメラ映像・ガイド・オーバーレイ・結果カードを配置
- `frontend/src/components/CameraView.tsx`: L1〜L17。`<video autoPlay playsInline muted>` を表示するだけの純粋 UI コンポーネント
- `frontend/src/app/page.tsx`: L1〜L5。`redirect('/scan')` に書き換え
- `frontend/jest.config.ts`: `testRegex` に `.test.tsx?` を追加（`.spec` との両立）
- `frontend/tsconfig.json`: `types` に `jest` と `@testing-library/jest-dom` を追加（型解決）

### Phase 2: ScanGuide コンポーネント + GUIDE_MESSAGES 定数
- `frontend/src/app/scan/scan.constants.ts`: L19〜L32。`GUIDE_MESSAGES` 定数追加（`scan-ux.md` のガイドメッセージテーブルに完全準拠）
- `frontend/src/components/ScanGuide.tsx`: L1〜L36。state / error の組み合わせで `GUIDE_MESSAGES` からメッセージを取得してレンダリング

### Phase 3: ScanOverlay コンポーネント
- `frontend/src/components/ScanOverlay.tsx`: L1〜L38。`detecting`/`stable` 時に走査線（`animate-bounce`）、`processing` 時にスピナー（`animate-spin`）、`error` 時に赤枠を表示

### Phase 4: ResultCard コンポーネント
- `frontend/src/components/ResultCard.tsx`: L1〜L199
  - `deriveJudgment`: OCR/バーコード両 ScanResult から Judgment を導出（L36〜L45）
  - `JUDGMENT_EMOJI` / `JUDGMENT_LABEL`: 絵文字マッピング（L21〜L33）
  - 免責文言常時表示（L155〜L160）
  - NG 判定時追加免責表示（L162〜L169、「アナフィラキシー」文言含む）
  - SNS 共有ボタンは `judgment === 'なし'` のみ表示（L171〜L183）
  - `navigator.vibrate` は Android userAgent 判定後のみ呼ぶ（L12〜L19）
  - `raw_text` は `sr-only` span で展開前でも DOM 内に存在（L151）

### Phase 5: BottomNav + layout 更新
- `frontend/src/components/BottomNav.tsx`: L1〜L39。`usePathname` で現在パスを取得、3タブ（`/scan`・`/history`・`/settings`）をハイライト付きで表示
- `frontend/src/app/layout.tsx`: L4 に `BottomNav` import 追加、L33 に `<BottomNav />` 追加

### Phase 6: Unit テスト
- `frontend/src/components/ResultCard.test.tsx`: 判定ごとの免責文言・共有ボタン・raw_text 表示を検証（9件）
- `frontend/src/components/ScanGuide.test.tsx`: state/error の組み合わせでガイドメッセージを検証（6件）

### 起動コマンド
```
pnpm --filter frontend dev   # フロントエンド開発サーバー起動
```

### テスト URL（開発サーバー起動後）
- スキャン画面: http://localhost:3000/scan
- ルートアクセス: http://localhost:3000/ → /scan にリダイレクト

### 検証シナリオ（手動テスト）
1. http://localhost:3000/ にアクセスし /scan にリダイレクトされることを確認
2. カメラ権限を許可するとカメラ映像が表示されることを確認
3. 暗い場所でカメラを向けると「明るい場所に移動してください」ガイドが表示されることを確認
4. スキャン結果（NG 判定）で「アナフィラキシー」免責文言が表示されることを確認
5. スキャン結果（OK 判定）でのみ共有ボタンが表示されることを確認
6. ボトムナビゲーションで現在タブ（スキャン）がハイライトされることを確認

---

## Plan deviation

1. **jest.config.ts の testRegex 拡張**: 既存設定が `.spec.tsx?` のみ対応していた。タスクで要求された `.test.tsx` ファイルを認識させるため `(spec|test)` に変更した。スコープ外の変更だが最小限（1行修正）。
2. **tsconfig.json に `types` 追加**: `@testing-library/jest-dom` の `toBeInTheDocument` 等のカスタムマッチャーが TypeScript 型として認識されなかったため、`types: ["jest", "@testing-library/jest-dom"]` を追加した。これも既存ファイルへの最小限変更。
3. **`GUIDE_MESSAGES` の `result` キー**: タスク仕様のガイドメッセージテーブルに `result` 状態の記載がなかったため、空文字列（`''`）を設定し `ScanGuide` から `null` を返す設計とした（表示なし）。

---

## Review comments

## 自動評価（2026-05-16 00:00） - ラウンド 1

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 2 / Low: 3）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 13/13 通過、typecheck 0件、unit 37件全合格）
- 2. セキュリティ: ✅（Medium 以上 0件 ※後述の Medium 2件は安全設計の観点・スコープ境界）
- 3. カバレッジ: ⚠️ 算出不能（ResultCard: 9件、ScanGuide: 6件 の単体テストは PASS。CameraView・ScanOverlay は本タスクでテスト対象外と仕様で明記）
- 4. 敵対的観点: ✅（Critical/High 0件。SNS共有制御は `judgment === 'なし'` でのみ有効、`encodeURIComponent` でURLインジェクション対策済み、`rel="noopener noreferrer"` 設定済み）
- 5. 保守性: ✅（層違反 0 / アンチパターン再導入 0 / マジックナンバー 0 / 冗長コメント 0）

### Medium 指摘（改善提案）

#### 【Safety / 安全設計】incomplete:true がフロントエンドでバイパスされるリスク
**再現手順:**
1. バックエンドが `incomplete: true` を含むOCR結果を正常系（200）として返した場合
2. `useScan.ts` の `runOcrFlow` はチェックなしで `RESULT` dispatch する
3. `ResultCard` で不完全な原材料情報を元にした判定が表示される

**状況:**
- `docs/design/patterns.md` パターン2: 「incomplete: true → 即 400 返却」とバックエンド側での制御を前提としている
- バックエンドが 400 を返せば `catch` → `api_error` → `idle` に遷移するが、ガイドメッセージは「通信エラー」となり、`incomplete` 向けの「原材料またはバーコード全体が映るように撮影してください。」は表示されない
- `anti_patterns.md #2` および `ocr.md` 安全設計ルール5に抵触する可能性

**期待される修正案（次タスク繰越し可）:**
- `frontend/src/hooks/useScan.ts` の `runOcrFlow` 内 L115-117 付近で `ocrResult.incomplete === true` のとき `dispatch({ type: 'ERROR', error: 'incomplete' })` に遷移させる
- バックエンドが `incomplete` で 400 を返す場合でも、フロントエンドで明示的にハンドリングすることで `incomplete` ガイドメッセージ（「原材料またはバーコード全体が映るように撮影してください。」）が表示される

#### 【Safety / 安全設計】confidence: low 時に再スキャン誘導メッセージが出ない
**状況:**
- `ocr.md` 設計: `confidence: low` → 「もう少し近づけて再スキャンしてください → detecting継続」
- `patterns.md` パターン2: `confidence: low → 422 返却`。バックエンドが 422 を返せば `catch` → `api_error` → `idle`
- ただし `api_error` 時のガイドは「通信エラー」であり、`confidence: low` 向けの「もう少し近づけてください」は `ScanGuide` に定義されていない（`GUIDE_MESSAGES` に当該状態なし）
- `ResultCard.tsx` は `confidence === 'medium'` の警告のみで `low` の処理なし

**期待される修正案（次タスク繰越し可）:**
- バックエンドが `confidence: low` で 422 を返す実装が完成した後で対応でよい
- または `GUIDE_MESSAGES` に `confidence_low` エントリを追加し、`useScan` でバックエンドレスポンスの `confidence` を確認する

### 改善提案（Low / PASS 時 / 次タスク繰越し可）

- [保守性] `scan/page.tsx:18` の `h-[calc(100vh-56px)]` の `56px` は `BottomNav` の `h-14` (=56px) と連動している。`scan.constants.ts` に `BOTTOM_NAV_HEIGHT_PX = 56` を定義し Tailwind arbitrary value で参照するとリファクタリング耐性が上がる
- [型安全] `scan.api.ts` の `res.json() as Promise<T>` は fetch API の型上仕方ないが、zod 等での実行時バリデーションを将来的に追加するとより安全
- [型安全] `useBarcode.ts:30` の `new MultiFormatReader() as { decode: ... }` は内部実装の変更追従が難しい。ZXingの型定義を直接使用するか、型ガード関数を定義する検討を推奨

### Completion criteria 検証結果

| 項目 | 結果 |
|------|------|
| `scan/page.tsx` に `'use client'` | PASS |
| `ResultCard.tsx` に「購入前にラベルの実物も必ずご確認ください」 | PASS |
| `ResultCard.tsx` に「アナフィラキシー」文言 | PASS |
| `ResultCard.tsx` で `judgment === 'なし'` 以外共有ボタン非表示 | PASS |
| `ResultCard.tsx` で `raw_text` 表示 | PASS |
| `ScanGuide.tsx` が `GUIDE_MESSAGES` 定数から取得 | PASS |
| `BottomNav.tsx` が3リンク（/scan・/history・/settings）を持つ | PASS |
| `layout.tsx` に `BottomNav` が import・使用されている | PASS |
| `page.tsx` が `/scan` への `redirect` を含む | PASS |
| `navigator.vibrate` は Android 判定後のみ呼ぶ | PASS |
| `as any` が新規ファイルに含まれない | PASS |
| `ResultCard.test.tsx` / `ScanGuide.test.tsx` 全 PASS | PASS（15/15件） |
| `pnpm --filter frontend typecheck` エラー 0件 | PASS |
