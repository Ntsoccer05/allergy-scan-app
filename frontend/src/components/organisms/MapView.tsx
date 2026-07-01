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
  // マーカー再生成なしで最新のコールバックを呼べるよう ref に保持する
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
    // showUserHeading は省略（このバージョンの maplibre-gl TypeScript 型に未定義のため）
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showAccuracyCircle: true,
    })
    map.addControl(geolocate, 'bottom-right')

    geolocate.on('geolocate', (e: GeolocationPosition) => {
      onGeolocateRef.current?.(e.coords.latitude, e.coords.longitude)
      // 精度円と現在地ドットはクリックを透過させる（ピンが隠れてクリックできなくなるのを防ぐ）
      map.getContainer().querySelectorAll<HTMLElement>(
        '.maplibregl-user-location-accuracy-circle, .maplibregl-user-location-dot'
      ).forEach((el) => { el.style.pointerEvents = 'none' })
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

  // ピンの描画（judgment 別の色つきマーカー）
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
  // 注意: スタイルロード前（poiLayerIdsRef.current が空）に showPoi が変わっても no-op になる。
  // デフォルト showPoi=true かつスタイル読み込み後に操作可能なため実用上問題なし。
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const visibility = showPoi ? 'visible' : 'none'
    poiLayerIdsRef.current.forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', visibility)
      }
    })
  }, [showPoi])

  return <div ref={containerRef} className="h-full w-full" />
}
