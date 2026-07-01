# 履歴ページ改善 & スキャン UX 改善 実装計画

> **エージェント向け:** REQUIRED SUB-SKILL: `executing-plans` または `subagent-driven-development` を使ってこの計画をタスクごとに実装すること。ステップはチェックボックス構文（`- [ ]`）で追跡。

**目標:** 履歴サムネイル/rawText表示修正・詳細パネル新設・スキャン回数バッジ修正・今日のスキャン確認・住所登録の手動化・Overpassテキスト検索追加。

**アーキテクチャ:** 仕様書 `docs/specs/2026-06-30-history-and-scan-ux-design.md` に準拠。バックエンド型修正→フロントエンド型→UI の順で実装する。各タスクは独立してコミット可能。

**技術スタック:** NestJS / Prisma `$queryRaw` / Next.js App Router / Tailwind CSS / next-intl / Overpass API（無料）

---

## Task 1: A1-バックエンド — ScanRecord 型と findGroupsByUser SQL 修正

**Files:**
- Modify: `backend/src/history/scan-history.repository.ts`

- [ ] **Step 1: ScanRecord 型に thumbnailUrl / rawText を追加する**

`scan-history.repository.ts` の `ScanRecord` 型を以下に変更:

```typescript
export type ScanRecord = {
  id: string;
  scannedAt: Date;
  location: ScanHistoryLocation | null;
  memo: string | null;
  thumbnailUrl: string | null;
  rawText: string | null;
};
```

- [ ] **Step 2: findGroupsByUser SQL の json_build_object に thumbnailUrl / rawText を追加する**

`json_agg` 内の `json_build_object` を以下に変更:

```sql
json_agg(
  json_build_object(
    'id', sh.id,
    'scannedAt', sh.scanned_at,
    'location', sh.location,
    'memo', sh.memo,
    'thumbnailUrl', sh.thumbnail_url,
    'rawText', sh.raw_text
  ) ORDER BY sh.scanned_at DESC
) AS scans
```

- [ ] **Step 3: 型チェック**

```
pnpm --filter backend typecheck
```

- [ ] **Step 4: コミット**

```
git add backend/src/history/scan-history.repository.ts
git commit -m "fix(history): ScanRecord に thumbnailUrl/rawText を追加し SQL の json_agg を修正"
```

---

## Task 2: A1-フロントエンド — ScanEntry 型更新とサムネイル表示修正

**Files:**
- Modify: `frontend/src/app/history/history.types.ts`
- Modify: `frontend/src/app/history/page.tsx`

- [ ] **Step 1: ScanEntry 型に thumbnailUrl / rawText を追加する**

`history.types.ts` の `ScanEntry` 型を変更:

```typescript
export type ScanEntry = {
  id: string
  scannedAt: string
  location: { store_name: string; lat: number; lng: number } | null
  memo: string | null
  thumbnailUrl: string | null
  rawText: string | null
}
```

- [ ] **Step 2: history/page.tsx のサムネイル表示を修正する**

商品ヘッダーのサムネイル部分で `firstScan.thumbnailUrl ?? group.product.thumbnailUrl` を優先表示する。
`firstScan` は `group.scans[0]`（最新スキャン）。

- [ ] **Step 3: 型チェック**

```
pnpm --filter frontend typecheck
```

- [ ] **Step 4: コミット**

```
git add frontend/src/app/history/history.types.ts frontend/src/app/history/page.tsx
git commit -m "fix(history): ScanEntry に thumbnailUrl/rawText 追加、サムネイル優先順位を修正"
```

---

## Task 3: B4-バックエンド — Overpass テキスト検索と住所逆引き

**Files:**
- Modify: `backend/src/shared/places.interface.ts`
- Modify: `backend/src/shared/overpass-places.client.ts`
- Modify: `backend/src/shared/google-places.client.ts`
- Modify: `backend/src/shared/hybrid-places.client.ts`
- Modify: `backend/src/scan/places.service.ts`
- Modify: `backend/src/scan/dto/place-candidates.dto.ts`
- Modify: `backend/src/scan/places.controller.ts`

- [ ] **Step 1: places.interface.ts — StoreCandidate に address? を追加し query? パラメータを追加する**

```typescript
export type StoreCandidate = {
  name: string;
  placeId: string;
  address?: string;
};

export interface StoreCandidateProvider {
  getStoreCandidates(lat: number, lng: number, query?: string): Promise<StoreCandidate[]>;
}

export const PLACES_PROVIDER_TOKEN = 'PLACES_PROVIDER_TOKEN';
```

