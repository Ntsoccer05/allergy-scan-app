'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Props = {
  src: string
  /** 閉じるボタンの aria-label。親コンポーネントが t('detail.close') を渡す。 */
  closeAriaLabel: string
  onClose: () => void
}

const MIN_SCALE = 0.5
const MAX_SCALE = 5
const DOUBLE_TAP_MS = 300

function touchDist(t1: Touch, t2: Touch): number {
  return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
}

export function ImageLightbox({ src, closeAriaLabel, onClose }: Props) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // ネイティブイベントリスナー内でステールクロージャを避けるためにRefで管理
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  const pinchRef = useRef<number | null>(null)
  const panRef = useRef<{ x: number; y: number } | null>(null)
  const lastTapRef = useRef<number>(0)
  // タッチジェスチャー後の誤クローズを防ぐフラグ
  const didGestureRef = useRef(false)

  const applyState = useCallback(
    (nextScale: number, nextOffset: { x: number; y: number }) => {
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale))
      const o = s <= 1 ? { x: 0, y: 0 } : nextOffset
      scaleRef.current = s
      offsetRef.current = o
      setScale(s)
      setOffset(o)
    },
    [],
  )

  const reset = useCallback(() => applyState(1, { x: 0, y: 0 }), [applyState])

  // iOS Safari がサムネイルタップ時にビューポートを自動ズームすることがある。
  // ライトボックスが開いた直後にビューポートを 1x にリセットして補正する。
  useEffect(() => {
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
    if (!viewport) return
    const original = viewport.content
    viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
    const id = setTimeout(() => { viewport.content = original }, 300)
    return () => {
      clearTimeout(id)
      viewport.content = original
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      applyState(
        scaleRef.current * (e.deltaY < 0 ? 1.15 : 0.87),
        offsetRef.current,
      )
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // ブラウザのネイティブピンチズーム（ビューポートズーム）を防ぐ
        e.preventDefault()
        pinchRef.current = touchDist(e.touches[0], e.touches[1])
        panRef.current = null
      } else if (e.touches.length === 1) {
        const now = Date.now()
        if (now - lastTapRef.current < DOUBLE_TAP_MS) {
          // ダブルタップ: ブラウザのネイティブダブルタップズームを防ぐ
          e.preventDefault()
          // ダブルタップ: 等倍 ↔ 2倍 切り替え
          scaleRef.current > 1 ? reset() : applyState(2, { x: 0, y: 0 })
          lastTapRef.current = 0
          didGestureRef.current = true
        } else {
          lastTapRef.current = now
          panRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        }
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      didGestureRef.current = true
      if (e.touches.length === 2 && pinchRef.current !== null) {
        // ピンチズーム
        const newDist = touchDist(e.touches[0], e.touches[1])
        applyState(
          scaleRef.current * (newDist / pinchRef.current),
          offsetRef.current,
        )
        pinchRef.current = newDist
      } else if (
        e.touches.length === 1 &&
        panRef.current &&
        scaleRef.current > 1
      ) {
        // ドラッグパン（ズーム中のみ）
        const dx = e.touches[0].clientX - panRef.current.x
        const dy = e.touches[0].clientY - panRef.current.y
        applyState(scaleRef.current, {
          x: offsetRef.current.x + dx,
          y: offsetRef.current.y + dy,
        })
        panRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      }
    }

    const onTouchEnd = () => {
      pinchRef.current = null
      panRef.current = null
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [applyState, reset])

  const handleOverlayClick = () => {
    // ジェスチャー直後のタップによる誤クローズを防ぐ
    if (didGestureRef.current) {
      didGestureRef.current = false
      return
    }
    onClose()
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 overflow-hidden touch-none"
      onClick={handleOverlayClick}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        aria-label={closeAriaLabel}
        className="absolute top-4 right-4 z-10 text-white text-2xl p-2 hover:bg-white/10 rounded-full transition-colors"
      >
        ✕
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="max-w-[90vw] max-h-[90vh] object-contain select-none"
        draggable={false}
        style={{
          transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
          transformOrigin: 'center',
          touchAction: 'none',
          cursor: scale > 1 ? 'grab' : 'zoom-in',
          willChange: 'transform',
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
