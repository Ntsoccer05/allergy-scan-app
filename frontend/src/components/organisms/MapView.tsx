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
} from '@/app/map/map.constants'
import type { JudgmentShort } from '@/app/scan/scan.types'

/** MapView が描画に必要とする最小限のピン情報。 */
export type MapPinView = {
  id: string
  lat: number
  lng: number
  judgment: JudgmentShort
}

type MapViewProps = {
  center: { lat: number; lng: number } | null
  pins: MapPinView[]
  onPinClick: (pin: MapPinView) => void
}

/**
 * 地図ライブラリ（MapLibre GL JS）の実装を閉じ込めるラッパーコンポーネント。
 * 将来 Google Maps 等へ差し替える場合はこのコンポーネントの内部実装のみ置き換える
 * （task 00320: props は center / pins / onPinClick に限定する）。
 * ⚠️ maplibre-gl は SSR 不可。必ずクライアントサイドでのみ読み込むこと
 * （呼び出し側で next/dynamic ssr:false を使う）。
 */
export const MapView = ({ center, pins, onPinClick }: MapViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  // マーカー再生成なしで最新のコールバックを呼べるよう ref に保持する
  const onPinClickRef = useRef(onPinClick)
  onPinClickRef.current = onPinClick

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [JAPAN_FALLBACK_CENTER.lng, JAPAN_FALLBACK_CENTER.lat],
      zoom: JAPAN_FALLBACK_ZOOM,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }))
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ピンの描画（judgment 別の色つきマーカー）
  // TODO: ピン件数が増えたら MapLibre の cluster source によるクラスタリングを導入する
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

  // カメラ位置の調整:
  // - ピンが複数 → 全ピン（+ 現在地）が入るよう fitBounds
  // - ピンが1件 → そのピンへ移動
  // - ピンなし・現在地あり → 現在地へ移動
  // - どちらもなし → 日本全体（初期値のまま）
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const points: [number, number][] = pins.map((pin) => [pin.lng, pin.lat])
    if (center) points.push([center.lng, center.lat])

    if (points.length >= 2) {
      const bounds = points.reduce(
        (acc, point) => acc.extend(point),
        new maplibregl.LngLatBounds(points[0], points[0]),
      )
      map.fitBounds(bounds, {
        padding: FIT_BOUNDS_PADDING_PX,
        maxZoom: FIT_BOUNDS_MAX_ZOOM,
      })
    } else if (points.length === 1) {
      map.flyTo({ center: points[0], zoom: PIN_FOCUS_ZOOM })
    }
  }, [pins, center])

  return <div ref={containerRef} className="h-full w-full" />
}
