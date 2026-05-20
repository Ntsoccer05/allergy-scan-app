# Task 00170: Google Places API による店舗候補取得・ユーザー選択・履歴更新

## Metadata

| Field | Value |
|---|---|
| Status | completed |
| Created | 2026-05-20 |
| Priority | medium |
| Sprint | Week4 |
| Dependencies | 00030_ocr-backend（POST /scan/ocr）、00060_history-backend（POST /history）、00040_scan-frontend-hooks（useScan / useScanApi） |

## Background

現在の OCR スキャンフローでは `scan_histories` に `location: null` が固定で渡されており、購入場所が記録されない。

「どこに売っているか」はアレルギー持ちのユーザーにとって行動直結の情報（近所のコンビニで買える等）であり、MVP で実装する価値がある。

### 確定フロー

```
OCR完了
  ↓ GPS + Places API を並行実行（スキャン中に裏で取得）
  ↓ 候補 0件 / GPS失敗  → POST /history (location: null)    → 完了
  ↓ 候補 1件            → POST /history (location: {store_name, lat, lng}) → 完了
  ↓ 候補 2件以上        → POST /history (location: null)
                           ↓ 結果画面に候補ボタンリストを表示
                           ユーザーが選択 → PATCH /history/:id (location 更新)
                           「場所不明」スキップ → そのまま完了
```

### 既存ファイル確認済み情報

- `backend/src/shared/places.client.ts` — 未存在（新規作成）
- `backend/src/history/` — POST /history 実装済み。PATCH は未実装
- `frontend/src/app/history/history.types.ts` の `CreateHistoryBody` — `location` フィールド未存在
- `frontend/src/hooks/useScan.ts` の `buildHistoryBody` — location 未対応
- `frontend/src/components/ResultCard.tsx` — 結果表示コンポーネント（店舗選択 UI をここに追加）

## Requirements

### バックエンド

- R1: `backend/src/shared/places.client.ts` を新規作成し、`getStoreCandidates(lat: number, lng: number): Promise<{ name: string; placeId: string }[]>` を実装する。Google Places Nearby Search API（`rankBy=distance`、`type=convenience_store|supermarket|grocery_or_supermarket`）を呼び出し、距離順上位 5 件を返す。API ミス・ネットワークエラー・結果ゼロは空配列 `[]` を返す（例外を投げない）
- R2: `GOOGLE_PLACES_API_KEY` が未設定の場合は即 `[]` を返す（スキャンを止めない）
- R3: `backend/src/scan/dto/ocr-scan.dto.ts` に `lat?: number` / `lng?: number` を `@IsOptional()` + `@IsNumber()` で追加する
- R4: `backend/src/scan/scan.service.ts` の `processOcr` 引数に `lat?` / `lng?` を追加する。両方揃っている場合 `getStoreCandidates` を呼ぶ。候補 0 件または GPS なしは `location: null`、候補 1 件は `location: { store_name: candidates[0].name, lat, lng }`、候補 2 件以上は `location: null` で `scan_histories` に INSERT する。候補リスト（2件以上のとき）は processOcr のレスポンスに `storeCandidates: { name: string; placeId: string }[]` として含める
- R5: `backend/src/scan/scan.controller.ts` で `dto.lat` / `dto.lng` を `processOcr` に渡す
- R6: `PATCH /history/:id` エンドポイントを新規追加する。Cookie 認証必須（未認証は 401）。リクエストボディ: `{ location: { store_name: string; lat: number; lng: number } }`。該当 history が Cookie の userId に属さない場合は 403 を返す。実装ファイル: `backend/src/history/history.controller.ts`（または既存ファイルに追記）、`backend/src/history/history.service.ts`、`backend/src/history/history.repository.ts`
- R7: `as any` / `@ts-ignore` を新規追加しない
- R8: `pnpm --filter backend typecheck` がエラー 0 件で終了する
- R9: `pnpm --filter backend test` が全テスト PASS で終了する（FAIL 0 件）

### フロントエンド

