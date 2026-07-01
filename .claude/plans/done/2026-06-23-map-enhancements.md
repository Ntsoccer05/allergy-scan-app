# 地図機能強化（現在地・経路・POI） 実装計画

> **エージェント向け:** REQUIRED SUB-SKILL: `executing-plans` または `subagent-driven-development` を使ってこの計画をタスクごとに実装すること。ステップはチェックボックス構文（`- [ ]`）で追跡。

**目標:** 地図画面に Google Maps 完全準拠の現在地表示・経路案内（車/徒歩/自転車はアプリ内、電車は Google Maps ディープリンク）・POI 表示切替を追加する。

**アーキテクチャ:**
- バックエンドに `RoutingModule`（`GET /route`）を新設し、OSRM（本番）/ ORS On-Premise（ローカル）を `ROUTING_PROVIDER` 環境変数で切り替える。車・徒歩・自転車の3モードをサポート。
- フロントエンドは MapLibre の `GeolocateControl` で青ドット＋現在地ボタンを実装し、経路は `routeLine` prop で MapView へ渡す GeoJSON LineString として描画する。
- 電車モードは Google Maps ディープリンクで外部委譲（OSRM/ORS は transit 非対応のため）。
- 交通手段セレクターは Google Maps と同じ並び順・SVG アイコンのみ（テキストラベルなし）: `[🚗] [🚌↗] [🚶] [🚲]`。テキストは `aria-label` に残してアクセシビリティを確保する。

**技術スタック:** NestJS, MapLibre GL JS, OSRM Public API, OpenRouteService On-Premise, next-intl

---

## ファイルマップ

### 新規作成
| ファイル | 責務 |
|---|---|
| `backend/src/routing/routing.types.ts` | `RouteResponse`・内部 API レスポンス型 |
| `backend/src/routing/routing.service.ts` | OSRM/ORS 呼び出し・レスポンス正規化 |
| `backend/src/routing/routing.service.spec.ts` | RoutingService ユニットテスト |
| `backend/src/routing/routing.controller.ts` | `GET /route` エンドポイント |
| `backend/src/routing/routing.module.ts` | NestJS モジュール |
| `frontend/src/lib/api/routing.api.ts` | `GET /route` クライアント関数 |
| `frontend/src/hooks/useRoute.ts` | 経路取得 Hook（状態管理） |
| `frontend/public/icons/maps/driving.svg` | Material Design `directions_car` SVG |
| `frontend/public/icons/maps/transit.svg` | Material Design `directions_transit` SVG |
| `frontend/public/icons/maps/walking.svg` | Material Design `directions_walk` SVG |
| `frontend/public/icons/maps/cycling.svg` | Material Design `directions_bike` SVG |

### 変更
| ファイル | 変更内容 |
|---|---|
| `backend/src/app.module.ts` | RoutingModule を imports に追加 |
| `frontend/src/app/map/map.types.ts` | `RouteResponse`, `TravelMode` 型追加 |
| `frontend/src/app/map/map.constants.ts` | 経路色・POI パターン・Google Maps URL ビルダー定数追加 |
| `frontend/src/components/organisms/MapView.tsx` | GeolocateControl 追加・`center` prop 削除・`onGeolocate`/`routeLine`/`showPoi` props 追加 |
| `frontend/src/app/map/page.tsx` | 空状態削除・ルート状態追加・交通手段選択 UI・POI トグルボタン |
| `frontend/public/locales/ja/map.json` | route.*・poi.* キー追加 |
| `frontend/public/locales/en/map.json` | route.*・poi.* キー追加 |

---

## Task 1: バックエンド RoutingModule

**Files:**
- Create: `backend/src/routing/routing.types.ts`
- Create: `backend/src/routing/routing.service.ts`
- Create: `backend/src/routing/routing.service.spec.ts`
- Create: `backend/src/routing/routing.controller.ts`
- Create: `backend/src/routing/routing.module.ts`
- Modify: `backend/src/app.module.ts`

### Step 1-1: 型定義を書く

- [ ] **`backend/src/routing/routing.types.ts` を作成する**

```typescript
/** GET /route のクエリパラメータ。 */
export type RouteQuery = {
  from_lat: string
  from_lng: string
  to_lat: string
  to_lng: string
  mode: 'driving' | 'walking' | 'cycling'
}

/** GET /route のレスポンス型。 */
export type RouteResponse = {
  geometry: {
    type: 'LineString'
    coordinates: [number, number][]
  }
  distance_m: number
  duration_sec: number
}

/** OSRM Public API レスポンス型（内部使用）。 */
export type OsrmRouteResponse = {
  code: string
  routes: Array<{
    geometry: { type: 'LineString'; coordinates: [number, number][] }
    legs: Array<{ distance: number; duration: number }>
  }>
}

/** OpenRouteService GeoJSON レスポンス型（内部使用）。 */
export type OrsRouteResponse = {
  features: Array<{
    geometry: { type: 'LineString'; coordinates: [number, number][] }
    properties: {
      summary: { distance: number; duration: number }
    }
  }>
}
```

### Step 1-2: RoutingService のテストを書く（失敗することを確認）

- [ ] **`backend/src/routing/routing.service.spec.ts` を作成する**

