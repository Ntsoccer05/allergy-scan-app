# 店舗キャッシュ Yahoo! Local Search 移行 実装計画

> **エージェント向け:** REQUIRED SUB-SKILL: `executing-plans` または `subagent-driven-development` を使ってこの計画をタスクごとに実装すること。ステップはチェックボックス構文（`- [ ]`）で追跡。

**目標:** Overpass API を廃止し、Yahoo! Local Search API を使った DB キャッシュベースの店舗検索に切り替える。大都市（100万人超）は 30 日、地方都市は 90 日の `expires_at` で月次バッチが自動的に頻度を変えて更新する。夜間バッチは旧バッチデータを物理削除して入れ替える。フロントエンドに距離スライダーを追加する。

**アーキテクチャ:**
- Yahoo! Local Search API（無料・50,000件/日）で半径 20km の店舗を取得し `store_cache` テーブルに保存
- `GET /places/candidates` は DB キャッシュから返す（Yahoo API は直接叩かない）
- `store_cache` の `source` カラム（`'batch'` | `'realtime'`）でバッチ由来を識別し、月次バッチは旧バッチデータを物理削除してから新データに入れ替える
- 大都市（人口 100 万人超）: `expires_at` = 30 日 / 地方都市: 90 日
- `POST /scan/ocr` 完了時に `cache_jobs` テーブルへキュー投入 → `POST /internal/cache-jobs/process`（EventBridge トリガー）でバックグラウンド処理
- フロントエンドは全候補をメモリに保持し、距離スライダーで即座にフィルタ（0ms レスポンス）
- 地方ユーザー（キャッシュ MISS）は即空返却 + バックグラウンドフェッチ、手動入力フォールバック常時表示

**技術スタック:** NestJS / Prisma / PostgreSQL / Yahoo! Local Search API V1 / Next.js / next-intl

---

## 設計定数

```
Yahoo API ジャンルコード（14種）:
  0205    コンビニ・スーパー
  0202    ドラッグストア
  0402001 薬局
  0204001 百貨店・デパート
  0204002 ショッピングセンター
  0204004 ホームセンター
  0206002 ディスカウントショップ
  0207008 100円ショップ
  0210    食品・食材全般
  0114001 持ち帰り・弁当
  0117001 ベーカリー
  0118001 洋菓子・ケーキ
  0118002 和菓子
  0307003 道の駅

都市 tier 定義:
  metro    = 人口 100 万人超の大都市（東京・横浜・大阪・名古屋・札幌・福岡・川崎・神戸・京都・さいたま・広島・仙台）
  regional = その他の県庁所在地・主要都市

expires_at（store_cache / store_cache_areas 共通）:
  METRO:    30 日（店舗入れ替わりが速い大都市）
  REGIONAL: 90 日（変動が少ない地方都市）

キャッシュ設定:
  STORE_CACHE_RADIUS_KM = 20       （Yahoo API 上限・常に固定）
  STORE_CACHE_MAX_RESULTS = 100    （Yahoo API 1回あたりの取得件数上限）

アダプティブ表示:
  ADAPTIVE_DISPLAY_STEPS_KM = [5, 10, 20]
  ADAPTIVE_MIN_CANDIDATES = 3

source 値:
  'batch'    = 夜間バッチ由来（月次バッチで物理削除して入れ替え）
  'realtime' = ユーザースキャン起点のバックグラウンドフェッチ由来
```

---

## ファイルマップ

| ファイル | 操作 | 概要 |
|---|---|---|
| `backend/src/shared/clients/gemini.client.ts` | Move | `shared/` から移動 |
| `backend/src/shared/clients/s3.client.ts` | Move | 同上 |
| `backend/src/shared/clients/gsi-geocoder.client.ts` | Move | 同上（現在地の住所取得のため残す） |
| `backend/src/shared/clients/yahoo-local-search.client.ts` | Create | Yahoo API クライアント（新規） |
| `backend/src/shared/places/places.constants.ts` | Move + Modify | Overpass 定数削除・Yahoo 定数追加 |
| `backend/src/shared/places/places.interface.ts` | Move + Modify | StoreCandidate に distanceKm 追加 |
| `backend/src/shared/throttler/throttler.constants.ts` | Move | 同上 |
| `backend/src/shared/throttler/throttler-exception.filter.ts` | Move | 同上 |
| `backend/src/shared/overpass-places.client.ts` | **Delete** | Overpass 廃止 |
| `backend/src/shared/hybrid-places.client.ts` | **Delete** | 不使用 |
| `backend/src/shared/google-places.client.ts` | **Delete** | 課金禁止・不使用 |
| `backend/prisma/schema.prisma` | Modify | StoreCache / StoreCacheArea / CacheJob モデル追加 |
| `backend/src/scan/store-cache.repository.ts` | Create | store_cache / cache_jobs DB 操作 |
| `backend/src/scan/store-cache.service.ts` | Create | キャッシュ取得・Yahoo フェッチ・Haversine 計算 |
| `backend/src/scan/places.service.ts` | Modify | Overpass→StoreCacheService に変更 |
| `backend/src/scan/scan.service.ts` | Modify | OCR 完了後に cache_jobs 投入 |
| `backend/src/scan/scan.module.ts` | Modify | 新 Provider を追加 |
| `backend/src/scan/cache-job.controller.ts` | Create | POST /internal/cache-jobs/process |
| `backend/scripts/warmup-store-cache.ts` | Create | 月次バッチスクリプト（tier 対応） |
| `frontend/src/app/scan/scan.types.ts` | Modify | StoreCandidate に distanceKm 追加 |
| `frontend/src/hooks/useScanApi.ts` | Modify | OCR リクエストに GPS 座標追加 |
| `frontend/src/components/organisms/ResultCard.tsx` | Modify | 距離スライダー追加 |
| `frontend/public/locales/ja/scan.json` | Modify | 距離スライダー i18n キー |
| `frontend/public/locales/en/scan.json` | Modify | 距離スライダー i18n キー |

---

## Task 0: shared フォルダ整理・不要ファイル削除

**Files:**
- Move: `backend/src/shared/*.ts` → サブフォルダに移動
- Delete: `overpass-places.client.ts` / `hybrid-places.client.ts` / `google-places.client.ts`

- [ ] **Step 1: フォルダ作成**

```bash
mkdir -p backend/src/shared/clients
mkdir -p backend/src/shared/places
mkdir -p backend/src/shared/throttler
```

- [ ] **Step 2: ファイル移動**

```bash
# clients/
mv backend/src/shared/gemini.client.ts          backend/src/shared/clients/
mv backend/src/shared/gemini.client.spec.ts     backend/src/shared/clients/
mv backend/src/shared/s3.client.ts              backend/src/shared/clients/
mv backend/src/shared/gsi-geocoder.client.ts    backend/src/shared/clients/
mv backend/src/shared/gsi-geocoder.client.spec.ts backend/src/shared/clients/

# places/
mv backend/src/shared/places.constants.ts       backend/src/shared/places/
mv backend/src/shared/places.interface.ts       backend/src/shared/places/

# throttler/
mv backend/src/shared/throttler.constants.ts    backend/src/shared/throttler/
mv backend/src/shared/throttler-exception.filter.ts backend/src/shared/throttler/
```

- [ ] **Step 3: 不要ファイルを削除**

```bash
rm backend/src/shared/overpass-places.client.ts
rm backend/src/shared/overpass-places.client.spec.ts
rm backend/src/shared/hybrid-places.client.ts
rm backend/src/shared/google-places.client.ts
rm backend/src/shared/google-places.client.spec.ts
```

- [ ] **Step 4: import パスを全ファイル一括更新**

移動前のパス → 移動後のパスへ全 import を更新する。主な変更箇所:

```
'../shared/gemini.client'              → '../shared/clients/gemini.client'
'../shared/s3.client'                  → '../shared/clients/s3.client'
'../shared/gsi-geocoder.client'        → '../shared/clients/gsi-geocoder.client'
'../shared/places.constants'           → '../shared/places/places.constants'
'../shared/places.interface'           → '../shared/places/places.interface'
'../shared/throttler.constants'        → '../shared/throttler/throttler.constants'
'../shared/throttler-exception.filter' → '../shared/throttler/throttler-exception.filter'
```

対象ファイル（import が含まれる全 .ts ファイルを grep して修正）:
```bash
grep -rl "from '../shared/gemini\|from '../shared/s3\|from '../shared/gsi\|from '../shared/places\|from '../shared/throttler" backend/src/
```

- [ ] **Step 5: `PLACES_PROVIDER_TOKEN` / OverpassPlacesClient への import がある場合は削除する**

```bash
grep -rl "OverpassPlacesClient\|PLACES_PROVIDER_TOKEN\|overpass-places\|hybrid-places\|google-places" backend/src/
```

見つかったファイルから import と使用箇所を削除する。

- [ ] **Step 6: 型チェック通過確認**

```bash
pnpm --filter backend typecheck
```

Expected: エラーなし

- [ ] **Step 7: ユニットテストを実行**

```bash
pnpm --filter backend test
```

