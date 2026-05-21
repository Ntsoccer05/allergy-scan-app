'use client'

import { useState } from 'react'
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

/** カメラ切り替え SVG アイコン（2本の曲線矢印が輪を描くデザイン） */
const CameraFlipIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-5 h-5"
    aria-hidden="true"
  >
    <path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8A5.87 5.87 0 0 1 6 12c0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44 1.05.7 2.21.7 3.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z" />
  </svg>
)

export const CameraView = ({
  videoRef,
  zoomLevel,
  supportsHardwareZoom,
  onZoomChange,
  facingMode,
  onToggleFacingMode,
}: CameraViewProps) => {
  const t = useTranslations('camera')
  // クリックごとに 360° 加算することで CSS transition が毎回アニメーションを再生する
  const [rotateDeg, setRotateDeg] = useState(0)

  const handleToggle = () => {
    setRotateDeg((prev) => prev + 180)
    onToggleFacingMode()
  }

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
      {/* カメラ切り替えボタン */}
      <div className="absolute top-2 right-2">
        <button
          type="button"
          onClick={handleToggle}
          style={{
            transform: `rotate(${rotateDeg}deg)`,
            transition: 'transform 0.4s ease-in-out',
          }}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-black/50 text-white"
          aria-label={t('switchCamera')}
        >
          <CameraFlipIcon />
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