```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { RoutingService } from './routing.service'

const mockOsrmResponse = {
  code: 'Ok',
  routes: [{
    geometry: { type: 'LineString', coordinates: [[139.7, 35.6], [139.71, 35.61]] },
    legs: [{ distance: 850, duration: 612 }],
  }],
}

const mockOrsResponse = {
  features: [{
    geometry: { type: 'LineString', coordinates: [[139.7, 35.6], [139.71, 35.61]] },
    properties: { summary: { distance: 850, duration: 612 } },
  }],
}

describe('RoutingService', () => {
  let service: RoutingService
  let originalProvider: string | undefined
  let originalOsrmUrl: string | undefined

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoutingService],
    }).compile()
    service = module.get<RoutingService>(RoutingService)
    originalProvider = process.env.ROUTING_PROVIDER
    originalOsrmUrl = process.env.ROUTING_OSRM_URL
  })

  afterEach(() => {
    process.env.ROUTING_PROVIDER = originalProvider
    process.env.ROUTING_OSRM_URL = originalOsrmUrl
    jest.restoreAllMocks()
  })

  describe('OSRM プロバイダー（デフォルト）', () => {
    it('walking モードで OSRM を呼び RouteResponse を返す', async () => {
      process.env.ROUTING_PROVIDER = 'osrm'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockOsrmResponse,
      } as Response)

      const result = await service.getRoute(35.6, 139.7, 35.61, 139.71, 'walking')

      expect(result.distance_m).toBe(850)
      expect(result.duration_sec).toBe(612)
      expect(result.geometry.type).toBe('LineString')
      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls[0][0]).toContain('/walking/')
    })

    it('cycling モードで OSRM cycling プロファイルを使う', async () => {
      process.env.ROUTING_PROVIDER = 'osrm'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockOsrmResponse,
      } as Response)

      await service.getRoute(35.6, 139.7, 35.61, 139.71, 'cycling')

      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls[0][0]).toContain('/cycling/')
    })

    it('driving モードで OSRM driving プロファイルを使う', async () => {
      process.env.ROUTING_PROVIDER = 'osrm'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockOsrmResponse,
      } as Response)

      await service.getRoute(35.6, 139.7, 35.61, 139.71, 'driving')

      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls[0][0]).toContain('/driving/')
    })

    it('OSRM がルートなしを返したとき NotFoundException を投げる', async () => {
      process.env.ROUTING_PROVIDER = 'osrm'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 'Ok', routes: [] }),
      } as Response)

      await expect(service.getRoute(35.6, 139.7, 35.61, 139.71, 'walking'))
        .rejects.toThrow(NotFoundException)
    })

    it('OSRM が 500 を返したとき InternalServerErrorException を投げる', async () => {
      process.env.ROUTING_PROVIDER = 'osrm'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false, status: 500 } as Response)

      await expect(service.getRoute(35.6, 139.7, 35.61, 139.71, 'walking'))
        .rejects.toThrow(InternalServerErrorException)
    })
  })

  describe('ORS プロバイダー', () => {
    it('walking モードで ORS foot-walking プロファイルを使う', async () => {
      process.env.ROUTING_PROVIDER = 'ors'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockOrsResponse,
      } as Response)

      const result = await service.getRoute(35.6, 139.7, 35.61, 139.71, 'walking')

      expect(result.distance_m).toBe(850)
      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls[0][0]).toContain('foot-walking')
    })

    it('cycling モードで ORS cycling-regular プロファイルを使う', async () => {
      process.env.ROUTING_PROVIDER = 'ors'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockOrsResponse,
      } as Response)

      await service.getRoute(35.6, 139.7, 35.61, 139.71, 'cycling')

      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls[0][0]).toContain('cycling-regular')
    })

    it('driving モードで ORS driving-car プロファイルを使う', async () => {
      process.env.ROUTING_PROVIDER = 'ors'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockOrsResponse,
      } as Response)

      await service.getRoute(35.6, 139.7, 35.61, 139.71, 'driving')

      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls[0][0]).toContain('driving-car')
    })
  })
})
```

- [ ] **テストが失敗することを確認する**

```
pnpm --filter backend test routing.service
```

Expected: FAIL（`RoutingService` が存在しないため）

### Step 1-3: RoutingService を実装する

- [ ] **`backend/src/routing/routing.service.ts` を作成する**