Expected: PASS（import パス変更のみなので既存テストは壊れない）

- [ ] **Step 8: コミット**

```bash
git add backend/src/shared/
git commit -m "refactor: reorganize shared/ into clients/ places/ throttler/ subfolders, remove Overpass/Google/Hybrid clients"
```

---

## Task 1: Prisma スキーマ追加（DB テーブル定義）

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: schema.prisma に 3 モデルを追加する**

`backend/prisma/schema.prisma` の末尾（BackupCode モデルの後）に追加:

```prisma
// 店舗キャッシュ（Yahoo! Local Search API から取得した店舗情報）
// source='batch': 夜間バッチ由来（月次バッチで物理削除して入れ替え）
// source='realtime': ユーザースキャン起点のバックグラウンドフェッチ由来
model StoreCache {
  id        String   @id @default(uuid())
  uid       String   @unique                  // Yahoo の Uid（重複排除キー）
  name      String
  address   String?
  genre     String?                           // Yahoo ジャンル名（/ 区切り）
  lat       Float
  lng       Float
  source    String   @default("realtime")     // 'batch' | 'realtime'
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([lat, lng], name: "store_cache_geo_idx")
  @@index([expiresAt], name: "store_cache_expires_idx")
  @@index([source, updatedAt], name: "store_cache_source_idx")
  @@map("store_cache")
}

// キャッシュ済みエリアの記録（同一エリアの重複フェッチ防止）
// tier='metro': 大都市（30日）/ tier='regional': 地方都市（90日）
model StoreCacheArea {
  id        String   @id @default(uuid())
  // グリッドセルキー: "{lat*100を切り捨て}_{lng*100を切り捨て}" 形式（0.01° ≒ 1km グリッド）
  gridKey   String   @unique @map("grid_key")
  radiusKm  Int      @map("radius_km")
  tier      String   @default("regional")    // 'metro' | 'regional'
  fetchedAt DateTime @default(now()) @map("fetched_at")
  expiresAt DateTime @map("expires_at")

  @@index([expiresAt], name: "store_cache_area_expires_idx")
  @@map("store_cache_areas")
}

// バックグラウンドキャッシュジョブキュー
model CacheJob {
  id          String    @id @default(uuid())
  lat         Float
  lng         Float
  status      String    @default("pending")  // 'pending' | 'processing' | 'done' | 'failed'
  createdAt   DateTime  @default(now()) @map("created_at")
  processedAt DateTime? @map("processed_at")

  @@index([status, createdAt], name: "cache_jobs_status_idx")
  @@map("cache_jobs")
}
```

**`@@map("store_cache")` の説明（コメント）:**  
Prisma はモデル名をそのままDBテーブル名にするため `StoreCache` → `StoreCache` テーブルになってしまう。`@@map` でDBのテーブル名を `store_cache`（snake_case）に指定する。`@@map` がない場合は DB に `StoreCache` テーブルが作られる。

- [ ] **Step 2: マイグレーション生成・適用**

```bash
cd C:/WorkSpace/allergy-scan-app/backend
npx prisma migrate dev --name add-store-cache
```

Expected: `backend/prisma/migrations/YYYYMMDD_add_store_cache/migration.sql` が生成・適用される

- [ ] **Step 3: 型チェック通過確認**

```bash
pnpm --filter backend typecheck
```

---

## Task 2: 定数・インターフェース更新

**Files:**
- Modify: `backend/src/shared/places/places.constants.ts`
- Modify: `backend/src/shared/places/places.interface.ts`

- [ ] **Step 1: places.constants.ts を新しい定数に全面置き換えする**

```typescript
// ── 国土地理院 逆ジオコーダ ─────────────────────────────────────────────
/** 国土地理院 逆ジオコーダ API のタイムアウト（ms） */
export const GSI_GEOCODER_TIMEOUT_MS = 5_000;

// ── Yahoo! Local Search API ──────────────────────────────────────────────

/** Yahoo API で取得するキャッシュ半径（km）。Yahoo API 上限値で常に固定。 */
export const STORE_CACHE_RADIUS_KM = 20;

/**
 * store_cache / store_cache_areas の有効期限（日数）。
 * metro: 大都市（100万人超）は店舗入れ替わりが速いため短め。
 * regional: 地方都市は変動が少ないため長め。
 */
export const STORE_CACHE_EXPIRE_DAYS = {
  METRO: 30,
  REGIONAL: 90,
} as const;

/** Yahoo API 1 リクエストあたりの取得件数（上限） */
export const STORE_CACHE_MAX_RESULTS = 100;

/** アダプティブ表示の距離ステップ（km）。不足なら次の距離へ拡大。 */
export const ADAPTIVE_DISPLAY_STEPS_KM = [5, 10, 20] as const;

/** アダプティブ表示でこの件数を下回ったら次の距離ステップへ拡大する。 */
export const ADAPTIVE_MIN_CANDIDATES = 3;

/** Yahoo! Local Search API のジャンルコード（食品購入場面をカバーする 14 種） */
export const YAHOO_LOCAL_SEARCH_GENRES = [
  '0205',     // コンビニ・スーパー
  '0202',     // ドラッグストア
  '0402001',  // 薬局
  '0204001',  // 百貨店・デパート
  '0204002',  // ショッピングセンター
  '0204004',  // ホームセンター
  '0206002',  // ディスカウントショップ
  '0207008',  // 100円ショップ
  '0210',     // 食品・食材全般
  '0114001',  // 持ち帰り・弁当
  '0117001',  // ベーカリー
  '0118001',  // 洋菓子・ケーキ
  '0118002',  // 和菓子
  '0307003',  // 道の駅
] as const;

/** Yahoo API 1 ジャンルあたりの最大取得ページ数（1ページ=100件・最大30ページ=3,000件/ジャンル） */
export const YAHOO_MAX_PAGES_PER_GENRE = 30;

/** Yahoo API のリクエスト間隔（ms）。レート制限対策。 */
export const YAHOO_REQUEST_INTERVAL_MS = 300;
```

- [ ] **Step 2: places.interface.ts の StoreCandidate に distanceKm を追加する**

```typescript
/** getStoreCandidates の返却要素 */
export type StoreCandidate = {
  name: string;
  placeId: string;
  address?: string;
  /** 現在地からの距離（km）。Haversine で算出。DB キャッシュ経由の場合のみセット。 */
  distanceKm?: number;
};
```

`StoreCandidateProvider` インターフェースと `PLACES_PROVIDER_TOKEN` は Task 0 でファイルを移動したため削除する（DI パターンは `StoreCacheService` の直接注入に変わるため不要）。

- [ ] **Step 3: 型チェック通過確認**

```bash
pnpm --filter backend typecheck
```

---

## Task 3: Yahoo! Local Search クライアント

**Files:**
- Create: `backend/src/shared/clients/yahoo-local-search.client.ts`
- Create: `backend/src/shared/clients/yahoo-local-search.client.spec.ts`

- [ ] **Step 1: テストを書く**

`backend/src/shared/clients/yahoo-local-search.client.spec.ts`:

```typescript
import { YahooLocalSearchClient } from './yahoo-local-search.client';

describe('YahooLocalSearchClient', () => {
  let client: YahooLocalSearchClient;

  beforeEach(() => {
    process.env.YAHOO_APP_ID = 'test-app-id';
    client = new YahooLocalSearchClient();
  });

  afterEach(() => {
    delete process.env.YAHOO_APP_ID;
  });

  describe('buildGridKey', () => {
    it('緯度経度を 0.01° グリッドに snap して一意のキーを生成する', () => {
      // 34.7398, 135.4985 → floor(34.7398*100)=3473, floor(135.4985*100)=13549
      expect(client.buildGridKey(34.7398, 135.4985)).toBe('3473_13549');
    });

    it('グリッド境界値でも正しいキーを生成する', () => {
      expect(client.buildGridKey(35.0, 139.0)).toBe('3500_13900');
    });

    it('南緯・西経（負値）でも正しく処理する', () => {
      expect(client.buildGridKey(-33.87, 151.21)).toBe('-3388_15121');
    });
  });

  describe('fetchStores', () => {
    it('YAHOO_APP_ID が未設定の場合は空配列を返す', async () => {
      delete process.env.YAHOO_APP_ID;
      const c = new YahooLocalSearchClient();
      const result = await c.fetchStores(34.7, 135.5);
      expect(result).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm --filter backend test yahoo-local-search.client
```

Expected: FAIL

- [ ] **Step 3: クライアントを実装する**