- [ ] **Step 2: overpass-places.client.ts — テキスト検索と住所フィールドを追加する**

`getStoreCandidates(lat, lng, query?)` を実装:
- `query` あり → `node["name"~"<query>",i](around:1000,lat,lng)` で検索
- `query` なし → 既存の shop タグ近隣検索

住所組み立て（優先順）: `addr:full` → `addr:province + addr:city + addr:suburb + addr:housenumber` → undefined

エラー・タイムアウト時は `[]` を返す（例外を投げない）。

- [ ] **Step 3: google-places.client.ts — シグネチャに _query? を追加する（無視）**

```typescript
async getStoreCandidates(lat: number, lng: number, _query?: string): Promise<StoreCandidate[]>
```

- [ ] **Step 4: hybrid-places.client.ts — query? を両クライアントに転送する**

- [ ] **Step 5: places.service.ts — query? を受け取り転送する**

- [ ] **Step 6: place-candidates.dto.ts — q?: string を追加する**

```typescript
@IsOptional()
@IsString()
q?: string;
```

- [ ] **Step 7: places.controller.ts — dto.q を getCandidates に渡す**

- [ ] **Step 8: 型チェック**

```
pnpm --filter backend typecheck
```

- [ ] **Step 9: コミット**

```
git add backend/src/shared/places.interface.ts backend/src/shared/overpass-places.client.ts backend/src/shared/google-places.client.ts backend/src/shared/hybrid-places.client.ts backend/src/scan/places.service.ts backend/src/scan/dto/place-candidates.dto.ts backend/src/scan/places.controller.ts
git commit -m "feat(places): Overpass テキスト検索・住所逆引きに対応し query パラメータを追加"
```

---

## Task 4: B4-フロントエンド — StoreCandidate 型・places.api.ts・useScan.ts 更新

**Files:**
- Modify: `frontend/src/app/scan/scan.types.ts`
- Modify: `frontend/src/lib/api/places.api.ts`
- Modify: `frontend/src/hooks/useScan.ts`

- [ ] **Step 1: scan.types.ts — StoreCandidate に address? を追加する**

```typescript
export type StoreCandidate = {
  name: string
  placeId: string
  address?: string
}
```

- [ ] **Step 2: places.api.ts — query? パラメータを追加する**

```typescript
export const getPlaceCandidates = async (
  lat: number,
  lng: number,
  query?: string,
): Promise<PlaceCandidatesResponse> => {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) })
  if (query) params.set('q', query)
  const res = await apiFetch(`/places/candidates?${params.toString()}`)
  return res.json() as Promise<PlaceCandidatesResponse>
}
```

- [ ] **Step 3: useScan.ts — fetchPlaceCandidates に query? を追加する**

```typescript
const fetchPlaceCandidates = useCallback(
  async (query?: string): Promise<PlaceCandidatesResponse | null> => {
    const geo = geolocationRef.current
    if (!geo) return null
    return fetchPlaceCandidatesApi(geo.lat, geo.lng, query)
  },
  [fetchPlaceCandidatesApi],
)
```

- [ ] **Step 4: 型チェック**

```
pnpm --filter frontend typecheck
```

- [ ] **Step 5: コミット**

```
git add frontend/src/app/scan/scan.types.ts frontend/src/lib/api/places.api.ts frontend/src/hooks/useScan.ts
git commit -m "feat(places): StoreCandidate.address 追加・API クライアントに query パラメータを追加"
```

---

## Task 5: B3+B4-フロントエンド — ResultCard 自動フェッチ廃止・テキスト検索 UI 追加

**Files:**
- Modify: `frontend/src/components/organisms/ResultCard.tsx`
- Modify: `frontend/src/components/organisms/ResultCardQueue.tsx`
- Modify: `frontend/public/locales/ja/scan.json`
- Modify: `frontend/public/locales/en/scan.json`

- [ ] **Step 1: ResultCardProps の onFetchPlaceCandidates シグネチャを更新する**

```typescript
onFetchPlaceCandidates?: (query?: string) => Promise<PlaceCandidatesResponse | null>
```

- [ ] **Step 2: 自動フェッチを廃止する**

削除:
- `autoFetchDoneRef` の宣言
- geolocation をトリガーとした自動フェッチ `useEffect`（`autoFetchDoneRef` を使っているもの）