```typescript
import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common'
import type {
  OrsRouteResponse,
  OsrmRouteResponse,
  RouteResponse,
} from './routing.types'

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name)

  async getRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    mode: 'driving' | 'walking' | 'cycling',
  ): Promise<RouteResponse> {
    const provider = process.env.ROUTING_PROVIDER ?? 'osrm'
    if (provider === 'ors') {
      return this.fetchOrs(fromLat, fromLng, toLat, toLng, mode)
    }
    return this.fetchOsrm(fromLat, fromLng, toLat, toLng, mode)
  }

  private async fetchOsrm(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    mode: 'driving' | 'walking' | 'cycling',
  ): Promise<RouteResponse> {
    // OSRM プロファイル名は mode と同じ（driving/walking/cycling）
    const profile = mode
    const baseUrl = process.env.ROUTING_OSRM_URL ?? 'http://router.project-osrm.org'
    const url = `${baseUrl}/route/v1/${profile}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`

    this.logger.log('OSRM route request', { url })
    const res = await fetch(url)
    if (!res.ok) {
      this.logger.error('OSRM error', { status: res.status })
      throw new InternalServerErrorException('ルート取得に失敗しました')
    }

    const data = (await res.json()) as OsrmRouteResponse
    const route = data.routes[0]
    if (!route) throw new NotFoundException('ルートが見つかりません')

    return {
      geometry: route.geometry,
      distance_m: Math.round(route.legs[0].distance),
      duration_sec: Math.round(route.legs[0].duration),
    }
  }

  private async fetchOrs(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    mode: 'driving' | 'walking' | 'cycling',
  ): Promise<RouteResponse> {
    // ORS はプロファイル名が OSRM と異なるためマッピングが必要
    const profile =
      mode === 'driving' ? 'driving-car'
      : mode === 'cycling' ? 'cycling-regular'
      : 'foot-walking'
    const baseUrl = process.env.ROUTING_ORS_URL ?? 'http://localhost:8080'
    const url = `${baseUrl}/ors/v2/directions/${profile}?start=${fromLng},${fromLat}&end=${toLng},${toLat}&format=geojson`

    this.logger.log('ORS route request', { url })
    const res = await fetch(url)
    if (!res.ok) {
      this.logger.error('ORS error', { status: res.status })
      throw new InternalServerErrorException('ルート取得に失敗しました')
    }

    const data = (await res.json()) as OrsRouteResponse
    const feature = data.features[0]
    if (!feature) throw new NotFoundException('ルートが見つかりません')

    return {
      geometry: feature.geometry,
      distance_m: Math.round(feature.properties.summary.distance),
      duration_sec: Math.round(feature.properties.summary.duration),
    }
  }
}
```

- [ ] **テストがパスすることを確認する**

```
pnpm --filter backend test routing.service
```

Expected: PASS

### Step 1-4: Controller を作成する

- [ ] **`backend/src/routing/routing.controller.ts` を作成する**

```typescript
import { Controller, Get, Query, ParseFloatPipe, BadRequestException } from '@nestjs/common'
import { RoutingService } from './routing.service'
import type { RouteResponse } from './routing.types'

@Controller('route')
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  @Get()
  async getRoute(
    @Query('from_lat', ParseFloatPipe) fromLat: number,
    @Query('from_lng', ParseFloatPipe) fromLng: number,
    @Query('to_lat', ParseFloatPipe) toLat: number,
    @Query('to_lng', ParseFloatPipe) toLng: number,
    @Query('mode') mode: string,
  ): Promise<RouteResponse> {
    if (mode !== 'driving' && mode !== 'walking' && mode !== 'cycling') {
      throw new BadRequestException('mode は driving / walking / cycling のみ')
    }
    return this.routingService.getRoute(fromLat, fromLng, toLat, toLng, mode)
  }
}
```

### Step 1-5: Module とアプリへの登録

- [ ] **`backend/src/routing/routing.module.ts` を作成する**

```typescript
import { Module } from '@nestjs/common'
import { RoutingController } from './routing.controller'
import { RoutingService } from './routing.service'

@Module({
  controllers: [RoutingController],
  providers: [RoutingService],
})
export class RoutingModule {}
```

- [ ] **`backend/src/app.module.ts` を修正する（`RoutingModule` を imports に追加）**

```typescript
import { RoutingModule } from './routing/routing.module'

@Module({
  imports: [
    // ... 既存の imports ...
    RoutingModule,  // 追加
  ],
  // ...
})
export class AppModule {}
```

### Step 1-6: 型チェック & コミット

- [ ] **型チェックを実行する**

```
pnpm --filter backend typecheck
```

Expected: エラーなし

- [ ] **コミットする**

```bash
git add backend/src/routing/ backend/src/app.module.ts
git commit -m "feat: add RoutingModule (GET /route) with OSRM/ORS provider switching"
```

---

## Task 2: フロントエンド型・定数・API クライアント

**Files:**
- Modify: `frontend/src/app/map/map.types.ts`
- Modify: `frontend/src/app/map/map.constants.ts`
- Create: `frontend/src/lib/api/routing.api.ts`
- Create: `frontend/src/hooks/useRoute.ts`

### Step 2-1: 型定義を追加する

- [ ] **`frontend/src/app/map/map.types.ts` を修正する（末尾に追加）**

```typescript
/** GET /route のレスポンス型。 */
export type RouteResponse = {
  geometry: {
    type: 'LineString'
    coordinates: [number, number][]
  }
  distance_m: number
  duration_sec: number
}

/**
 * 移動手段。Google Maps と同じ順序で定義。
 * transit のみ Google Maps ディープリンクで処理し、それ以外はアプリ内で経路描画。
 */
export type TravelMode = 'driving' | 'transit' | 'walking' | 'cycling'

/** 現在地の座標。 */
export type LatLng = { lat: number; lng: number }
```

### Step 2-2: 定数を追加する

- [ ] **`frontend/src/app/map/map.constants.ts` を修正する（末尾に追加）**