`backend/src/shared/clients/yahoo-local-search.client.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import {
  YAHOO_LOCAL_SEARCH_GENRES,
  STORE_CACHE_RADIUS_KM,
  STORE_CACHE_MAX_RESULTS,
  YAHOO_MAX_PAGES_PER_GENRE,
  YAHOO_REQUEST_INTERVAL_MS,
} from '../places/places.constants';

const YAHOO_LOCAL_SEARCH_URL = 'https://map.yahooapis.jp/search/local/V1/localSearch';

export type YahooStoreRecord = {
  uid: string;
  name: string;
  address: string | null;
  genre: string | null;
  lat: number;
  lng: number;
};

type YahooFeature = {
  Name?: string;
  Geometry?: { Coordinates?: string };
  Property?: {
    Uid?: string;
    Address?: string;
    Genre?: Array<{ Name: string }>;
  };
};

type YahooResponse = {
  ResultInfo?: { Total?: number; Count?: number };
  Feature?: YahooFeature[];
};

@Injectable()
export class YahooLocalSearchClient {
  private readonly logger = new Logger(YahooLocalSearchClient.name);

  /**
   * 緯度経度を 0.01°（≒ 1km）グリッドに snap したキーを返す。
   * store_cache_areas のエリアカバー判定に使用する。
   */
  buildGridKey(lat: number, lng: number): string {
    const latSnap = Math.floor(lat * 100);
    const lngSnap = Math.floor(lng * 100);
    return `${latSnap}_${lngSnap}`;
  }

  /**
   * 指定座標の半径 20km 圏内の店舗を全ジャンル取得して返す。
   * 重複（同一 uid）は除去。エラーは警告ログのみで空配列を返す（例外を投げない）。
   */
  async fetchStores(lat: number, lng: number): Promise<YahooStoreRecord[]> {
    const appId = process.env.YAHOO_APP_ID;
    if (!appId) {
      this.logger.warn('YAHOO_APP_ID が未設定です。店舗キャッシュをスキップします。');
      return [];
    }

    const storeMap = new Map<string, YahooStoreRecord>();

    for (const gc of YAHOO_LOCAL_SEARCH_GENRES) {
      try {
        await this.fetchGenre(lat, lng, gc, appId, storeMap);
      } catch (err) {
        this.logger.warn(`Yahoo API フェッチ失敗: gc=${gc}`, err instanceof Error ? err.message : String(err));
      }
      await this.sleep(YAHOO_REQUEST_INTERVAL_MS);
    }

    this.logger.log(`Yahoo API フェッチ完了: ${storeMap.size} 件（lat=${lat}, lng=${lng}）`);
    return [...storeMap.values()];
  }

  private async fetchGenre(
    lat: number,
    lng: number,
    gc: string,
    appId: string,
    storeMap: Map<string, YahooStoreRecord>,
  ): Promise<void> {
    let start = 1;
    let total = Infinity;

    while (start <= total && start <= YAHOO_MAX_PAGES_PER_GENRE * STORE_CACHE_MAX_RESULTS) {
      const params = new URLSearchParams({
        appid: appId,
        lat: String(lat),
        lon: String(lng),
        dist: String(STORE_CACHE_RADIUS_KM),
        gc,
        results: String(STORE_CACHE_MAX_RESULTS),
        start: String(start),
        output: 'json',
        sort: 'geo',
      });

      const res = await fetch(`${YAHOO_LOCAL_SEARCH_URL}?${params}`, {
        headers: { 'User-Agent': 'AllergyApp/1.0' },
      });

      if (!res.ok) {
        this.logger.warn(`Yahoo API HTTP エラー: gc=${gc} status=${res.status}`);
        break;
      }

      const data = (await res.json()) as YahooResponse;
      total = data.ResultInfo?.Total ?? 0;
      const features = data.Feature ?? [];

      for (const f of features) {
        const uid = f.Property?.Uid;
        if (!uid || storeMap.has(uid)) continue;

        const coords = f.Geometry?.Coordinates?.split(',');
        const storeLat = coords ? parseFloat(coords[1]) : null;
        const storeLng = coords ? parseFloat(coords[0]) : null;
        if (!storeLat || !storeLng || !f.Name) continue;

        storeMap.set(uid, {
          uid,
          name: f.Name,
          address: f.Property?.Address ?? null,
          genre: (f.Property?.Genre ?? []).map((g) => g.Name).join('/') || null,
          lat: storeLat,
          lng: storeLng,
        });
      }

      start += STORE_CACHE_MAX_RESULTS;
      if (features.length < STORE_CACHE_MAX_RESULTS) break;
      await this.sleep(YAHOO_REQUEST_INTERVAL_MS);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
pnpm --filter backend test yahoo-local-search.client
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add backend/src/shared/clients/yahoo-local-search.client.ts backend/src/shared/clients/yahoo-local-search.client.spec.ts backend/src/shared/places/places.constants.ts backend/src/shared/places/places.interface.ts
git commit -m "feat: add YahooLocalSearchClient and update store candidate constants"
```

---

## Task 4: StoreCacheRepository

**Files:**
- Create: `backend/src/scan/store-cache.repository.ts`
- Create: `backend/src/scan/store-cache.repository.spec.ts`

- [ ] **Step 1: テストを書く**

`backend/src/scan/store-cache.repository.spec.ts`:

```typescript
import { StoreCacheRepository } from './store-cache.repository';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  storeCache: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  storeCacheArea: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
  },
  cacheJob: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
} as unknown as PrismaService;

describe('StoreCacheRepository', () => {
  let repo: StoreCacheRepository;

  beforeEach(() => {
    repo = new StoreCacheRepository(mockPrisma);
    jest.clearAllMocks();
  });

  describe('isAreaCached', () => {
    it('有効な store_cache_areas レコードがあれば true を返す', async () => {
      (mockPrisma.storeCacheArea.findFirst as jest.Mock).mockResolvedValue({ id: '1' });
      expect(await repo.isAreaCached('3473_13549')).toBe(true);
    });

    it('レコードがなければ false を返す', async () => {
      (mockPrisma.storeCacheArea.findFirst as jest.Mock).mockResolvedValue(null);
      expect(await repo.isAreaCached('3473_13549')).toBe(false);
    });
  });

  describe('deleteOldBatchStores', () => {
    it('指定グリッドの source=batch かつ batchStartedAt より前の行を削除する', async () => {
      (mockPrisma.storeCache.deleteMany as jest.Mock).mockResolvedValue({ count: 42 });
      const batchStartedAt = new Date('2026-07-01T00:00:00Z');
      const count = await repo.deleteOldBatchStores('3473_13549', 20, batchStartedAt);
      expect(count).toBe(42);
      expect(mockPrisma.storeCache.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ source: 'batch', updatedAt: expect.anything() }),
        }),
      );
    });
  });

  describe('enqueueJob', () => {
    it('同座標の pending ジョブが既にあれば二重追加しない', async () => {
      (mockPrisma.cacheJob.findFirst as jest.Mock).mockResolvedValue({ id: 'existing' });
      await repo.enqueueJob(34.7, 135.5);
      expect(mockPrisma.cacheJob.create).not.toHaveBeenCalled();
    });

    it('pending ジョブがなければ新規作成する', async () => {
      (mockPrisma.cacheJob.findFirst as jest.Mock).mockResolvedValue(null);
      await repo.enqueueJob(34.7, 135.5);
      expect(mockPrisma.cacheJob.create).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm --filter backend test store-cache.repository
```

Expected: FAIL

- [ ] **Step 3: リポジトリを実装する**