- R10: `frontend/src/app/history/history.types.ts` の `CreateHistoryBody` に `location?: { store_name: string; lat: number; lng: number }` を追加する
- R11: `frontend/src/lib/api/scan.api.ts` の `postOcr` 引数に `lat?: number` / `lng?: number` を追加し、存在する場合はリクエストボディに含める。レスポンス型に `storeCandidates?: { name: string; placeId: string }[]` を追加する
- R12: `frontend/src/lib/api/history.api.ts`（または既存の history API クライアント）に `patchHistoryLocation(historyId: string, location: { store_name: string; lat: number; lng: number }): Promise<void>` を追加する。`PATCH /history/:id` を呼ぶ
- R13: `frontend/src/hooks/useScan.ts` のスキャン開始時（`startScan` 実行時）に `navigator.geolocation.getCurrentPosition` で GPS 座標を取得し `ref` に保持する。`runOcrFlow` で `lat` / `lng` を `postOcr` に渡す。POST /history の戻り値 `id` を `scanHistoryIdRef` に保持し、店舗選択後の PATCH に使う。`storeCandidates` が 2 件以上の場合は scan 状態に候補リストを保持して結果画面に渡す
- R14: GPS 取得失敗（権限拒否・タイムアウト・非対応）は `lat` / `lng` なしで OCR リクエストを送信する（エラーでスキャンを中断しない）。タイムアウト値は `frontend/src/app/scan/scan.constants.ts` に `GEO_TIMEOUT_MS = 5000` として定義する
- R15: `frontend/src/components/ResultCard.tsx` に店舗選択 UI を追加する。`storeCandidates` が 2 件以上のときのみ表示する。候補ボタン（store name）と「場所不明」ボタンを並べる。ユーザーが選択または「場所不明」を押したら `patchHistoryLocation`（または skip）を呼び、UI を非表示にする。i18n 対応（`t('scan.result.selectStore')` 等のキー）
- R16: `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- R17: `pnpm --filter frontend test` が全テスト PASS で終了する（FAIL 0 件）

## Implementation plan

### Phase 1: バックエンド — PlacesClient 新規作成

`backend/src/shared/places.client.ts` を作成する。
Google Places Nearby Search API を `rankBy=distance`（radius パラメーター不使用）、`type=convenience_store|supermarket` で呼び出す。
`@Injectable()` デコレータを付け、NestJS DI に乗せる。
`GOOGLE_PLACES_API_KEY` 未設定時は即 `[]` 返却。
エラー時は `Logger.warn` でログを残し `[]` 返却。

### Phase 2: バックエンド — OcrScanDto / ScanService / ScanController 変更

`OcrScanDto` に `lat?` / `lng?` を追加。
`processOcr` に `lat?` / `lng?` を追加し、候補数に応じて `location` を分岐。
レスポンスに `storeCandidates?: { name: string; placeId: string }[]` を追加（2件以上のときのみ）。
`scan.module.ts` に `PlacesClient` を providers に追加。

### Phase 3: バックエンド — PATCH /history/:id

`history.repository.ts` に `updateLocation(id: string, userId: string, location: {...}): Promise<void>` を追加。
`history.service.ts` に `updateLocation` を追加（userId 所有権確認）。
`history.controller.ts` に `@Patch(':id')` を追加。Cookie 認証・403 ガード付き。

### Phase 4: フロントエンド型定義・API クライアント更新

`history.types.ts` の `CreateHistoryBody` に `location?` 追加。
`scan.api.ts` の `postOcr` 引数・レスポンス型更新。
`history.api.ts`（または相当ファイル）に `patchHistoryLocation` 追加。

### Phase 5: フロントエンド — useScan 位置情報取得・候補管理

`startScan` 時に geolocation を `void` で起動（ブロッキングなし）。座標を `geolocationRef` に保持。
`runOcrFlow` で `postOcr` に `lat` / `lng` 渡し。POST /history の `id` を `scanHistoryIdRef` に保持。
`storeCandidates` を状態として管理し `result` 状態に含める。

### Phase 6: フロントエンド — ResultCard 店舗選択 UI

`storeCandidates` が 2 件以上のとき候補ボタンを表示。
ボタンクリック → `patchHistoryLocation` → UI 非表示。
「場所不明」クリック → UI 非表示（PATCH なし）。
i18n: `scan.result.selectStore`、`scan.result.storeUnknown` 等のキーを ja/en に追加。

### Phase 7: テスト追加・既存テスト修正

バックエンド `scan.service.spec.ts`:
- 候補 1 件のとき location 付きで history 保存
- 候補 2 件以上のとき location: null で保存 + storeCandidates をレスポンスに含む
- 候補 0 件のとき location: null で保存

バックエンド `history.controller.spec.ts` / `history.service.spec.ts`:
- PATCH /history/:id: 正常系（location 更新）
- PATCH /history/:id: 他ユーザーの history → 403

フロントエンド `useScan.spec.ts`:
- geolocation 成功 → postOcr に lat/lng 渡る
- geolocation 失敗 → lat/lng なしで postOcr

## Files to modify

| ファイル | 変更種別 |
|---|---|
| `backend/src/shared/places.client.ts` | 新規作成 |
| `backend/src/scan/scan.module.ts` | 変更（PlacesClient を providers に追加） |
| `backend/src/scan/dto/ocr-scan.dto.ts` | 変更（lat? / lng? 追加） |
| `backend/src/scan/scan.service.ts` | 変更（processOcr 引数・PlacesClient 注入・location 分岐・storeCandidates レスポンス） |
| `backend/src/scan/scan.controller.ts` | 変更（dto.lat / dto.lng を processOcr に渡す） |
| `backend/src/scan/scan.service.spec.ts` | 変更（PlacesClient モック・3ケース追加） |
| `backend/src/history/history.repository.ts` | 変更（updateLocation 追加） |
| `backend/src/history/history.service.ts` | 変更（updateLocation 追加） |
| `backend/src/history/history.controller.ts` | 変更（PATCH :id 追加） |
| `backend/src/history/history.controller.spec.ts` | 変更（PATCH テスト追加） |
| `frontend/src/app/history/history.types.ts` | 変更（CreateHistoryBody.location 追加） |
| `frontend/src/lib/api/scan.api.ts` | 変更（postOcr 引数・レスポンス型更新） |
| `frontend/src/lib/api/history.api.ts` | 変更（patchHistoryLocation 追加） |
| `frontend/src/hooks/useScan.ts` | 変更（geolocation 取得・scanHistoryIdRef・storeCandidates 管理） |
| `frontend/src/hooks/useScan.spec.ts` | 変更（geolocation テスト追加） |
| `frontend/src/components/ResultCard.tsx` | 変更（店舗選択 UI 追加） |
| `frontend/src/app/scan/scan.constants.ts` | 変更（GEO_TIMEOUT_MS 追加） |
| `frontend/public/locales/ja/scan.json` | 変更（selectStore・storeUnknown キー追加） |
| `frontend/public/locales/en/scan.json` | 変更（selectStore・storeUnknown キー追加） |

## Tests to add

### バックエンド（scan.service.spec.ts）

| シナリオ | 期待結果 |
|---|---|
| getStoreCandidates が 1 件返す | history.create の location.store_name が候補名になる |
| getStoreCandidates が 2 件返す | history.create の location が null、レスポンスに storeCandidates あり |
| getStoreCandidates が 0 件返す | history.create の location が null |
| lat/lng なし | getStoreCandidates が呼ばれない |

### バックエンド（history.controller.spec.ts）

| シナリオ | 期待結果 |
|---|---|
| PATCH /history/:id 正常系 | 200 / location が更新される |
| PATCH /history/:id 他ユーザーの history | 403 |
| PATCH /history/:id Cookie なし | 401 |

### フロントエンド（useScan.spec.ts）

| シナリオ | 期待結果 |
|---|---|
| geolocation 成功 | postOcr に lat/lng が含まれる |
| geolocation 失敗 | lat/lng なしで postOcr（スキャン継続） |
| geolocation 非対応 | lat/lng なしで postOcr（スキャン継続） |

## Completion criteria

- [ ] `backend/src/shared/places.client.ts` が存在する
- [ ] `backend/src/shared/places.client.ts` に `getStoreCandidates` が存在する（`grep "getStoreCandidates" backend/src/shared/places.client.ts` でヒット 1 以上）
- [ ] `GOOGLE_PLACES_API_KEY` を環境変数から読む（`grep "GOOGLE_PLACES_API_KEY" backend/src/shared/places.client.ts` でヒット 1 以上）
- [ ] `backend/src/scan/dto/ocr-scan.dto.ts` に `lat` / `lng` フィールドが存在する
- [ ] `backend/src/scan/scan.service.ts` に `getStoreCandidates` の呼び出しが存在する
- [ ] `backend/src/scan/scan.service.ts` に `storeCandidates` をレスポンスに含む分岐が存在する（`grep "storeCandidates" backend/src/scan/scan.service.ts` でヒット 1 以上）
- [ ] `PATCH /history/:id` エンドポイントが `history.controller.ts` に存在する（`grep "@Patch" backend/src/history/history.controller.ts` でヒット 1 以上）
- [ ] `history.repository.ts` に `updateLocation` が存在する（`grep "updateLocation" backend/src/history/history.repository.ts` でヒット 1 以上）
- [ ] `frontend/src/lib/api/history.api.ts` に `patchHistoryLocation` が存在する（`grep "patchHistoryLocation" frontend/src/lib/api/history.api.ts` でヒット 1 以上）
- [ ] `frontend/src/hooks/useScan.ts` に `geolocation` または `getCurrentPosition` の呼び出しが存在する（`grep "geolocation" frontend/src/hooks/useScan.ts` でヒット 1 以上）
- [ ] `frontend/src/hooks/useScan.ts` に `scanHistoryId` または `historyId` の ref が存在する（`grep "historyId\|scanHistoryId" frontend/src/hooks/useScan.ts` でヒット 1 以上）
- [ ] `frontend/src/components/ResultCard.tsx` に `storeCandidates` の参照が存在する（`grep "storeCandidates" frontend/src/components/ResultCard.tsx` でヒット 1 以上）
- [ ] `frontend/src/app/scan/scan.constants.ts` に `GEO_TIMEOUT_MS` が存在する（`grep "GEO_TIMEOUT_MS" frontend/src/app/scan/scan.constants.ts` でヒット 1 以上）
- [ ] `frontend/public/locales/ja/scan.json` に `selectStore` キーが存在する（`grep "selectStore" frontend/public/locales/ja/scan.json` でヒット 1 以上）
- [ ] `scan.service.spec.ts` に候補 1 件・2 件以上・0 件のテストケースが存在し PASS する
- [ ] `history.controller.spec.ts` に PATCH の正常系・403・401 テストが存在し PASS する
- [ ] `useScan.spec.ts` に geolocation 成功・失敗のテストが存在し PASS する
- [ ] `backend/src/shared/places.client.ts` に `as any` が存在しない（`grep "as any" backend/src/shared/places.client.ts` でヒット 0）
- [ ] `pnpm --filter backend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter backend test` が全テスト PASS で終了する
- [ ] `pnpm --filter frontend test` が全テスト PASS で終了する

## Risks

| リスク | 回避方針 |
|---|---|
| history の userId 所有権確認が repository 層でどう実装されているか未確認 | generator が `history.repository.ts` を Read して現行パターンを踏襲すること |
| Google Places API の `rankBy=distance` は `radius` パラメーターと併用不可 | `radius` を省略し `rankBy=distance` のみ使用すること |
| `frontend/src/lib/api/history.api.ts` が存在しない可能性 | generator が Glob で確認し、存在しなければ `scan.api.ts` のパターンに倣い新規作成すること |
| useScan の状態管理（storeCandidates の保持方法）が既存の型と干渉する | `ScanState` / `ScanResult` 型に `storeCandidates?` を追加して拡張すること |
| ResultCard に `onStorePatch` コールバックを渡す設計が上位コンポーネントに波及する | Props に `onStoreSelect?: (candidate: {name: string; placeId: string} | null) => void` を追加し、useScan 側で PATCH を行う設計にする（ResultCard は UI のみ、ロジックは Hook） |

# Implementation summary

## ラウンド2再実装（evaluator FAIL 受領後）

### 修正内容

**修正1: i18n キー名不一致の解消**

- `frontend/public/locales/ja/scan.json` の `storeSelect` セクション（`title` / `unknown`）を削除し、`result` セクション配下に `selectStore` / `storeUnknown` キーを追加（L26-27）
- `frontend/public/locales/en/scan.json` にも同様に `selectStore` / `storeUnknown` キーを追加（L26-27）
- `frontend/src/components/ResultCard.tsx` の `useTranslations('storeSelect')` と `tStore` 変数を削除し、既存の `t = useTranslations('result')` で `t('selectStore')` / `t('storeUnknown')` を使用（L136, L294, L310）

**修正2: useScan.spec.ts に geolocation 連携テストを追加**

- `frontend/src/hooks/useScan.spec.ts` に `describe('useScan - geolocation 連携')` ブロックを追加（L320〜L465）
- 以下の3ケースを実装:
  - geolocation 成功 → `scanOcr` に lat/lng が渡される
  - geolocation 失敗（権限拒否）→ lat/lng なしで `scanOcr` が呼ばれる
  - geolocation 非対応（`navigator.geolocation` が undefined）→ lat/lng なしで `scanOcr` が呼ばれる
- テスト方針: `setInterval` を `jest.spyOn(global, 'setInterval')` でモックしてコールバックをキャプチャし、`tick` を手動で3回実行して OCR フローを起動する形式
  - jsdom 環境では `window.setInterval` の実際の実行が `waitFor` と干渉するため、コールバックを手動実行するアプローチを採用
  - `canvas.toBlob` は jsdom 未実装のため `document.createElement` をスパイしてモックを設定

### 検証結果

- `pnpm --filter frontend typecheck`: エラー 0 件
- `pnpm --filter frontend test`: 150 件 PASS（追加 3 件含む）
- `pnpm --filter backend typecheck`: エラー 0 件
- `pnpm --filter backend test`: 115 件 PASS

# Plan deviation

ラウンド2の修正のみ（ラウンド1からの差分）:
- i18n: `storeSelect.title` / `storeSelect.unknown` → `result.selectStore` / `result.storeUnknown` にキー構造を変更
- テスト設計: `window.setInterval` の実際実行に依存せず、`setInterval` モック + 手動コールバック実行アプローチを採用（jsdom 環境での Promise チェーンとタイマーの干渉を回避）

# Review comments

## 自動評価（2026-05-20 14:30） - ラウンド 1

### 総合判定
**FAIL** （Critical: 0 / High: 0 / Medium: 0 / Low: 3）

### Threshold 達成状況
- 1. 動作性: ❌（Completion criteria 2/21 不通過、typecheck 0件、unit 全PASS）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ⚠️ 算出不能（新規ロジックのコアはユニットテストでカバー済みだが useScan Hook のgeolocationパスは未テスト）
- 4. 敵対的観点: ✅（IDOR は Service 層で所有権チェック済み、DoS は global throttler カバー）
- 5. 保守性: ✅（層境界遵守、DRY遵守、アンチパターン再導入なし、1件のマジックナンバー指摘 Low）

### 不合格理由（generator への差戻しフィードバック）

#### 【Completion Criteria】[Static / i18n]
**【再現手順】**
1. プロジェクトルートで以下を実行:
   ```
   grep "selectStore" frontend/public/locales/ja/scan.json
   ```
2. 結果が 0 件になる（Completion criteria: ヒット1以上が必要）

**【観測される問題】**
- Completion criteria は `grep "selectStore" frontend/public/locales/ja/scan.json` でヒット ≥1 を要求
- 実際の locale ファイルのキーは `storeSelect.title` / `storeSelect.unknown`（`selectStore` ではない）
- `ResultCard.tsx` は `useTranslations('storeSelect')` で `tStore('title')` / `tStore('unknown')` を呼び出している
- 要件 R15 は `t('scan.result.selectStore')` / `t('scan.result.storeUnknown')` キーを明示している

**【期待される修正案】**
下記 2 パターンどちらかで統一すること:

**パターン A（要件に合わせる）**: locale ファイルの namespace を `result` 内に移動し、`selectStore` / `storeUnknown` キーを使う
- `frontend/public/locales/ja/scan.json` の `storeSelect` セクションを削除し、`result` セクションに以下を追加:
  ```json
  "selectStore": "どこで購入しますか？",
  "storeUnknown": "場所不明"
  ```
- `frontend/public/locales/en/scan.json` にも同様に追加
- `frontend/src/components/ResultCard.tsx` の `useTranslations('storeSelect')` を削除し、既存の `t = useTranslations('result')` を使い `t('selectStore')` / `t('storeUnknown')` に変更

**パターン B（実装を追認して completion criteria を緩和）**: task ファイルの completion criteria の grep 文字列を `selectStore` から `storeSelect` に変更し、R15 のキー名記述も更新する

パターン A を推奨（要件との整合性のため）。

---

#### 【Completion Criteria】[Static / Test Coverage]
**【再現手順】**
1. `frontend/src/hooks/useScan.spec.ts` を確認する
2. `grep "geolocation\|getCurrentPosition" frontend/src/hooks/useScan.spec.ts` が 0 件

**【観測される問題】**
- Completion criteria は「`useScan.spec.ts` に geolocation 成功・失敗のテストが存在し PASS する」を要求
- 現状の `useScan.spec.ts` は `scanReducer` の純粋関数テストのみ（222行）で、Hook 自体の geolocation 取得パスのテストが存在しない
- Tests to add セクションに以下3ケースが明記されているが未実装:
  - geolocation 成功 → postOcr に lat/lng が含まれる
  - geolocation 失敗 → lat/lng なしで postOcr（スキャン継続）
  - geolocation 非対応 → lat/lng なしで postOcr（スキャン継続）

**【期待される修正案】**
`frontend/src/hooks/useScan.spec.ts` に以下のテストグループを追加する。`navigator.geolocation` をモックして `startScan` → `runOcrFlow` のパスを検証する。

```typescript
// useScan.spec.ts に追加するテストの骨格
describe('geolocation 連携', () => {
  it('geolocation 成功時: postOcr に lat/lng が渡される', async () => {
    // navigator.geolocation.getCurrentPosition をモックして成功させる
    // scanOcr spy で呼び出し引数を検証
  })

  it('geolocation 失敗（権限拒否）時: lat/lng なしで postOcr が呼ばれる', async () => {
    // getCurrentPosition のエラーコールバックを即時呼び出すモック
  })

  it('geolocation 非対応（navigator.geolocation が undefined）時: lat/lng なしで postOcr が呼ばれる', async () => {
    // navigator.geolocation を undefined にしてスキャン継続を確認
  })
})
```

Hook のレンダリングには `@testing-library/react` の `renderHook` を使用すること。

---

### 改善提案（PASS 時 / 次タスク繰越し可）

- [保守性・Low] `backend/src/shared/places.client.ts` の `radius: 5000`（60行目）はマジックナンバー。`const PLACES_SEARCH_RADIUS_M = 5000` として constants に定義することを推奨
- [保守性・Low] `backend/src/history/history.controller.ts` の `PatchLocationDto` / `PatchHistoryDto` クラスがController ファイル内に直接定義されている。コードベースの他の DTO パターン（`/dto/` サブディレクトリ）に合わせて `backend/src/history/dto/patch-history.dto.ts` に移動すること（機能影響なし）
- [Info] Playwright MCP が未接続のため Layer A の E2E 検証は未実施。GPS 取得 → 店舗選択 UI 表示の完全 E2E フローは人手レビュー推奨

## 自動評価（2026-05-20 18:00） - ラウンド 2

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 2）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 21/21 通過、typecheck 0件 [backend/frontend 両方]、unit backend 115件 PASS / frontend 150件 PASS）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（新規ロジック主要パスカバー済み: geolocation 成功/失敗/非対応 3ケース + PlacesClient 連携 4ケース + PATCH 正常系/403/401 3ケース）
- 4. 敵対的観点: ✅（IDOR は Service 層で findById → userId 所有権チェック後 ForbiddenException、グローバル ThrottlerGuard でDoS対策カバー）
- 5. 保守性: ✅（層境界遵守、DRY遵守、アンチパターン再導入なし、Low 指摘2件は改善提案レベルで閾値違反なし）

### 改善提案（次タスク繰越し可）
- [保守性・Low] `backend/src/shared/places.client.ts` L62 の `radius: 5000` がマジックナンバーのまま。`const PLACES_SEARCH_RADIUS_M = 5000` として定数化することを推奨（ラウンド1指摘引き続き）
- [保守性・Low] `backend/src/history/history.controller.ts` L31-47 の `PatchHistoryDto` / `PatchLocationDto` がコントローラーファイル内に直接定義されている。`backend/src/history/dto/patch-history.dto.ts` に移動することを推奨（ラウンド1指摘引き続き）