```typescript
/** 経路ラインの色（Google Maps 青）。 */
export const ROUTE_LINE_COLOR = '#1a73e8'

/** 経路ラインの太さ（px）。 */
export const ROUTE_LINE_WIDTH = 5

/**
 * POI レイヤーの検出パターン。
 * OpenFreeMap Liberty スタイルの layer.id をこのパターンでフィルタリングする。
 */
export const POI_LAYER_PATTERNS = ['poi', 'restaurant', 'parking', 'shop', 'tourism', 'amenity'] as const

/** 電車モード選択時に遷移する Google Maps URL のベース。 */
export const buildGoogleMapsTransitUrl = (
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): string =>
  `https://www.google.com/maps/dir/?api=1` +
  `&origin=${from.lat},${from.lng}` +
  `&destination=${to.lat},${to.lng}` +
  `&travelmode=transit`
```

### Step 2-3: 経路 API クライアントを作成する

- [ ] **`frontend/src/lib/api/routing.api.ts` を作成する**

```typescript
import { apiFetch } from './api-client'
import type { RouteResponse, TravelMode } from '@/app/map/map.types'

type GetRouteParams = {
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  /** transit 以外の3モードをバックエンドへ送信する。 */
  mode: Exclude<TravelMode, 'transit'>
}

export const getRoute = async (params: GetRouteParams): Promise<RouteResponse> => {
  const { fromLat, fromLng, toLat, toLng, mode } = params
  const qs = new URLSearchParams({
    from_lat: String(fromLat),
    from_lng: String(fromLng),
    to_lat: String(toLat),
    to_lng: String(toLng),
    mode,
  })
  const res = await apiFetch(`/route?${qs}`)
  return res.json() as Promise<RouteResponse>
}
```

### Step 2-4: useRoute Hook を作成する

- [ ] **`frontend/src/hooks/useRoute.ts` を作成する**

```typescript
import { useCallback, useState } from 'react'
import { getRoute } from '@/lib/api/routing.api'
import type { LatLng, RouteResponse, TravelMode } from '@/app/map/map.types'

type UseRouteReturn = {
  route: RouteResponse | null
  isLoading: boolean
  error: string | null
  fetchRoute: (from: LatLng, to: LatLng, mode: Exclude<TravelMode, 'transit'>) => Promise<void>
  clearRoute: () => void
}