`backend/src/scan/store-cache.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { YahooStoreRecord } from '../shared/clients/yahoo-local-search.client';
import type { CityTier } from './store-cache.service';
import { STORE_CACHE_EXPIRE_DAYS } from '../shared/places/places.constants';

export type NearbyStore = {
  uid: string;
  name: string;
  address: string | null;
  genre: string | null;
  lat: number;
  lng: number;
};

@Injectable()
export class StoreCacheRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── エリアカバー管理 ────────────────────────────────────────────────────

  /** 有効な store_cache_areas エントリが存在すれば true（重複フェッチ防止） */
  async isAreaCached(gridKey: string): Promise<boolean> {
    const area = await this.prisma.storeCacheArea.findFirst({
      where: { gridKey, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return area !== null;
  }

  /** エリアカバー記録を upsert する（フェッチ完了後に呼ぶ） */
  async markAreaCached(gridKey: string, radiusKm: number, tier: CityTier): Promise<void> {
    const days = STORE_CACHE_EXPIRE_DAYS[tier.toUpperCase() as 'METRO' | 'REGIONAL'];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await this.prisma.storeCacheArea.upsert({
      where: { gridKey },
      create: { gridKey, radiusKm, tier, expiresAt },
      update: { fetchedAt: new Date(), tier, expiresAt },
    });
  }

  // ── 店舗データ操作 ──────────────────────────────────────────────────────

  /**
   * Yahoo から取得した店舗を一括 upsert する。
   * source を明示して「バッチ由来か否か」を区別する。
   */
  async upsertStores(stores: YahooStoreRecord[], source: 'batch' | 'realtime', tier: CityTier): Promise<void> {
    const days = STORE_CACHE_EXPIRE_DAYS[tier.toUpperCase() as 'METRO' | 'REGIONAL'];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    // 100件ずつトランザクション分割（Prisma の $transaction 件数制限対策）
    const CHUNK_SIZE = 100;
    for (let i = 0; i < stores.length; i += CHUNK_SIZE) {
      const chunk = stores.slice(i, i + CHUNK_SIZE);
      await this.prisma.$transaction(
        chunk.map((s) =>
          this.prisma.storeCache.upsert({
            where: { uid: s.uid },
            create: { uid: s.uid, name: s.name, address: s.address, genre: s.genre, lat: s.lat, lng: s.lng, source, expiresAt },
            update: { name: s.name, address: s.address, genre: s.genre, lat: s.lat, lng: s.lng, source, expiresAt },
          }),
        ),
      );
    }
  }

  /**
   * バッチ入れ替え時に旧バッチデータを物理削除する。
   * batchStartedAt より前に updatedAt が更新されたバッチ由来レコードのみ削除。
   * 削除対象は同グリッドエリア（バウンディングボックス）内に限定する。
   */
  async deleteOldBatchStores(gridKey: string, radiusKm: number, batchStartedAt: Date): Promise<number> {
    // gridKey から緯度経度のバウンディングボックスを復元する
    const [latSnap, lngSnap] = gridKey.split('_').map(Number);
    const lat = latSnap / 100;
    const lng = lngSnap / 100;
    const degreeMargin = radiusKm / 111;

    const result = await this.prisma.storeCache.deleteMany({
      where: {
        source: 'batch',
        updatedAt: { lt: batchStartedAt },
        lat: { gte: lat - degreeMargin, lte: lat + degreeMargin },
        lng: { gte: lng - degreeMargin, lte: lng + degreeMargin },
      },
    });
    return result.count;
  }

  /**
   * 指定座標から radiusKm 以内の有効期限内店舗を返す。
   * 距離フィルタは Haversine（サービス層）で行うため、
   * ここでは緯度経度のバウンディングボックスで粗く絞る（1° ≒ 111km）。
   */
  async findNear(lat: number, lng: number, radiusKm: number): Promise<NearbyStore[]> {
    const degreeMargin = radiusKm / 111;
    return this.prisma.storeCache.findMany({
      where: {
        lat: { gte: lat - degreeMargin, lte: lat + degreeMargin },
        lng: { gte: lng - degreeMargin, lte: lng + degreeMargin },
        expiresAt: { gt: new Date() },
      },
      select: { uid: true, name: true, address: true, genre: true, lat: true, lng: true },
    });
  }

  // ── キャッシュジョブ管理 ────────────────────────────────────────────────

  /** cache_jobs に pending ジョブを追加する（同座標の重複は作らない） */
  async enqueueJob(lat: number, lng: number): Promise<void> {
    const existing = await this.prisma.cacheJob.findFirst({
      where: {
        lat: { gte: lat - 0.01, lte: lat + 0.01 },
        lng: { gte: lng - 0.01, lte: lng + 0.01 },
        status: 'pending',
      },
      select: { id: true },
    });
    if (existing) return;

    await this.prisma.cacheJob.create({
      data: { lat, lng, status: 'pending' },
    });
  }

  /** pending の最古ジョブを 1 件取得して processing に更新する */
  async dequeueJob(): Promise<{ id: string; lat: number; lng: number } | null> {
    const job = await this.prisma.cacheJob.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, lat: true, lng: true },
    });
    if (!job) return null;

    await this.prisma.cacheJob.update({
      where: { id: job.id },
      data: { status: 'processing' },
    });
    return job;
  }

  /** ジョブを完了 / 失敗としてマークする */
  async markJobDone(id: string, status: 'done' | 'failed'): Promise<void> {
    await this.prisma.cacheJob.update({
      where: { id },
      data: { status, processedAt: new Date() },
    });
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
pnpm --filter backend test store-cache.repository
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add backend/src/scan/store-cache.repository.ts backend/src/scan/store-cache.repository.spec.ts
git commit -m "feat: add StoreCacheRepository with batch source tracking and physical delete"
```

---

## Task 5: StoreCacheService

**Files:**
- Create: `backend/src/scan/store-cache.service.ts`
- Create: `backend/src/scan/store-cache.service.spec.ts`

- [ ] **Step 1: テストを書く**

`backend/src/scan/store-cache.service.spec.ts`:

```typescript
import { StoreCacheService } from './store-cache.service';
import { StoreCacheRepository } from './store-cache.repository';
import { YahooLocalSearchClient } from '../shared/clients/yahoo-local-search.client';

const mockRepo = {
  isAreaCached: jest.fn(),
  findNear: jest.fn(),
  markAreaCached: jest.fn(),
  upsertStores: jest.fn(),
  deleteOldBatchStores: jest.fn(),
  enqueueJob: jest.fn(),
  dequeueJob: jest.fn(),
  markJobDone: jest.fn(),
} as unknown as StoreCacheRepository;

const mockYahoo = {
  buildGridKey: jest.fn().mockReturnValue('3473_13549'),
  fetchStores: jest.fn(),
} as unknown as YahooLocalSearchClient;

describe('StoreCacheService', () => {
  let service: StoreCacheService;
  const LAT = 34.7398;
  const LNG = 135.4985;

  beforeEach(() => {
    service = new StoreCacheService(mockRepo, mockYahoo);
    jest.clearAllMocks();
  });

  describe('haversineKm', () => {
    it('同一座標なら 0 km を返す', () => {
      expect(service['haversineKm'](LAT, LNG, LAT, LNG)).toBe(0);
    });

    it('大阪〜東京（約 400km）を概算する', () => {
      const dist = service['haversineKm'](34.7, 135.5, 35.7, 139.7);
      expect(dist).toBeGreaterThan(380);
      expect(dist).toBeLessThan(420);
    });
  });

  describe('getCandidates', () => {
    it('キャッシュ HIT 時は enqueue せず候補を返す', async () => {
      (mockRepo.isAreaCached as jest.Mock).mockResolvedValue(true);
      (mockRepo.findNear as jest.Mock).mockResolvedValue([
        { uid: 'a', name: 'セブン', address: '大阪市...', genre: 'コンビニ', lat: 34.740, lng: 135.499 },
        { uid: 'b', name: 'ローソン', address: '大阪市...', genre: 'コンビニ', lat: 34.741, lng: 135.500 },
        { uid: 'c', name: 'ファミマ', address: '大阪市...', genre: 'コンビニ', lat: 34.742, lng: 135.501 },
      ]);

      const result = await service.getCandidates(LAT, LNG);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]).toHaveProperty('distanceKm');
      expect(mockRepo.enqueueJob).not.toHaveBeenCalled();
    });

    it('キャッシュ MISS 時は enqueue して空配列を返す', async () => {
      (mockRepo.isAreaCached as jest.Mock).mockResolvedValue(false);
      (mockRepo.findNear as jest.Mock).mockResolvedValue([]);

      const result = await service.getCandidates(LAT, LNG);
      expect(result).toEqual([]);
      expect(mockRepo.enqueueJob).toHaveBeenCalledWith(LAT, LNG);
    });
  });

  describe('adaptiveFilter', () => {
    it('5km 以内に 3 件以上あれば 5km で打ち切る', () => {
      const stores = [
        { uid: 'a', name: 'A', address: null, genre: null, lat: LAT, lng: LNG, distanceKm: 1.1 },
        { uid: 'b', name: 'B', address: null, genre: null, lat: LAT, lng: LNG, distanceKm: 2.2 },
        { uid: 'c', name: 'C', address: null, genre: null, lat: LAT, lng: LNG, distanceKm: 3.3 },
        { uid: 'd', name: 'D', address: null, genre: null, lat: LAT, lng: LNG, distanceKm: 11.0 },
      ];
      const result = service['adaptiveFilter'](stores);
      expect(result.every((s) => s.distanceKm <= 5)).toBe(true);
      expect(result.length).toBe(3);
    });

    it('5km 以内が 2 件なら 10km へ拡大する', () => {
      const stores = [
        { uid: 'a', name: 'A', address: null, genre: null, lat: LAT, lng: LNG, distanceKm: 1.0 },
        { uid: 'b', name: 'B', address: null, genre: null, lat: LAT, lng: LNG, distanceKm: 4.0 },
        { uid: 'c', name: 'C', address: null, genre: null, lat: LAT, lng: LNG, distanceKm: 7.0 },
      ];
      const result = service['adaptiveFilter'](stores);
      expect(result.some((s) => s.distanceKm > 5)).toBe(true);
    });
  });

  describe('fetchAndCache', () => {
    it('バッチ時は INSERT → DELETE の順で物理入れ替えを行う', async () => {
      (mockYahoo.fetchStores as jest.Mock).mockResolvedValue([
        { uid: 'x', name: 'NewStore', address: '大阪...', genre: 'コンビニ', lat: 34.74, lng: 135.50 },
      ]);
      (mockRepo.deleteOldBatchStores as jest.Mock).mockResolvedValue(5);

      await service.fetchAndCache(LAT, LNG, 'batch', 'metro');

      // 1. INSERT が先
      expect(mockRepo.upsertStores).toHaveBeenCalledWith(expect.any(Array), 'batch', 'metro');
      // 2. DELETE が後（INSERT 完了後）
      expect(mockRepo.deleteOldBatchStores).toHaveBeenCalled();
      // 3. エリアカバー記録
      expect(mockRepo.markAreaCached).toHaveBeenCalledWith('3473_13549', 20, 'metro');
    });

    it('realtime 時は DELETE を行わない', async () => {
      (mockYahoo.fetchStores as jest.Mock).mockResolvedValue([]);

      await service.fetchAndCache(LAT, LNG, 'realtime', 'regional');

      expect(mockRepo.deleteOldBatchStores).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
pnpm --filter backend test store-cache.service
```

