'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
} from '@/app/scan/scan.constants'

/**
 * MediaTrackCapabilities には zoom が含まれないブラウザが多いため、
 * 存在確認のためのランタイムガード用の型拡張を定義する。
 * as any 禁止のため interface 拡張で対応する。
 */
interface MediaTrackCapabilitiesWithZoom extends MediaTrackCapabilities {
  zoom?: { min: number; max: number; step: number }
}

/**
 * MediaTrackConstraintSet には zoom が含まれないブラウザ実装があるため、
 * applyConstraints の advanced に渡す型を拡張する。
 */
interface MediaTrackConstraintSetWithZoom extends MediaTrackConstraintSet {
  zoom?: number
}

type FacingMode = 'environment' | 'user'

type UseCameraReturn = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  captureFrame: () => ImageData | null
  startCamera: (mode?: FacingMode) => Promise<void>
  stopCamera: () => void
  zoomLevel: number
  setZoom: (level: number) => void
  supportsHardwareZoom: boolean
  facingMode: FacingMode
  toggleFacingMode: () => void
}

/** ズームレベルを [ZOOM_MIN, ZOOM_MAX] にクランプする */
const clampZoom = (level: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level))

export const useCamera = (): UseCameraReturn => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [zoomLevel, setZoomLevel] = useState<number>(ZOOM_DEFAULT)
  const [supportsHardwareZoom, setSupportsHardwareZoom] = useState<boolean>(false)
  const [facingMode, setFacingMode] = useState<FacingMode>('environment')
  // ピンチジェスチャー中の基準距離と基準ズームを ref で保持する
  const pinchStartDistanceRef = useRef<number | null>(null)
  const pinchStartZoomRef = useRef<number>(ZOOM_DEFAULT)

  const applyStreamToVideo = useCallback(
    async (stream: MediaStream): Promise<void> => {
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    },
    [],
  )

  const setZoom = useCallback(
    (level: number): void => {
      const clamped = clampZoom(level)
      setZoomLevel(clamped)

      if (!streamRef.current) return
      const tracks = streamRef.current.getVideoTracks()
      if (tracks.length === 0) return
      const track = tracks[0]
      if (!track) return

      const capabilities = track.getCapabilities() as MediaTrackCapabilitiesWithZoom
      // ハードウェアズーム対応環境のみ applyConstraints を呼ぶ
      if ('zoom' in capabilities && capabilities.zoom !== undefined) {
        const constraint: MediaTrackConstraintSetWithZoom = { zoom: clamped }
        void track.applyConstraints({ advanced: [constraint] })
      }
      // ハードウェア非対応の場合は zoomLevel の state 更新のみ行い、CSS 側（CameraView）に委ねる
    },
    [],
  )

  const startCamera = useCallback(async (mode: FacingMode = 'environment'): Promise<void> => {
    if (typeof window === 'undefined') return

    // フォーカスエリアを中央に強制指定（ピントずれ対策）。非対応ブラウザはフォールバック。
    const baseVideo: MediaTrackConstraints = { facingMode: mode }
    // focusMode はブラウザ固有の非標準プロパティ。型定義に含まれないため MediaTrackConstraintSet にキャスト
    const focusConstraint = { focusMode: 'continuous' } as MediaTrackConstraintSet
    const withFocus: MediaTrackConstraints = { ...baseVideo, advanced: [focusConstraint] }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: withFocus,
      })
    } catch {
      // advanced constraints が非対応ブラウザ向けにフォールバック
      stream = await navigator.mediaDevices.getUserMedia({
        video: baseVideo,
      })
    }

    await applyStreamToVideo(stream)

    // ストリーム取得後にハードウェアズーム対応フラグを確定する
    const tracks = stream.getVideoTracks()
    if (tracks.length > 0) {
      const track = tracks[0]
      if (track) {
        // getSupportedConstraints().zoom が false/undefined の場合はハードウェアズームを試行しない（iOS Safari 対応）
        const supported = navigator.mediaDevices.getSupportedConstraints()
        const zoomConstraintSupported =
          'zoom' in supported && (supported as Record<string, boolean>)['zoom'] === true

        if (zoomConstraintSupported) {
          const capabilities = track.getCapabilities() as MediaTrackCapabilitiesWithZoom
          setSupportsHardwareZoom('zoom' in capabilities && capabilities.zoom !== undefined)
        } else {
          setSupportsHardwareZoom(false)
        }
      }
    }
  }, [applyStreamToVideo])

  const stopCamera = useCallback((): void => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const toggleFacingMode = useCallback((): void => {
    const newMode: FacingMode = facingMode === 'environment' ? 'user' : 'environment'
    stopCamera()
    setFacingMode(newMode)
    void startCamera(newMode)
  }, [facingMode, stopCamera, startCamera])

  const captureFrame = useCallback((): ImageData | null => {
    const video = videoRef.current
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null
    }

    const width = video.videoWidth
    const height = video.videoHeight
    if (width === 0 || height === 0) return null

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    const canvas = canvasRef.current
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0, width, height)
    return ctx.getImageData(0, 0, width, height)
  }, [])

  // ピンチジェスチャーのイベントハンドラ（window にアタッチして確実に検知）
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent): void => {
      if (e.touches.length === 2) {
        const touch0 = e.touches[0]
        const touch1 = e.touches[1]
        if (!touch0 || !touch1) return
        const dx = touch0.clientX - touch1.clientX
        const dy = touch0.clientY - touch1.clientY
        pinchStartDistanceRef.current = Math.sqrt(dx * dx + dy * dy)
        pinchStartZoomRef.current = zoomLevel
      } else {
        pinchStartDistanceRef.current = null
      }
    }

    const handleTouchMove = (e: TouchEvent): void => {
      if (e.touches.length !== 2 || pinchStartDistanceRef.current === null) return
      const touch0 = e.touches[0]
      const touch1 = e.touches[1]
      if (!touch0 || !touch1) return
      const dx = touch0.clientX - touch1.clientX
      const dy = touch0.clientY - touch1.clientY
      const currentDistance = Math.sqrt(dx * dx + dy * dy)
      const scale = currentDistance / pinchStartDistanceRef.current
      setZoom(pinchStartZoomRef.current * scale)
    }

    // touchmove でスクロールと競合しないよう passive: true で登録する
    // ピンチ中にスクロール抑制する必要がある場合は setZoom 呼び出し時に改めて検討する
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })

    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
    }
  }, [zoomLevel, setZoom])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  return { videoRef, captureFrame, startCamera, stopCamera, zoomLevel, setZoom, supportsHardwareZoom, facingMode, toggleFacingMode }
}