export const useRoute = (): UseRouteReturn => {
  const [route, setRoute] = useState<RouteResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRoute = useCallback(async (
    from: LatLng,
    to: LatLng,
    mode: Exclude<TravelMode, 'transit'>,  // 'driving' | 'walking' | 'cycling'
  ) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getRoute({
        fromLat: from.lat,
        fromLng: from.lng,
        toLat: to.lat,
        toLng: to.lng,
        mode,
      })
      setRoute(result)
    } catch {
      setError('route.error')
      setRoute(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearRoute = useCallback(() => {
    setRoute(null)
    setError(null)
  }, [])

  return { route, isLoading, error, fetchRoute, clearRoute }
}
```

### Step 2-5: 型チェック & コミット

- [ ] **型チェックを実行する**

```
pnpm --filter frontend typecheck
```

Expected: エラーなし

- [ ] **コミットする**

```bash
git add frontend/src/app/map/map.types.ts frontend/src/app/map/map.constants.ts frontend/src/lib/api/routing.api.ts frontend/src/hooks/useRoute.ts
git commit -m "feat: add routing types, constants, API client and useRoute hook"
```

---

## Task 3: MapView.tsx の強化

**Files:**
- Modify: `frontend/src/components/organisms/MapView.tsx`

**変更の概要:**
1. `center` prop を削除（GeolocateControl が担う）
2. `onGeolocate` prop 追加（ページが現在地座標を受け取るため）
3. `routeLine` prop 追加（経路の GeoJSON LineString）
4. `showPoi` prop 追加（POI レイヤー表示切替）
5. `GeolocateControl` を追加してロード時に自動発火
6. 経路レイヤー（source + layer）を追加
7. `routeLine` 変化時に fitBounds で経路全体を表示
8. POI レイヤーの表示切替ロジック

### Step 3-1: MapView を書き直す

- [ ] **`frontend/src/components/organisms/MapView.tsx` を修正する**

```typescript
'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  FIT_BOUNDS_MAX_ZOOM,
  FIT_BOUNDS_PADDING_PX,
  JAPAN_FALLBACK_CENTER,
  JAPAN_FALLBACK_ZOOM,
  MAP_STYLE_URL,
  PIN_COLORS,
  PIN_FOCUS_ZOOM,
  POI_LAYER_PATTERNS,
  ROUTE_LINE_COLOR,
  ROUTE_LINE_WIDTH,
} from '@/app/map/map.constants'
import type { JudgmentShort } from '@/app/scan/scan.types'
import type { RouteResponse } from '@/app/map/map.types'

/** MapView が描画に必要とする最小限のピン情報。 */
export type MapPinView = {
  id: string
  lat: number
  lng: number
  judgment: JudgmentShort
}

type MapViewProps = {
  pins: MapPinView[]
  onPinClick: (pin: MapPinView) => void
  /** GeolocateControl が現在地を取得したときに呼ばれる。ルーティングの from 座標として使う。 */
  onGeolocate?: (lat: number, lng: number) => void
  /** 描画する経路（null でクリア）。 */
  routeLine?: RouteResponse['geometry'] | null
  /** POI レイヤーの表示状態（デフォルト: true）。 */
  showPoi?: boolean
}

const ROUTE_SOURCE_ID = 'route-source'
const ROUTE_LAYER_ID = 'route-layer'

/**
 * 地図ライブラリ（MapLibre GL JS）の実装を閉じ込めるラッパーコンポーネント。
 * 将来 Google Maps 等へ差し替える場合はこのコンポーネントの内部実装のみ置き換える。
 * ⚠️ maplibre-gl は SSR 不可。必ずクライアントサイドでのみ読み込むこと
 * （呼び出し側で next/dynamic ssr:false を使う）。
 */
export const MapView = ({
  pins,
  onPinClick,
  onGeolocate,
  routeLine,
  showPoi = true,
}: MapViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const onPinClickRef = useRef(onPinClick)
  onPinClickRef.current = onPinClick
  const onGeolocateRef = useRef(onGeolocate)
  onGeolocateRef.current = onGeolocate
  // POI レイヤー ID のキャッシュ（style ロード後に確定する）
  const poiLayerIdsRef = useRef<string[]>([])

  // 地図の初期化（1回のみ）
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [JAPAN_FALLBACK_CENTER.lng, JAPAN_FALLBACK_CENTER.lat],
      zoom: JAPAN_FALLBACK_ZOOM,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    // GeolocateControl: 青ドット表示 + ロード時に自動発火（Google Maps ライク）
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showAccuracyCircle: true,
      showUserHeading: true,
    })
    map.addControl(geolocate, 'bottom-right')

    geolocate.on('geolocate', (e: GeolocationPosition) => {
      onGeolocateRef.current?.(e.coords.latitude, e.coords.longitude)
    })

    map.on('load', () => {
      // 現在地へ自動移動（Google Maps の初期表示と同じ挙動）
      geolocate.trigger()

      // 経路ソース・レイヤーを事前登録（データは空）
      map.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      })
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ROUTE_LINE_COLOR,
          'line-width': ROUTE_LINE_WIDTH,
          'line-opacity': 0.9,
        },
      })

      // POI レイヤー ID を収集（パターンマッチ）
      poiLayerIdsRef.current = map
        .getStyle()
        .layers.map((l) => l.id)
        .filter((id) => POI_LAYER_PATTERNS.some((p) => id.toLowerCase().includes(p)))
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ピンの描画
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = pins.map((pin) => {
      const marker = new maplibregl.Marker({ color: PIN_COLORS[pin.judgment] })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map)
      const element = marker.getElement()
      element.style.cursor = 'pointer'
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        onPinClickRef.current(pin)
      })
      return marker
    })
  }, [pins])

  // ピンが複数 → fitBounds、1件 → flyTo（現在地は含めない: GeolocateControl に委譲）
  useEffect(() => {
    const map = mapRef.current
    if (!map || pins.length === 0) return
    const points: [number, number][] = pins.map((pin) => [pin.lng, pin.lat])

    if (points.length >= 2) {
      const bounds = points.reduce(
        (acc, point) => acc.extend(point),
        new maplibregl.LngLatBounds(points[0], points[0]),
      )
      map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING_PX, maxZoom: FIT_BOUNDS_MAX_ZOOM })
    } else {
      map.flyTo({ center: points[0], zoom: PIN_FOCUS_ZOOM })
    }
  }, [pins])

  // 経路ラインの更新
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource(ROUTE_SOURCE_ID)) return

    const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource
    if (!routeLine) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [] },
      })
      return
    }

    source.setData({ type: 'Feature', properties: {}, geometry: routeLine })

    // 経路全体が見えるよう fitBounds
    if (routeLine.coordinates.length >= 2) {
      const bounds = routeLine.coordinates.reduce(
        (acc, coord) => acc.extend(coord as [number, number]),
        new maplibregl.LngLatBounds(
          routeLine.coordinates[0] as [number, number],
          routeLine.coordinates[0] as [number, number],
        ),
      )
      map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING_PX + 20, maxZoom: FIT_BOUNDS_MAX_ZOOM })
    }
  }, [routeLine])

  // POI レイヤーの表示切替
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const visibility = showPoi ? 'visible' : 'none'
    poiLayerIdsRef.current.forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', visibility)
      }
    })
  }, [showPoi])

  return <div ref={containerRef} className="h-full w-full" />
}
```

### Step 3-2: 型チェック & コミット

- [ ] **型チェックを実行する**

```
pnpm --filter frontend typecheck
```

Expected: エラーなし（`center` prop を使っていた `page.tsx` でエラーが出る場合は Task 4 で修正する）

- [ ] **コミットする**

```bash
git add frontend/src/components/organisms/MapView.tsx
git commit -m "feat(map): add GeolocateControl, route line layer and POI toggle to MapView"
```

---

## Task 4: page.tsx の強化 + i18n

**Files:**
- Modify: `frontend/src/app/map/page.tsx`
- Modify: `frontend/public/locales/ja/map.json`
- Modify: `frontend/public/locales/en/map.json`

### Step 4-1: SVG アイコンファイルを作成する

Google Maps と同じ Material Design Icons（Apache 2.0 ライセンス）。
CSS mask-image で使うため、`fill` は `currentColor` ではなく黒（`#000`）で記述する。

- [ ] **`frontend/public/icons/maps/driving.svg` を作成する（directions_car）**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000">
  <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