Expected: FAIL

- [ ] **Step 3: サービスを実装する**

`backend/src/scan/store-cache.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { StoreCacheRepository, type NearbyStore } from './store-cache.repository';
import { YahooLocalSearchClient } from '../shared/clients/yahoo-local-search.client';
import type { StoreCandidate } from '../shared/places/places.interface';
import {
  ADAPTIVE_DISPLAY_STEPS_KM,
  ADAPTIVE_MIN_CANDIDATES,
  STORE_CACHE_RADIUS_KM,
} from '../shared/places/places.constants';

export type CityTier = 'metro' | 'regional';

type NearbyStoreWithDist = NearbyStore & { distanceKm: number };

@Injectable()
export class StoreCacheService {
  private readonly logger = new Logger(StoreCacheService.name);

  constructor(
    private readonly repo: StoreCacheRepository,
    private readonly yahoo: YahooLocalSearchClient,
  ) {}

  /**
   * 指定座標の店舗候補を返す。
   * キャッシュ HIT: DB → Haversine → アダプティブフィルタ
   * キャッシュ MISS: 即空配列 + cache_jobs にキュー投入
   */
  async getCandidates(lat: number, lng: number, query?: string): Promise<StoreCandidate[]> {
    const gridKey = this.yahoo.buildGridKey(lat, lng);
    const isCached = await this.repo.isAreaCached(gridKey);

    if (!isCached) {
      this.logger.log(`キャッシュ MISS: gridKey=${gridKey} → cache_jobs に追加`);
      await this.repo.enqueueJob(lat, lng);
      return [];
    }

    const rawStores = await this.repo.findNear(lat, lng, STORE_CACHE_RADIUS_KM);
    const withDist: NearbyStoreWithDist[] = rawStores
      .map((s) => ({
        ...s,
        distanceKm: Math.round(this.haversineKm(lat, lng, s.lat, s.lng) * 10) / 10,
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const filtered = query
      ? withDist.filter((s) => s.name.includes(query))
      : this.adaptiveFilter(withDist);

    return filtered.map((s) => ({
      name: s.name,
      placeId: s.uid,
      address: s.address ?? undefined,
      distanceKm: s.distanceKm,
    }));
  }

  /**
   * Yahoo API からフェッチして DB に保存する。
   * source='batch' の場合は INSERT 完了後に旧バッチデータを物理削除する（ダウンタイムなし）。
   * source='realtime' の場合は INSERT のみ（DELETE しない）。
   */
  async fetchAndCache(
    lat: number,
    lng: number,
    source: 'batch' | 'realtime',
    tier: CityTier,
  ): Promise<void> {
    const gridKey = this.yahoo.buildGridKey(lat, lng);
    const batchStartedAt = new Date();

    this.logger.log(`Yahoo フェッチ開始: gridKey=${gridKey} source=${source} tier=${tier}`);
    const stores = await this.yahoo.fetchStores(lat, lng);

    if (stores.length > 0) {
      // Step 1: 新データを INSERT（バッチ中もユーザーは旧データを参照できる）
      await this.repo.upsertStores(stores, source, tier);
      this.logger.log(`Yahoo フェッチ: ${stores.length} 件 → DB 保存`);
    }

    if (source === 'batch') {
      // Step 2: INSERT 完了後に旧バッチデータを物理削除（新データが既に存在するため安全）
      const deleted = await this.repo.deleteOldBatchStores(gridKey, STORE_CACHE_RADIUS_KM, batchStartedAt);
      this.logger.log(`旧バッチデータ物理削除: ${deleted} 件`);
    }

    await this.repo.markAreaCached(gridKey, STORE_CACHE_RADIUS_KM, tier);
  }

  /**
   * pending ジョブを 1 件処理する。
   * realtime フェッチは常に regional tier として扱う（ユーザー座標の tier 判定は不要）。
   */
  async processNextJob(): Promise<{ processed: boolean }> {
    const job = await this.repo.dequeueJob();
    if (!job) return { processed: false };

    try {
      await this.fetchAndCache(job.lat, job.lng, 'realtime', 'regional');
      await this.repo.markJobDone(job.id, 'done');
    } catch (err) {
      this.logger.error(`cache_job 処理失敗: id=${job.id}`, err instanceof Error ? err.message : String(err));
      await this.repo.markJobDone(job.id, 'failed');
    }
    return { processed: true };
  }

  /** Haversine 公式で 2 点間の距離（km）を計算する */
  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6_371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
  }

  /**
   * 最小距離ステップから始めて ADAPTIVE_MIN_CANDIDATES 件以上になるまで拡大する。
   * 例: 5km → 2件 → 10km / 5km → 5件 → 5km で打ち切り
   */
  private adaptiveFilter(stores: NearbyStoreWithDist[]): NearbyStoreWithDist[] {
    const steps = ADAPTIVE_DISPLAY_STEPS_KM;
    for (let i = 0; i < steps.length; i++) {
      const inRange = stores.filter((s) => s.distanceKm <= steps[i]);
      if (inRange.length >= ADAPTIVE_MIN_CANDIDATES || i === steps.length - 1) {
        return inRange;
      }
    }
    return stores;
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
pnpm --filter backend test store-cache.service
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add backend/src/scan/store-cache.service.ts backend/src/scan/store-cache.service.spec.ts
git commit -m "feat: add StoreCacheService with Haversine, adaptive display, and batch physical delete"
```

---

## Task 6: PlacesService 更新

**Files:**
- Modify: `backend/src/scan/places.service.ts`
- Modify: `backend/src/scan/places.service.spec.ts`

- [ ] **Step 1: places.service.spec.ts を更新する**

```typescript
import { PlacesService } from './places.service';
import { StoreCacheService } from './store-cache.service';
import { GsiGeocoderClient } from '../shared/clients/gsi-geocoder.client';

const mockStoreCacheService = {
  getCandidates: jest.fn(),
} as unknown as StoreCacheService;

const mockGsiGeocoder = {
  reverseGeocode: jest.fn(),
} as unknown as GsiGeocoderClient;

describe('PlacesService', () => {
  let service: PlacesService;

  beforeEach(() => {
    service = new PlacesService(mockStoreCacheService, mockGsiGeocoder);
    jest.clearAllMocks();
  });

  it('住所と候補を並行取得して返す', async () => {
    (mockGsiGeocoder.reverseGeocode as jest.Mock).mockResolvedValue('大阪府大阪市北区...');
    (mockStoreCacheService.getCandidates as jest.Mock).mockResolvedValue([
      { name: 'セブン', placeId: 'uid1', address: '大阪市...', distanceKm: 0.3 },
    ]);

    const result = await service.getCandidates(34.74, 135.50);
    expect(result.address).toBe('大阪府大阪市北区...');
    expect(result.candidates[0].distanceKm).toBe(0.3);
  });

  it('キャッシュ MISS（候補 0 件）でも正常に返す', async () => {
    (mockGsiGeocoder.reverseGeocode as jest.Mock).mockResolvedValue(null);
    (mockStoreCacheService.getCandidates as jest.Mock).mockResolvedValue([]);

    const result = await service.getCandidates(43.06, 141.35);
    expect(result.address).toBeNull();
    expect(result.candidates).toEqual([]);
  });
});
```

- [ ] **Step 2: places.service.ts を更新する**

```typescript
import { Injectable } from '@nestjs/common';
import type { StoreCandidate } from '../shared/places/places.interface';
import { GsiGeocoderClient } from '../shared/clients/gsi-geocoder.client';
import { StoreCacheService } from './store-cache.service';

/** GET /places/candidates のレスポンス型。 */
export type PlaceCandidatesResult = {
  address: string | null;
  candidates: StoreCandidate[];
};

/**
 * 場所登録用の住所・施設候補を取得する Service。
 * 住所: 国土地理院 逆ジオコーダ（現在地の住所）
 * 候補: StoreCacheService（Yahoo DB キャッシュ）
 * 「場所を登録」操作時にのみ呼ばれる（00320 フェーズ A）。
 */
@Injectable()
export class PlacesService {
  constructor(
    private readonly storeCacheService: StoreCacheService,
    private readonly gsiGeocoder: GsiGeocoderClient,
  ) {}

  async getCandidates(lat: number, lng: number, query?: string): Promise<PlaceCandidatesResult> {
    const [address, candidates] = await Promise.all([
      this.gsiGeocoder.reverseGeocode(lat, lng),
      this.storeCacheService.getCandidates(lat, lng, query),
    ]);
    return { address, candidates };
  }
}
```

- [ ] **Step 3: テストが通ることを確認する**

