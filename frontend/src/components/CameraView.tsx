'use client'

import type { RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '@/app/scan/scan.constants'

type CameraViewProps = {
  videoRef: RefObject<HTMLVideoElement | null>
  zoomLevel: number
  supportsHardwareZoom: boolean
  onZoomChange: (level: number) => void
  facingMode: 'environment' | 'user'
  onToggleFacingMode: () => void
}

export const CameraView = ({
  videoRef,
  zoomLevel,
  supportsHardwareZoom,
  onZoomChange,
  facingMode,
  onToggleFacingMode,
}: CameraViewProps) => {
  const t = useTranslations('camera')

  // デジタルズーム: ハードウェアズーム非対応時は CSS transform: scale で拡大する。
  // transform-origin を center center にして中央基準で拡大し、
  // コンテナの overflow: hidden ではみ出しを隠す。
  const videoStyle: React.CSSProperties = supportsHardwareZoom
    ? {}
    : {
        transform: `scale(${zoomLevel})`,
        transformOrigin: 'center center',
      }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={videoStyle}
        className="absolute inset-0 w-full h-full object-cover"
        aria-label={t('videoLabel')}
      />
      {/* カメラ切り替えボタン: ラベル撮影の主操作を妨げないよう右上に配置する */}
      <div className="absolute top-2 right-2">
        <button
          type="button"
          onClick={onToggleFacingMode}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-black/50 text-white"
          aria-label={t('switchCamera')}
        >
          {facingMode === 'environment' ? '🔄' : '🔁'}
        </button>
      </div>
      <div className="absolute bottom-2 left-0 right-0 flex justify-center px-6">
        <input
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={ZOOM_STEP}
          value={zoomLevel}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          className="w-full accent-white"
          aria-label={t('zoomLabel')}
        />
      </div>
    </div>
  )
}