- [ ] **Step 3: テキスト検索 state を追加する**

```typescript
const [searchQuery, setSearchQuery] = useState('')
const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

- [ ] **Step 4: ボタン押下・クエリ変更時のみフェッチする関数を追加する**

```typescript
const handleFetchCandidates = async (query?: string): Promise<void> => {
  if (!onFetchPlaceCandidates) return
  setLocationUiState('loading')
  const data = await onFetchPlaceCandidates(query)
  if (!data || (data.candidates.length === 0 && data.address === null)) {
    setLocationUiState(query ? 'select' : 'idle')
    if (query) setPlaceCandidates({ candidates: [], address: null })
    return
  }
  setPlaceCandidates(data)
  if (data.address) setEditAddress(data.address)
  setLocationUiState('select')
}

const handleSearchQueryChange = (value: string): void => {
  setSearchQuery(value)
  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
  searchDebounceRef.current = setTimeout(() => {
    void handleFetchCandidates(value || undefined)
  }, 500)
}
```

- [ ] **Step 5: 場所登録 UI を変更する**

`locationUiState === 'idle'` のとき「📍 場所を登録」ボタンのみ表示。
タップで `handleFetchCandidates()` を呼び出す。
`locationUiState === 'select'` のとき:
- テキスト検索入力フィールドを追加
- 候補に `candidate.address` を名前の下に表示
- 住所のみ登録ボタンも表示

- [ ] **Step 6: scan.json に registerLocation.searchPlaceholder を追加する**

ja: `"searchPlaceholder": "店舗名を検索..."`
en: `"searchPlaceholder": "Search store name..."`

- [ ] **Step 7: ResultCardQueue.tsx の onFetchPlaceCandidates 型を更新する**

```typescript
onFetchPlaceCandidates?: (query?: string) => Promise<PlaceCandidatesResponse | null>
```

- [ ] **Step 8: 型チェック**

```
pnpm --filter frontend typecheck
```

- [ ] **Step 9: コミット**

```
git add frontend/src/components/organisms/ResultCard.tsx frontend/src/components/organisms/ResultCardQueue.tsx frontend/public/locales/ja/scan.json frontend/public/locales/en/scan.json
git commit -m "feat(scan): 場所登録を手動化・テキスト検索 UI と店舗住所表示を追加"
```

---

## Task 6: A3-フロントエンド — HistoryDetailPanel 新規作成と i18n 追加

**Files:**
- Create: `frontend/src/components/organisms/HistoryDetailPanel.tsx`
- Modify: `frontend/public/locales/ja/history.json`
- Modify: `frontend/public/locales/en/history.json`

- [ ] **Step 1: history.json（ja）の detail セクションにキーを追加する**

既存の `detail.*` キーに加えて以下を追加:

```json
"title": "スキャン詳細",
"productName": "商品名",
"storeName": "店舗名",
"save": "保存",
"cancel": "キャンセル",
"editMode": "✏️ 編集する",
"caution": "購入前にラベルの実物も必ずご確認ください",
"judgment": {
  "ng": "NG",
  "partial": "一部含む",
  "ok": "問題なし"
}
```

- [ ] **Step 2: history.json（en）の detail セクションに同じキーを追加する**

```json
"title": "Scan Detail",
"productName": "Product name",
"storeName": "Store",
"save": "Save",
"cancel": "Cancel",
"editMode": "✏️ Edit",
"caution": "Always check the actual label before purchasing",
"judgment": {
  "ng": "NG",
  "partial": "Partial",
  "ok": "OK"
}
```

- [ ] **Step 3: HistoryDetailPanel.tsx を新規作成する**

Bottom Sheet スタイル。`isOpen` が false の場合は `null` を返す。

Props:
```typescript
type Props = {
  group: HistoryGroup
  selectedScan: ScanEntry
  isOpen: boolean
  onClose: () => void
  onPatch: (scanId: string, data: { product_name?: string | null; store_name?: string | null; memo?: string | null }) => Promise<void>
  onDelete: (scanId: string) => void
}
```

表示モード:
- 固定オーバーレイ（背景クリックで閉じる）
- サムネイル（`selectedScan.thumbnailUrl ?? group.product.thumbnailUrl`）
- 判定絵文字と判定ラベル（`t('detail.judgment.ng/partial/ok')`）
- 検出アレルゲンリスト（`group.detected`）
- 店舗名・メモ・日時の表示
- rawText アコーディオン（`selectedScan.rawText`）
- ⚠️ 安全設計: 免責文（`t('detail.caution')`）省略禁止
- 編集・削除ボタン

編集モード:
- productName / storeName / memo のテキスト入力
- キャンセル・保存ボタン

削除は `window.confirm` で確認後 `onDelete` を呼ぶ。

- [ ] **Step 4: 型チェック**

```
pnpm --filter frontend typecheck
```

- [ ] **Step 5: コミット**

```
git add frontend/src/components/organisms/HistoryDetailPanel.tsx frontend/public/locales/ja/history.json frontend/public/locales/en/history.json
git commit -m "feat(history): HistoryDetailPanel コンポーネントを新規作成"
```

---

## Task 7: A2+A3-フロントエンド — history/page.tsx カード右上アイコンと HistoryDetailPanel 組み込み

**Files:**
- Modify: `frontend/src/app/history/page.tsx`

- [ ] **Step 1: HistoryDetailPanel を import する**

```typescript
import { HistoryDetailPanel } from '@/components/organisms/HistoryDetailPanel'
```

- [ ] **Step 2: detailTarget state と handleDetailOpen/Close を追加する**

```typescript
const [detailTarget, setDetailTarget] = useState<{ group: HistoryGroup; scan: ScanEntry } | null>(null)