```bash
pnpm --filter backend test places.service
```

Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add backend/src/scan/places.service.ts backend/src/scan/places.service.spec.ts
git commit -m "feat: replace Overpass with StoreCacheService in PlacesService"
```

---

## Task 7: ScanService + OcrScanDto 更新

**Files:**
- Modify: `backend/src/scan/dto/ocr-scan.dto.ts`
- Modify: `backend/src/scan/scan.service.ts`

- [ ] **Step 1: OcrScanDto に lat / lng を追加する**

`backend/src/scan/dto/ocr-scan.dto.ts` を確認し、既存フィールドの後に追加:

```typescript
import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

// 既存フィールドの後に追加:
@IsOptional()
@IsNumber()
@Min(-90) @Max(90)
@Type(() => Number)
lat?: number;

@IsOptional()
@IsNumber()
@Min(-180) @Max(180)
@Type(() => Number)
lng?: number;
```

- [ ] **Step 2: ScanService に StoreCacheRepository を注入し OCR 完了後にエンキューする**

`backend/src/scan/scan.service.ts` の import に追加:

```typescript
import { StoreCacheRepository } from './store-cache.repository';
```

コンストラクタ引数に追加:

```typescript
private readonly storeCacheRepository: StoreCacheRepository,
```

`processOcr` メソッドの return 直前に追加（GPS 座標がある場合のみ）:

```typescript
// バックグラウンドで店舗キャッシュをウォームアップする（非同期・失敗しても無視）
if (dto.lat !== undefined && dto.lng !== undefined) {
  void this.storeCacheRepository.enqueueJob(dto.lat, dto.lng).catch((err) => {
    this.logger.warn('cache_job 投入失敗', err instanceof Error ? err.message : String(err));
  });
}
```

- [ ] **Step 3: 型チェック通過確認**

```bash
pnpm --filter backend typecheck
```

- [ ] **Step 4: コミット**

```bash
git add backend/src/scan/dto/ocr-scan.dto.ts backend/src/scan/scan.service.ts
git commit -m "feat: enqueue cache_job after OCR when GPS coords available"
```

---

## Task 8: CacheJobController + ScanModule 配線

**Files:**
- Create: `backend/src/scan/cache-job.controller.ts`
- Modify: `backend/src/scan/scan.module.ts`

- [ ] **Step 1: CacheJobController を作成する**

`backend/src/scan/cache-job.controller.ts`:

```typescript
import { Controller, Post, Headers, UnauthorizedException, Logger } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { StoreCacheService } from './store-cache.service';

/**
 * バックグラウンド cache_jobs プロセッサー。
 * EventBridge Scheduler が 30 分ごとに呼び出す（ローカルは curl で手動実行）。
 * X-Internal-Secret ヘッダーで認証（環境変数 INTERNAL_SECRET と照合）。
 *
 * ローカル: curl -X POST -H "X-Internal-Secret: xxx" http://localhost:3001/internal/cache-jobs/process
 * AWS:      EventBridge Scheduler → API Gateway → Lambda
 */
@Controller('internal/cache-jobs')
export class CacheJobController {
  private readonly logger = new Logger(CacheJobController.name);

  constructor(private readonly storeCacheService: StoreCacheService) {}

  @Post('process')
  @Public()
  async processNext(
    @Headers('x-internal-secret') secret: string | undefined,
  ): Promise<{ processed: boolean }> {
    const expected = process.env.INTERNAL_SECRET;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid internal secret');
    }

    const result = await this.storeCacheService.processNextJob();
    this.logger.log(`cache_job 処理: processed=${result.processed}`);
    return result;
  }
}
```

- [ ] **Step 2: scan.module.ts を更新する**

```typescript
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';
import { CacheJobController } from './cache-job.controller';
import { DailyScanLimitGuard } from './daily-scan-limit.guard';
import { ProductsModule } from '../products/products.module';
import { AllergensModule } from '../allergens/allergens.module';
import { HistoryModule } from '../history/history.module';
import { UsersModule } from '../users/users.module';
import { S3Client } from '../shared/clients/s3.client';
import { GeminiClient } from '../shared/clients/gemini.client';
import { GsiGeocoderClient } from '../shared/clients/gsi-geocoder.client';
import { YahooLocalSearchClient } from '../shared/clients/yahoo-local-search.client';
import { PrismaModule } from '../prisma/prisma.module';
import { StoreCacheRepository } from './store-cache.repository';
import { StoreCacheService } from './store-cache.service';
import { CACHE_TTL_MEMORY_SEC } from './scan.constants';

// Google Places API は課金リスク（青天井）のため使用禁止。
// Overpass API は住所取得率 8.6% のため廃止。
// Yahoo! Local Search（無料・50,000件/日）+ DB キャッシュを使用する。

@Module({
  imports: [
    ProductsModule,
    AllergensModule,
    HistoryModule,
    UsersModule,
    PrismaModule,
    CacheModule.register({ ttl: CACHE_TTL_MEMORY_SEC * 1000 }),
  ],
  controllers: [ScanController, PlacesController, CacheJobController],
  providers: [
    ScanService,
    PlacesService,
    DailyScanLimitGuard,
    S3Client,
    GeminiClient,
    GsiGeocoderClient,
    YahooLocalSearchClient,
    StoreCacheRepository,
    StoreCacheService,
  ],
})
export class ScanModule {}
```

- [ ] **Step 3: PrismaModule が exports に PrismaService を含んでいることを確認する**

`backend/src/prisma/prisma.module.ts` を確認し `exports: [PrismaService]` があること。なければ追加する。

- [ ] **Step 4: 型チェック + テストを実行する**

```bash
pnpm --filter backend typecheck
pnpm --filter backend test
```

Expected: エラーなし / 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add backend/src/scan/cache-job.controller.ts backend/src/scan/scan.module.ts
git commit -m "feat: wire StoreCacheService into ScanModule, add CacheJobController"
```

---

## Task 9: フロントエンド型更新・距離スライダー追加

**Files:**
- Modify: `frontend/src/app/scan/scan.types.ts`
- Modify: `frontend/src/hooks/useScanApi.ts`
- Modify: `frontend/src/components/organisms/ResultCard.tsx`
- Modify: `frontend/public/locales/ja/scan.json`
- Modify: `frontend/public/locales/en/scan.json`

- [ ] **Step 1: StoreCandidate に distanceKm を追加する**

`frontend/src/app/scan/scan.types.ts` の `StoreCandidate` 型:

```typescript
/** 店舗候補の型（GET /places/candidates から返される） */
export type StoreCandidate = {
  name: string
  placeId: string
  address?: string
  /** 現在地からの距離（km）。DB キャッシュ経由の場合のみセット。 */
  distanceKm?: number
}
```

- [ ] **Step 2: useScanApi.ts の OCR リクエストに GPS 座標を追加する**

`frontend/src/hooks/useScanApi.ts` の OCR 送信部分を確認し、`geolocation` が利用可能なら body に追加:

```typescript
// POST /scan/ocr の body 構築（バックグラウンドキャッシュ用に GPS 座標を含める）
const body: Record<string, unknown> = { s3_key: s3Key }
if (geolocation) {
  body.lat = geolocation.lat
  body.lng = geolocation.lng
}
```

- [ ] **Step 3: i18n キーを追加する**

`frontend/public/locales/ja/scan.json` の `result.registerLocation` に追加:

```json
"distanceSlider": {
  "label": "表示距離",
  "unit": "{km}km 以内",
  "allLabel": "全て（{km}km）"
},
"cacheLoading": "近くの店舗を取得中です。しばらくすると候補が表示されます。",
"noCandidates": "候補店舗が見つかりませんでした。店舗名を直接入力してください。"
```

`frontend/public/locales/en/scan.json` の `result.registerLocation` に追加:

```json
"distanceSlider": {
  "label": "Distance",
  "unit": "Within {km}km",
  "allLabel": "All ({km}km)"
},
"cacheLoading": "Finding nearby stores. Candidates will appear shortly.",
"noCandidates": "No store candidates found. Please enter the store name manually."
```

- [ ] **Step 4: ResultCard に距離スライダーを追加する**

`frontend/src/components/organisms/ResultCard.tsx`:

**state 追加（コンポーネント先頭の useState 群に追加）:**

```tsx
const [distanceFilterKm, setDistanceFilterKm] = useState<number>(5)
```

**`locationUiState === 'select' && placeCandidates` ブロック（約 562 行目）を以下に置き換え:**