</svg>
```

- [ ] **`frontend/public/icons/maps/transit.svg` を作成する（directions_transit）**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000">
  <path d="M12 2c-4.42 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zm0 2c3.11 0 5.5.32 6.5 1H5.5c.95-.67 3.36-1 6.5-1zm0 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm4-8H8V7h8v3z"/>
</svg>
```

- [ ] **`frontend/public/icons/maps/walking.svg` を作成する（directions_walk）**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000">
  <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z"/>
</svg>
```

- [ ] **`frontend/public/icons/maps/cycling.svg` を作成する（directions_bike）**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000">
  <path d="M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10l2.4-2.4.8.8c1.3 1.3 3 2.1 5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4C7.3 8.9 7 9.6 7 10.3c0 .8.3 1.5.8 2l3.2 3.2V19h2v-4.4l-2.2-2.1.5-.5zm8.2 1.5c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z"/>
</svg>
```

### Step 4-2: i18n キーを追加する

- [ ] **`frontend/public/locales/ja/map.json` を修正する**

```json
{
  "title": "購入場所マップ",
  "toggle": {
    "mine": "自分のピン",
    "public": "みんなのピン"
  },
  "error": "マップ情報の取得に失敗しました",
  "storeName": "📍 {store}",
  "card": {
    "close": "閉じる",
    "unnamed": "商品名なし",
    "publicBadge": "みんなのスキャン"
  },
  "route": {
    "clear": "経路をクリア",
    "driving": "車",
    "transit": "電車 ↗",
    "walking": "徒歩",
    "cycling": "自転車",
    "summary": "約{minutes}分（{km}km）",
    "error": "経路を取得できませんでした",
    "loading": "経路を計算中..."
  },
  "poi": {
    "toggle": "スポット"
  }
}
```

- [ ] **`frontend/public/locales/en/map.json` を修正する**

```json
{
  "title": "Purchase Location Map",
  "toggle": {
    "mine": "My pins",
    "public": "Everyone's pins"
  },
  "error": "Failed to load map data",
  "storeName": "📍 {store}",
  "card": {
    "close": "Close",
    "unnamed": "Unnamed product",
    "publicBadge": "Everyone's scan"
  },
  "route": {
    "clear": "Clear route",
    "driving": "Drive",
    "transit": "Transit ↗",
    "walking": "Walk",
    "cycling": "Cycle",
    "summary": "~{minutes} min ({km} km)",
    "error": "Could not get route",
    "loading": "Getting route..."
  },
  "poi": {
    "toggle": "Places"
  }
}
```

### Step 4-2: page.tsx を書き直す

- [ ] **`frontend/src/app/map/page.tsx` を修正する**