const handleDetailOpen = (group: HistoryGroup, scan: ScanEntry): void => {
  setDetailTarget({ group, scan })
}
const handleDetailClose = (): void => setDetailTarget(null)
```

- [ ] **Step 3: handleDetailPatch を追加する**

```typescript
const handleDetailPatch = async (
  scanId: string,
  data: { product_name?: string | null; store_name?: string | null; memo?: string | null },
): Promise<void> => {
  return new Promise((resolve, reject) => {
    updateHistoryMutation.mutate(
      { id: scanId, ...data },
      { onSuccess: () => resolve(), onError: (err) => reject(err) },
    )
  })
}
```

- [ ] **Step 4: 商品ヘッダー JSX に右上アイコンを追加する**

商品ヘッダー div 内の右端に追加:

```tsx
<div className="flex items-center gap-0.5 shrink-0">
  <button
    type="button"
    onClick={() => handleDetailOpen(group, firstScan)}
    aria-label={t('detail.editAriaLabel')}
    className="p-2 text-gray-400 hover:text-blue-600 text-base"
  >
    ✏️
  </button>
  <button
    type="button"
    onClick={() => void handleDelete(firstScan.id)}
    aria-label={t('detail.deleteAriaLabel')}
    className="p-2 text-gray-400 hover:text-red-600 text-base"
  >
    🗑️
  </button>