```tsx
{locationUiState === 'select' && placeCandidates && (
  <div className="space-y-2">
    <p className="text-sm lg:text-base font-medium text-gray-700">
      {t('registerLocation.selectTitle')}
    </p>

    {/* 距離スライダー（distanceKm を持つ候補がある場合のみ表示） */}
    {placeCandidates.candidates.some((c) => c.distanceKm !== undefined) && (
      <div className="mb-1">
        <label className="text-xs text-gray-500">
          {t('registerLocation.distanceSlider.label')}:{' '}
          <span className="font-medium text-gray-700">
            {t('registerLocation.distanceSlider.unit', { km: distanceFilterKm })}
          </span>
        </label>
        <input
          type="range"
          min={1}
          max={20}
          step={1}
          value={distanceFilterKm}
          onChange={(e) => setDistanceFilterKm(Number(e.target.value))}
          className="w-full mt-1 accent-blue-500"
          aria-label={t('registerLocation.distanceSlider.label')}
        />
      </div>
    )}

    {/* 距離フィルタリング（distanceKm がない候補はすべて表示） */}
    {(() => {
      const filtered = placeCandidates.candidates.filter(
        (c) => c.distanceKm === undefined || c.distanceKm <= distanceFilterKm
      )
      if (filtered.length === 0) {
        return (
          <p className="text-sm text-gray-500">{t('registerLocation.noCandidates')}</p>
        )
      }
      return filtered.map((candidate) => (
        <button
          key={candidate.placeId}
          type="button"
          onClick={() => handleSelectLocation(candidate.name, candidate.placeId)}
          className="w-full py-2.5 px-3 rounded-lg border border-blue-200 bg-blue-50 text-sm lg:text-base text-blue-800 text-left"
        >
          <span className="block">{candidate.name}</span>
          {candidate.address && (
            <span className="block text-xs text-blue-600 mt-0.5">{candidate.address}</span>
          )}
          {candidate.distanceKm !== undefined && (
            <span className="block text-xs text-blue-400 mt-0.5">{candidate.distanceKm}km</span>
          )}
        </button>
      ))
    })()}

    {/* キャッシュ MISS で候補 0 件のとき */}
    {placeCandidates.candidates.length === 0 && !placeCandidates.address && (
      <p className="text-xs text-blue-500 italic">{t('registerLocation.cacheLoading')}</p>
    )}

    {placeCandidates.address !== null && (
      <button
        type="button"
        onClick={() => handleSelectAddressOnly(placeCandidates.address!)}
        className="w-full py-2.5 px-3 rounded-lg border border-gray-200 text-sm lg:text-base text-gray-700 text-left"
      >
        {t('registerLocation.addressOnly', { address: placeCandidates.address })}
      </button>
    )}
    <button
      type="button"
      onClick={() => { setLocationUiState('idle'); setSearchQuery(''); setDistanceFilterKm(5) }}
      className="w-full py-2.5 rounded-lg border border-gray-200 text-sm lg:text-base text-gray-500"
    >
      {t('registerLocation.cancel')}
    </button>
  </div>
)}
```

- [ ] **Step 5: 型チェック通過確認**

```bash
pnpm --filter frontend typecheck
```

Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add frontend/src/app/scan/scan.types.ts frontend/src/hooks/useScanApi.ts frontend/src/components/organisms/ResultCard.tsx frontend/public/locales/ja/scan.json frontend/public/locales/en/scan.json
git commit -m "feat: add distance slider to store candidate UI, pass GPS coords to OCR request"
```

---

## Task 10: 月次バッチウォームアップスクリプト（tier 対応・Lambda 15分対策）

**Files:**
- Create: `backend/scripts/warmup-store-cache.ts`

Lambda のタイムアウト制限（15分）対応のため `--start-index N` 引数で再開ポイントを指定できる。

- [ ] **Step 1: スクリプトを作成する**

`backend/scripts/warmup-store-cache.ts`:

```typescript
/**
 * 月次バッチ: 主要都市の店舗情報を Yahoo! Local Search API から取得し DB へ保存する。
 *
 * 実行:
 *   pnpm --filter backend exec ts-node --project tsconfig.json scripts/warmup-store-cache.ts
 *   pnpm --filter backend exec ts-node --project tsconfig.json scripts/warmup-store-cache.ts --start-index 20
 *
 * Lambda 15分制限対策:
 *   EventBridge で --start-index を変えながら複数回呼び出す。
 *   または cache_jobs に全都市を投入して /internal/cache-jobs/process で順次処理する。
 */
import { PrismaClient } from '@prisma/client';
import { YahooLocalSearchClient } from '../src/shared/clients/yahoo-local-search.client';
import { STORE_CACHE_EXPIRE_DAYS, STORE_CACHE_RADIUS_KM } from '../src/shared/places/places.constants';
import type { CityTier } from '../src/scan/store-cache.service';

const prisma = new PrismaClient();

type City = {
  name: string;
  lat: number;
  lng: number;
  tier: CityTier;
};

/**
 * 都市リスト。
 * tier='metro': 人口 100 万人超の大都市 → expires_at = 30 日（店舗入れ替わりが速い）
 * tier='regional': その他県庁所在地・主要都市 → expires_at = 90 日
 */
const CITIES: City[] = [
  // ── metro（100万人超・30日）────────────────────────────────────────
  { name: '東京（23区）', lat: 35.6895, lng: 139.6917, tier: 'metro' },
  { name: '横浜',         lat: 35.4437, lng: 139.6380, tier: 'metro' },
  { name: '大阪',         lat: 34.6937, lng: 135.5023, tier: 'metro' },
  { name: '名古屋',       lat: 35.1815, lng: 136.9066, tier: 'metro' },
  { name: '札幌',         lat: 43.0642, lng: 141.3469, tier: 'metro' },
  { name: '福岡',         lat: 33.5904, lng: 130.4017, tier: 'metro' },
  { name: '川崎',         lat: 35.5167, lng: 139.7004, tier: 'metro' },
  { name: '神戸',         lat: 34.6913, lng: 135.1830, tier: 'metro' },
  { name: '京都',         lat: 35.0116, lng: 135.7681, tier: 'metro' },
  { name: 'さいたま',     lat: 35.8617, lng: 139.6455, tier: 'metro' },
  { name: '広島',         lat: 34.3853, lng: 132.4553, tier: 'metro' },
  { name: '仙台',         lat: 38.2682, lng: 140.8694, tier: 'metro' },
  // 政令市（100万人未満だが大規模）
  { name: '千葉',         lat: 35.6074, lng: 140.1065, tier: 'metro' },
  { name: '堺',           lat: 34.5733, lng: 135.4830, tier: 'metro' },
  { name: '北九州',       lat: 33.8834, lng: 130.8751, tier: 'metro' },
  { name: '新潟',         lat: 37.9026, lng: 139.0232, tier: 'metro' },
  { name: '浜松',         lat: 34.7108, lng: 137.7260, tier: 'metro' },
  { name: '静岡',         lat: 34.9769, lng: 138.3831, tier: 'metro' },
  { name: '相模原',       lat: 35.5744, lng: 139.3730, tier: 'metro' },
  { name: '熊本',         lat: 32.8031, lng: 130.7079, tier: 'metro' },

  // ── regional（その他県庁所在地・主要都市・90日）──────────────────
  { name: '旭川',   lat: 43.7711, lng: 142.3650, tier: 'regional' },
  { name: '函館',   lat: 41.7688, lng: 140.7288, tier: 'regional' },
  { name: '盛岡',   lat: 39.7036, lng: 141.1527, tier: 'regional' },
  { name: '秋田',   lat: 39.7186, lng: 140.1023, tier: 'regional' },
  { name: '山形',   lat: 38.2404, lng: 140.3633, tier: 'regional' },
  { name: '福島',   lat: 37.7608, lng: 140.4748, tier: 'regional' },
  { name: '郡山',   lat: 37.4003, lng: 140.3633, tier: 'regional' },
  { name: 'いわき', lat: 37.0502, lng: 140.8877, tier: 'regional' },
  { name: '水戸',   lat: 36.3418, lng: 140.4468, tier: 'regional' },
  { name: '宇都宮', lat: 36.5658, lng: 139.8836, tier: 'regional' },
  { name: '前橋',   lat: 36.3895, lng: 139.0634, tier: 'regional' },
  { name: '高崎',   lat: 36.3219, lng: 139.0030, tier: 'regional' },
  { name: '川越',   lat: 35.9250, lng: 139.4860, tier: 'regional' },
  { name: '船橋',   lat: 35.6946, lng: 139.9829, tier: 'regional' },
  { name: '八王子', lat: 35.6665, lng: 139.3166, tier: 'regional' },
  { name: '町田',   lat: 35.5404, lng: 139.4468, tier: 'regional' },
  { name: '藤沢',   lat: 35.3381, lng: 139.4917, tier: 'regional' },
  { name: '甲府',   lat: 35.6642, lng: 138.5681, tier: 'regional' },
  { name: '長野',   lat: 36.6513, lng: 138.1810, tier: 'regional' },
  { name: '富山',   lat: 36.6953, lng: 137.2113, tier: 'regional' },
  { name: '金沢',   lat: 36.5944, lng: 136.6256, tier: 'regional' },
  { name: '福井',   lat: 36.0652, lng: 136.2216, tier: 'regional' },
  { name: '大津',   lat: 35.0045, lng: 135.8686, tier: 'regional' },
  { name: '奈良',   lat: 34.6851, lng: 135.8048, tier: 'regional' },
  { name: '和歌山', lat: 34.2261, lng: 135.1675, tier: 'regional' },
  { name: '豊田',   lat: 35.0854, lng: 137.1566, tier: 'regional' },
  { name: '岡崎',   lat: 34.9552, lng: 137.1749, tier: 'regional' },
  { name: '一宮',   lat: 35.3039, lng: 136.8001, tier: 'regional' },
  { name: '豊橋',   lat: 34.7693, lng: 137.3916, tier: 'regional' },
  { name: '四日市', lat: 34.9646, lng: 136.6247, tier: 'regional' },
  { name: '姫路',   lat: 34.8394, lng: 134.6939, tier: 'regional' },
  { name: '西宮',   lat: 34.7381, lng: 135.3419, tier: 'regional' },
  { name: '尼崎',   lat: 34.7326, lng: 135.4062, tier: 'regional' },
  { name: '倉敷',   lat: 34.5850, lng: 133.7714, tier: 'regional' },
  { name: '福山',   lat: 34.4858, lng: 133.3625, tier: 'regional' },
  { name: '下関',   lat: 33.9538, lng: 130.9296, tier: 'regional' },
  { name: '鳥取',   lat: 35.5011, lng: 134.2351, tier: 'regional' },
  { name: '松江',   lat: 35.4722, lng: 133.0505, tier: 'regional' },
  { name: '岡山',   lat: 34.6551, lng: 133.9195, tier: 'regional' },
  { name: '山口',   lat: 34.1860, lng: 131.4706, tier: 'regional' },
  { name: '徳島',   lat: 34.0658, lng: 134.5593, tier: 'regional' },
  { name: '高松',   lat: 34.3401, lng: 134.0434, tier: 'regional' },
  { name: '松山',   lat: 33.8392, lng: 132.7657, tier: 'regional' },
  { name: '高知',   lat: 33.5597, lng: 133.5311, tier: 'regional' },
  { name: '久留米', lat: 33.3194, lng: 130.5082, tier: 'regional' },
  { name: '佐賀',   lat: 33.2635, lng: 130.3010, tier: 'regional' },
  { name: '長崎',   lat: 32.7448, lng: 129.8737, tier: 'regional' },
  { name: '大分',   lat: 33.2382, lng: 131.6126, tier: 'regional' },
  { name: '宮崎',   lat: 31.9111, lng: 131.4239, tier: 'regional' },
  { name: '鹿児島', lat: 31.5966, lng: 130.5571, tier: 'regional' },
  { name: '那覇',   lat: 26.2124, lng: 127.6809, tier: 'regional' },
  { name: '沖縄市', lat: 26.3344, lng: 127.8056, tier: 'regional' },
];