```typescript
'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner'
import { useMapLocations } from '@/hooks/useMapLocations'
import { useRoute } from '@/hooks/useRoute'
import type { MapPinView } from '@/components/organisms/MapView'
import { buildGoogleMapsTransitUrl } from './map.constants'
import type { LatLng, MapPin, PublicMapPin, TravelMode } from './map.types'

const MapView = dynamic(
  () => import('@/components/organisms/MapView').then((m) => m.MapView),
  { ssr: false },
)

const JUDGMENT_EMOJI: Record<'ng' | 'partial' | 'ok', string> = {
  ng: '🔴',
  partial: '🟡',
  ok: '✅',
}

/**
 * Google Maps と同じ順序。SVGファイルは public/icons/maps/{mode}.svg に置く。
 * CSS mask-image で色を制御するため、img タグは使わない（fill="currentColor" 相当）。
 */
const TRAVEL_MODES: { mode: TravelMode; labelKey: string }[] = [
  { mode: 'driving', labelKey: 'route.driving' },
  { mode: 'transit', labelKey: 'route.transit' },
  { mode: 'walking', labelKey: 'route.walking' },
  { mode: 'cycling', labelKey: 'route.cycling' },
]

type PinSource = 'mine' | 'public'

type PagePin = MapPinView & {
  source: PinSource
  product_name: string | null
  thumbnail_url: string | null
  store_name: string | null
  scanned_at: string
  detected: string[]
}

const toPagePin = (pin: MapPin | PublicMapPin, source: PinSource): PagePin => ({
  id: pin.id,
  lat: pin.lat,
  lng: pin.lng,
  judgment: pin.judgment,
  source,
  product_name: pin.product_name,
  thumbnail_url: pin.thumbnail_url,
  store_name: pin.store_name,
  scanned_at: pin.scanned_at,
  detected: 'detected' in pin ? pin.detected : [],
})

export default function MapPage() {
  const t = useTranslations('map')
  const { data, isLoading, isError } = useMapLocations()
  const { route, isLoading: isRouteLoading, fetchRoute, clearRoute } = useRoute()

  const [showMine, setShowMine] = useState(true)
  const [showPublic, setShowPublic] = useState(true)
  const [selectedPin, setSelectedPin] = useState<PagePin | null>(null)
  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [showPoi, setShowPoi] = useState(true)
  const [selectedTravelMode, setSelectedTravelMode] = useState<TravelMode | null>(null)

  const pins = useMemo<PagePin[]>(() => {
    if (!data) return []
    return [
      ...(showMine ? data.mine.map((pin) => toPagePin(pin, 'mine')) : []),
      ...(showPublic ? data.public.map((pin) => toPagePin(pin, 'public')) : []),
    ]
  }, [data, showMine, showPublic])

  const pinIndex = useMemo(() => {
    const index = new Map<string, PagePin>()
    pins.forEach((pin) => index.set(pin.id, pin))
    return index
  }, [pins])

  const handlePinClick = (pin: MapPinView) => {
    clearRoute()
    setSelectedPin(pinIndex.get(pin.id) ?? null)
  }

  const handleCloseCard = () => {
    setSelectedPin(null)
    setSelectedTravelMode(null)
    clearRoute()
  }

  const handleRouteMode = async (mode: TravelMode) => {
    if (!selectedPin || !userLocation) return
    setSelectedTravelMode(mode)

    if (mode === 'transit') {
      const url = buildGoogleMapsTransitUrl(userLocation, { lat: selectedPin.lat, lng: selectedPin.lng })
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }

    await fetchRoute(userLocation, { lat: selectedPin.lat, lng: selectedPin.lng }, mode)
  }

  const formattedDate = selectedPin
    ? new Date(selectedPin.scanned_at).toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const routeSummary = route
    ? t('route.summary', {
        minutes: Math.ceil(route.duration_sec / 60),
        km: (route.distance_m / 1000).toFixed(1),
      })
    : null

  return (
    <main className="relative h-[calc(100dvh-3.5rem)] lg:h-dvh">
      {/* 地図本体 */}
      <div className="absolute inset-0">
        <MapView
          pins={pins}
          onPinClick={handlePinClick}
          onGeolocate={(lat, lng) => setUserLocation({ lat, lng })}
          routeLine={route?.geometry ?? null}
          showPoi={showPoi}
        />
      </div>

      {/* 上部バー: ピン切替 + POI トグル */}
      <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-4 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => setShowMine((prev) => !prev)}
            aria-pressed={showMine}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium shadow transition-colors ${
              showMine ? 'bg-blue-600 text-white' : 'bg-white text-gray-500'
            }`}
          >
            {t('toggle.mine')}
          </button>
          <button
            type="button"
            onClick={() => setShowPublic((prev) => !prev)}
            aria-pressed={showPublic}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium shadow transition-colors ${
              showPublic ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500'
            }`}
          >
            {t('toggle.public')}
          </button>

          {/* POI 表示切替（Google Maps のレイヤーボタンに相当） */}
          <button
            type="button"
            onClick={() => setShowPoi((prev) => !prev)}
            aria-pressed={showPoi}
            className={`ml-auto shrink-0 px-3 py-1.5 rounded-full text-sm font-medium shadow transition-colors ${
              showPoi ? 'bg-white text-gray-700' : 'bg-gray-200 text-gray-400'
            }`}
          >
            {t('poi.toggle')}
          </button>
        </div>
      </div>

      {/* 読み込み・エラー */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <LoadingSpinner />
        </div>
      )}
      {isError && (
        <p className="absolute top-20 left-4 right-4 z-10 text-center text-sm text-red-600 bg-white/90 rounded-xl py-3 shadow">
          {t('error')}
        </p>
      )}

      {/* ピン詳細 + 経路操作ボトムシート */}
      {selectedPin && (
        <div className="absolute bottom-4 left-4 right-4 z-10 animate-in slide-in-from-bottom-4 duration-200">
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            {/* ドラッグハンドル（Google Maps ライク） */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            <div className="px-4 pb-4 space-y-3">
              {/* ピン情報 */}
              <div className="flex items-start gap-3">
                {selectedPin.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedPin.thumbnail_url}
                    alt={selectedPin.product_name ?? ''}
                    className="h-16 w-16 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-lg bg-gray-100 shrink-0" />
                )}

                <div className="flex-1 min-w-0 space-y-1 pr-8">
                  <div className="flex items-center gap-2 font-semibold text-base">
                    <span>{JUDGMENT_EMOJI[selectedPin.judgment]}</span>
                    {selectedPin.source === 'public' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-normal bg-green-100 text-green-700">
                        {t('card.publicBadge')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 truncate">
                    {selectedPin.product_name ?? t('card.unnamed')}
                  </p>
                  {selectedPin.store_name && (
                    <p className="text-xs text-gray-500 truncate">
                      {t('storeName', { store: selectedPin.store_name })}
                    </p>
                  )}
                  <time className="block text-xs text-gray-400" dateTime={selectedPin.scanned_at}>
                    {formattedDate}
                  </time>
                </div>

                <button
                  type="button"
                  onClick={handleCloseCard}
                  className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
                  aria-label={t('card.close')}
                >
                  ✕
                </button>
              </div>

              {selectedPin.source === 'mine' && selectedPin.detected.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {selectedPin.detected.map((allergen) => (
                    <li
                      key={allergen}
                      className="text-sm font-medium bg-red-50 text-red-700 rounded-full px-3 py-1"
                    >
                      {allergen}
                    </li>
                  ))}
                </ul>
              )}

              {/* 経路情報（取得済み） */}
              {routeSummary && (
                <div className="bg-blue-50 rounded-xl px-3 py-2 text-sm text-blue-800 font-medium">
                  {routeSummary}
                </div>
              )}

              {/* 交通手段セレクター（Google Maps と同じ Material Design SVG アイコン横並び） */}
              {userLocation && (
                <div className="border-t border-gray-100 pt-3">
                  <div className="flex justify-around">
                    {TRAVEL_MODES.map(({ mode, labelKey }) => (
                      <button
                        key={mode}
                        type="button"
                        disabled={isRouteLoading}
                        onClick={() => void handleRouteMode(mode)}
                        // aria-label でテキストを保持してスクリーンリーダー対応（表示はアイコンのみ）
                        aria-label={t(labelKey)}
                        className={`flex items-center justify-center p-3 rounded-xl transition-colors disabled:opacity-50 ${
                          // 選択中のモードを青くハイライト（Google Maps と同じ挙動）
                          selectedTravelMode === mode
                            ? 'bg-blue-50'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        {/*
                          SVGファイルは public/icons/maps/{mode}.svg。
                          img タグだと CSS で色が変えられないため CSS mask-image を使う。
                          background-color が SVG の形でマスクされ、選択状態で青・非選択でグレーになる。
                          テキストラベルは表示せず、Google Maps と同様にアイコンのみで識別する。
                        */}
                        <span
                          aria-hidden="true"
                          className={`block w-6 h-6 ${
                            selectedTravelMode === mode ? 'bg-blue-600' : 'bg-gray-400'
                          }`}
                          style={{
                            maskImage: `url(/icons/maps/${mode}.svg)`,
                            maskSize: 'contain',
                            maskRepeat: 'no-repeat',
                            maskPosition: 'center',
                            WebkitMaskImage: `url(/icons/maps/${mode}.svg)`,
                            WebkitMaskSize: 'contain',
                            WebkitMaskRepeat: 'no-repeat',
                            WebkitMaskPosition: 'center',
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 経路クリア */}
              {route && (
                <button
                  type="button"
                  onClick={clearRoute}
                  className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {t('route.clear')}
                </button>
              )}

              {/* 経路計算中 */}
              {isRouteLoading && (
                <p className="text-center text-sm text-gray-500">{t('route.loading')}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
```

### Step 4-3: 型チェックを実行する

- [ ] **型チェックを実行する**

```
pnpm --filter frontend typecheck
```

Expected: エラーなし

### Step 4-4: コミットする

```bash
git add frontend/src/app/map/page.tsx frontend/public/locales/ja/map.json frontend/public/locales/en/map.json
git commit -m "feat(map): Google Maps-like UX - current location, routing (walk/cycle/transit), POI toggle"
```

---

## Task 5: 全体検証

### Step 5-1: バックエンドテスト

- [ ] **バックエンドテストを実行する**

```
pnpm --filter backend test
```

Expected: 全テスト PASS

### Step 5-2: フロントエンド型チェック

- [ ] **フロントエンド型チェックを実行する**

```
pnpm --filter frontend typecheck
```

Expected: エラーなし

### Step 5-3: Chrome 実機テスト

地図画面の以下の動作を `mcp__chrome-devtools__*` で確認する（`chrome_testing.md` 準拠）:

1. `http://localhost:3000/map` を開く
2. 青いドットが現在地に表示されること（GeolocateControl 自動発火）
3. 右下に現在地ボタンが表示され、タップで現在地に戻ること
4. ピンをタップ → ボトムシートが表示されること
5. [徒歩] [自転車] ボタンで経路ラインが地図上に描画されること
6. [電車 ↗] で Google Maps が新タブで開くこと
7. 右上「スポット」ボタンで POI の表示・非表示が切り替わること
8. 空状態メッセージが表示されないこと
9. コンソールエラーがないこと

### Step 5-4: 最終コミット（必要な修正があれば）

```bash
git add -p
git commit -m "fix(map): address review findings"
```

---

## セルフレビュー

### 仕様カバレッジ確認

| 要件 | 対応タスク |
|---|---|
| 初期表示で現在地に移動 + 青ドット | Task 3（GeolocateControl trigger） |
| 現在地に戻るボタン（右下） | Task 3（GeolocateControl 標準機能） |
| 車経路をアプリ内で描画 | Task 1（backend driving profile） + Task 3（routeLine prop） + Task 4（useRoute） |
| 徒歩経路をアプリ内で描画 | 同上（mode: 'walking'） |
| 自転車経路をアプリ内で描画 | 同上（mode: 'cycling'） |
| 電車 → Google Maps ディープリンク | Task 2（buildGoogleMapsTransitUrl） + Task 4 |
| OSRM（本番）/ ORS（ローカル）切替 | Task 1（ROUTING_PROVIDER env var） |
| 空状態メッセージの削除 | Task 4（`empty` キー使用箇所を削除） |
| POI 表示切替 | Task 3（showPoi prop） + Task 4（toggle button） |
| Google Maps ライク UI | Task 3-4（ドラッグハンドル・ボトムシート・配色） |
| i18n（ja/en） | Task 4（map.json 両言語更新） |

### 型一貫性確認

- `RouteResponse` は `map.types.ts` で定義 → `routing.api.ts` で使用 → `useRoute.ts` で保持 → `MapView` の `routeLine` prop に渡す（`RouteResponse['geometry']`）
- `TravelMode` は `map.types.ts` で定義 → `page.tsx` の `handleRouteMode` と `useRoute.ts` で使用
- `LatLng` は `map.types.ts` で定義 → `useRoute.ts` と `page.tsx` で使用
- MapView の `center` prop は削除済み → `page.tsx` で `center` を渡していない