</div>
```

- [ ] **Step 5: 店舗リスト行クリックで HistoryDetailPanel を開く**

各スキャン行の onClick を変更:
```typescript
onClick={() => handleDetailOpen(group, scan)}
```

- [ ] **Step 6: フッターの「編集」ボタンを削除し、楽天リンクのみ残す**

フッターに楽天リンクのみ表示:
```tsx
{!isSelectMode && group.product.itemUrl && (
  <div className="px-3 py-2 bg-gray-50">
    <a href={group.product.itemUrl} target="_blank" rel="noopener noreferrer"
       className="text-xs text-red-600 font-medium hover:underline">
      {t('group.rakutenLink')}
    </a>
  </div>
)}
```

- [ ] **Step 7: HistoryDetailPanel を JSX 末尾に追加する**

```tsx
{detailTarget && (
  <HistoryDetailPanel
    group={detailTarget.group}
    selectedScan={detailTarget.scan}
    isOpen={true}
    onClose={handleDetailClose}
    onPatch={handleDetailPatch}
    onDelete={(scanId) => { void handleDelete(scanId); handleDetailClose() }}
  />
)}
```

- [ ] **Step 8: 型チェック**

```
pnpm --filter frontend typecheck
```

- [ ] **Step 9: コミット**

```
git add frontend/src/app/history/page.tsx
git commit -m "feat(history): カード右上に編集/削除アイコン追加・HistoryDetailPanel を組み込み"
```

---

## Task 8: B1-フロントエンド — スキャン回数バッジ更新バグ修正

**Files:**
- Modify: `frontend/src/app/scan/page.tsx`

- [ ] **Step 1: doneJobs.length 変化時に refreshScanUsage を呼ぶ useEffect を追加する**

既存の `scanState` 監視 `useEffect` の直後に追加:

```typescript
useEffect(() => {
  if (doneJobs.length > 0) refreshScanUsage()
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [doneJobs.length])
```

- [ ] **Step 2: 型チェック**

```
pnpm --filter frontend typecheck
```

- [ ] **Step 3: コミット**

```
git add frontend/src/app/scan/page.tsx
git commit -m "fix(scan): doneJobs 増加時にスキャン回数バッジを更新する"
```

---

## Task 9: B2-フロントエンド — useScanQueue localStorage 保存と useTodayScans 追加

**Files:**
- Modify: `frontend/src/hooks/useScanQueue.ts`

- [ ] **Step 1: localStorage スキーマと保存関数を追加する**

ファイル先頭（`'use client'` 直後）に追加:

```typescript
const SCAN_TODAY_KEY = 'scan:today:v1'

export type TodayScanItem = {
  id: string
  capturedAt: string
  judgment: 'ng' | 'partial' | 'ok'
  productName: string | null
  detected: string[]
  rawText: string | null
}

type TodayScanCache = {
  date: string
  items: TodayScanItem[]
}

const persistTodayScan = (job: ScanJob & { result: OcrApiResponse }): void => {
  if (typeof window === 'undefined') return
  const today = new Date().toISOString().slice(0, 10)
  let cache: TodayScanCache
  try {
    const raw = localStorage.getItem(SCAN_TODAY_KEY)
    cache = raw ? (JSON.parse(raw) as TodayScanCache) : { date: today, items: [] }
  } catch {
    cache = { date: today, items: [] }
  }
  if (cache.date !== today) cache = { date: today, items: [] }

  const judgment: 'ng' | 'partial' | 'ok' =
    job.result.results.some((r) => r.detection_type === 'contains')
      ? 'ng'
      : job.result.results.some(
          (r) => r.detection_type === 'partial' || r.detection_type === 'may_contain',
        )
        ? 'partial'
        : 'ok'
  const detected = job.result.results
    .filter((r) => r.judgment !== 'なし' && r.judgment !== '判定不能')
    .map((r) => r.allergen)
  cache.items.push({
    id: job.id,
    capturedAt: job.capturedAt.toISOString(),
    judgment,
    productName: job.result.product_name ?? null,
    detected,
    rawText: job.result.raw_text,
  })
  try {
    localStorage.setItem(SCAN_TODAY_KEY, JSON.stringify(cache))
  } catch {
    // localStorage がいっぱいの場合は無視
  }
}
```

- [ ] **Step 2: addJob の updateJob('done') 後に persistTodayScan を呼ぶ**

行 `updateJob(jobId, { state: 'done', result, progress: 100 })` の直後に:

```typescript
persistTodayScan({ ...job, state: 'done', result, progress: 100 })
```

※ `job` は `addJob` の冒頭で作成した `ScanJob` オブジェクト。スコープが違う場合は `result` と `capturedAt` を使って代入する。

- [ ] **Step 3: useTodayScans hook をファイル末尾にエクスポートする**

```typescript
export const useTodayScans = (doneJobsCount: number): TodayScanItem[] => {
  const [items, setItems] = useState<TodayScanItem[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const today = new Date().toISOString().slice(0, 10)
    try {
      const raw = localStorage.getItem(SCAN_TODAY_KEY)
      if (!raw) { setItems([]); return }
      const cache = JSON.parse(raw) as TodayScanCache
      if (cache.date !== today) { setItems([]); return }
      setItems(cache.items)
    } catch {
      setItems([])
    }
  }, [doneJobsCount])

  return items
}
```

- [ ] **Step 4: 型チェック**

```
pnpm --filter frontend typecheck
```

- [ ] **Step 5: コミット**

```
git add frontend/src/hooks/useScanQueue.ts
git commit -m "feat(scan): 完了ジョブを localStorage に保存する useTodayScans を追加"
```

---

## Task 10: B2-フロントエンド — TodayScansSheet 作成と scan/page.tsx 組み込み

**Files:**
- Create: `frontend/src/components/organisms/TodayScansSheet.tsx`
- Modify: `frontend/src/app/scan/page.tsx`
- Modify: `frontend/public/locales/ja/scan.json`
- Modify: `frontend/public/locales/en/scan.json`

- [ ] **Step 1: scan.json に today.* キーと unnamed を追加する**

ja:
```json
"today": {
  "button": "今日 {count}件",
  "title": "今日のスキャン",
  "empty": "まだスキャン結果がありません",
  "rawText": "原材料テキスト",
  "back": "戻る"
},
"unnamed": "商品名なし"
```

en:
```json
"today": {
  "button": "Today {count}",
  "title": "Today's scans",
  "empty": "No scan results yet",
  "rawText": "Ingredients text",
  "back": "Back"
},
"unnamed": "Unnamed product"
```

- [ ] **Step 2: TodayScansSheet.tsx を新規作成する**

`frontend/src/components/organisms/TodayScansSheet.tsx`:

一覧表示と詳細表示の2モードを持つ Bottom Sheet。

Props:
```typescript
type Props = {
  items: TodayScanItem[]
  isOpen: boolean
  onClose: () => void
}
```

一覧表示: items を新しい順（reverse）で表示。各行に絵文字・productName・detected・時刻。タップで詳細へ。

詳細表示: 判定絵文字・productName・detected chips・rawText（`t('today.rawText')` ラベル付き）・スキャン日時。
⚠️ 安全設計: `t('result.caution')` を常時表示（省略禁止）。
「← 戻る」ボタンで一覧に戻る。

- [ ] **Step 3: scan/page.tsx に TodayScansSheet と「今日 N件」ボタンを追加する**

import 追加:
```typescript
import { TodayScansSheet } from '@/components/organisms/TodayScansSheet'
import { useTodayScans } from '@/hooks/useScanQueue'
```

state 追加:
```typescript
const [showTodayScans, setShowTodayScans] = useState(false)
const todayScans = useTodayScans(doneJobs.length)
```

撮影ボタンエリアの `div.flex.items-center.gap-6` 内（ファイルアップロードボタンの後）に追加:

```tsx
{todayScans.length > 0 && (
  <button
    type="button"
    onClick={() => setShowTodayScans(true)}
    className="flex flex-col items-center gap-1 rounded-2xl bg-black/40 px-4 py-3 text-white backdrop-blur-sm"
  >
    <span className="text-2xl">📋</span>
    <span className="text-xs font-medium">{t('today.button', { count: todayScans.length })}</span>
  </button>
)}
```

JSX 末尾（`</>` 直前）に追加:

```tsx
{showTodayScans && (
  <TodayScansSheet
    items={todayScans}
    isOpen={showTodayScans}
    onClose={() => setShowTodayScans(false)}
  />
)}
```

- [ ] **Step 4: 型チェック**

```
pnpm --filter frontend typecheck
```

- [ ] **Step 5: コミット**

```
git add frontend/src/components/organisms/TodayScansSheet.tsx frontend/src/app/scan/page.tsx frontend/public/locales/ja/scan.json frontend/public/locales/en/scan.json
git commit -m "feat(scan): 今日のスキャン確認機能を追加（TodayScansSheet）"
```

---

## セルフレビュー

### 仕様カバレッジ

| 仕様要件 | 実装タスク |
|---|---|
| A1: SQL に thumbnailUrl/rawText 追加 | Task 1, 2 |
| A2: カード右上に ✏️🗑️ アイコン | Task 7 |
| A3: HistoryDetailPanel 新規作成 | Task 6, 7 |
| B1: スキャン回数バッジ修正 | Task 8 |
| B2: 今日のスキャン確認 | Task 9, 10 |
| B3: 住所登録自動フェッチ廃止 | Task 5 |
| B4: Overpass テキスト検索 + 住所逆引き | Task 3, 4, 5 |

### 型一貫性

- `ScanRecord.thumbnailUrl/rawText`（Task 1）→ `ScanEntry.thumbnailUrl/rawText`（Task 2）→ `HistoryDetailPanel`（Task 6）✅
- `StoreCandidate.address?`（Task 3 BE / Task 4 FE）→ `ResultCard` 候補表示（Task 5）✅
- `onFetchPlaceCandidates?: (query?) => ...`（Task 4）→ ResultCard（Task 5）・ResultCardQueue（Task 5）✅
- `TodayScanItem`（Task 9）→ `TodayScansSheet`（Task 10）✅
- `useTodayScans(doneJobsCount)`（Task 9）→ `scan/page.tsx` で `doneJobs.length` を渡す（Task 10）✅