async function warmup(startIndex: number): Promise<void> {
  const yahoo = new YahooLocalSearchClient();
  let totalStores = 0;
  const batchStartedAt = new Date();
  const targets = CITIES.slice(startIndex);

  console.log(`バッチ開始: ${startIndex} 番目から / 全 ${CITIES.length} 都市`);

  for (let i = 0; i < targets.length; i++) {
    const city = targets[i];
    const globalIndex = startIndex + i;
    const gridKey = yahoo.buildGridKey(city.lat, city.lng);
    const expireDays = STORE_CACHE_EXPIRE_DAYS[city.tier.toUpperCase() as 'METRO' | 'REGIONAL'];

    // 期限内のキャッシュが残っていてもバッチは必ず再フェッチする（入れ替えが目的）
    console.log(`[${globalIndex + 1}/${CITIES.length}] ${city.name} (${city.tier}, ${expireDays}日) を取得中...`);

    const stores = await yahoo.fetchStores(city.lat, city.lng);

    if (stores.length > 0) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expireDays);

      // Step 1: 新データを INSERT（ダウンタイムなし）
      const CHUNK_SIZE = 100;
      for (let j = 0; j < stores.length; j += CHUNK_SIZE) {
        const chunk = stores.slice(j, j + CHUNK_SIZE);
        await prisma.$transaction(
          chunk.map((s) =>
            prisma.storeCache.upsert({
              where: { uid: s.uid },
              create: { uid: s.uid, name: s.name, address: s.address, genre: s.genre, lat: s.lat, lng: s.lng, source: 'batch', expiresAt },
              update: { name: s.name, address: s.address, genre: s.genre, lat: s.lat, lng: s.lng, source: 'batch', expiresAt },
            }),
          ),
        );
      }

      // Step 2: 旧バッチデータを物理削除（INSERT 完了後）
      const degreeMargin = STORE_CACHE_RADIUS_KM / 111;
      const [latSnap, lngSnap] = gridKey.split('_').map(Number);
      const lat = latSnap / 100;
      const lng = lngSnap / 100;
      const deleted = await prisma.storeCache.deleteMany({
        where: {
          source: 'batch',
          updatedAt: { lt: batchStartedAt },
          lat: { gte: lat - degreeMargin, lte: lat + degreeMargin },
          lng: { gte: lng - degreeMargin, lte: lng + degreeMargin },
        },
      });

      totalStores += stores.length;
      console.log(`  → ${stores.length} 件取得 / 旧データ ${deleted.count} 件削除 / 累計 ${totalStores} 件`);
    } else {
      console.log(`  → 0 件（スキップ）`);
    }

    // エリアカバー記録を更新
    const areaExpiresAt = new Date();
    areaExpiresAt.setDate(areaExpiresAt.getDate() + expireDays);
    await prisma.storeCacheArea.upsert({
      where: { gridKey },
      create: { gridKey, radiusKm: STORE_CACHE_RADIUS_KM, tier: city.tier, expiresAt: areaExpiresAt },
      update: { fetchedAt: new Date(), tier: city.tier, expiresAt: areaExpiresAt },
    });

    // Yahoo API レート制限対策
    await new Promise((r) => setTimeout(r, 1_000));
  }

  console.log(`\nバッチ完了: ${targets.length} 都市 / ${totalStores} 件`);
  await prisma.$disconnect();
}

// --start-index N 引数を解析する
const args = process.argv.slice(2);
const startIndexArg = args.indexOf('--start-index');
const startIndex = startIndexArg >= 0 ? Number(args[startIndexArg + 1]) : 0;

void warmup(startIndex);
```

- [ ] **Step 2: 型チェックを通過させる**

```bash
pnpm --filter backend typecheck
```

- [ ] **Step 3: コミット**

```bash
git add backend/scripts/warmup-store-cache.ts
git commit -m "feat: add monthly warmup script with metro/regional tier and physical delete"
```

---

## Task 11: 統合テスト・Chrome 実機チェック

- [ ] **Step 1: 全テストを実行**

```bash
pnpm -r test
```

Expected: 全テスト PASS

- [ ] **Step 2: 全型チェックを実行**

```bash
pnpm -r typecheck
```

Expected: エラーなし

- [ ] **Step 3: Chrome 実機チェック（`chrome-check` スキル）**

`chrome-check` スキルを使用してスキャン画面の「場所を登録」フローを確認:

- 「場所を登録」ボタンタップ → ローディング → 候補リスト or キャッシュ MISS メッセージ
- 距離スライダーを動かすと候補がリアルタイムに絞り込まれること
- 各候補ボタンに `0.3km` 等の距離表示があること
- キャッシュ MISS 時は「近くの店舗を取得中です」が表示されること
- `GET /places/candidates` が `4xx/5xx` なしで成功すること
- コンソールエラーがないこと

- [ ] **Step 4: 最終コミット**

```bash
git add -A
git commit -m "feat: complete store cache Yahoo Local Search migration with tier-based expiry"
```

---

## セルフレビュー

### 仕様カバレッジ

| 要件 | タスク |
|---|---|
| Yahoo! Local Search API（14ジャンル）への切り替え | Task 3 |
| 大都市 30 日 / 地方都市 90 日 expires_at | Task 2, 5, 10 |
| 夜間バッチ物理削除（INSERT → DELETE の順） | Task 4, 5, 10 |
| `source` フラグによるバッチ/リアルタイム識別 | Task 1, 4 |
| 20km 固定キャッシュ | Task 3, 4 |
| Haversine 距離計算 | Task 5 |
| アダプティブ表示（5→10→20km） | Task 5 |
| DB キャッシュ（store_cache / store_cache_areas） | Task 1, 4 |
| バックグラウンドキャッシュ（cache_jobs） | Task 4, 7, 8 |
| 地方ユーザー: 即空返却 + 手動入力フォールバック | Task 5, 9 |
| 距離スライダー（クライアント側フィルタ） | Task 9 |
| `distanceKm` への統一（`distKm` を使わない） | Task 2, 5, 9 |
| `shared/` フォルダ整理（clients/ places/ throttler/） | Task 0 |
| Overpass / Google Places / hybrid 削除 | Task 0 |
| Google Places API 不使用（コメントで明示） | Task 8 |
| i18n キー追加 | Task 9 |
| Lambda 15 分対策（`--start-index` 引数） | Task 10 |

### セキュリティ確認

- `POST /internal/cache-jobs/process` は `X-Internal-Secret` ヘッダーで保護
- Yahoo API キーは環境変数 `YAHOO_APP_ID` から取得（ハードコード禁止）
- Prisma の型安全クエリのみ使用（`$queryRawUnsafe` 禁止）
- バッチの物理削除は `source='batch'` と `updatedAt < batchStartedAt` で絞り込み（`realtime` 行は巻き込まない）
