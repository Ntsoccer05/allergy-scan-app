'use client'

import { useCallback, useEffect } from 'react'
import { useScan } from '@/hooks/useScan'
import { useOnboardingGuard } from '@/hooks/useOnboardingGuard'
import { CameraView } from '@/components/CameraView'
import { ScanGuide } from '@/components/ScanGuide'
import { ScanOverlay } from '@/components/ScanOverlay'
import { ResultCard } from '@/components/ResultCard'
import { GUIDE_MESSAGES } from '@/app/scan/scan.constants'

export default function ScanPage() {
  useOnboardingGuard()
  const {
    scanState, error, result, storeCandidates, onStoreSelect,
    videoRef, startScan, reset, manualCapture,
    zoomLevel, setZoom, supportsHardwareZoom, facingMode, toggleFacingMode,
    partialRawText,
  } = useScan()

  // 初回マウント時のみカメラを起動する（依存配列のサイズを一定に保つ）
  useEffect(() => {
    void startScan()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startScan])

  // 「もう一度スキャンする」: reset で状態とカメラをリセットし、直後に再起動する
  const handleScanAgain = useCallback(() => {
    reset()
    void startScan()
  }, [reset, startScan])

  const showManualButton = scanState === 'detecting' || scanState === 'idle'

  return (
    <div className="relative flex flex-col w-full max-w-120 lg:max-w-none mx-auto h-[calc(100vh-56px)] lg:h-screen overflow-hidden bg-black">
      <CameraView
        videoRef={videoRef}
        zoomLevel={zoomLevel}
        supportsHardwareZoom={supportsHardwareZoom}
        onZoomChange={setZoom}
        facingMode={facingMode}
        onToggleFacingMode={toggleFacingMode}
      />
      <ScanOverlay state={scanState} partialRawText={partialRawText} />

      <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-3 px-4">
        {/* 手動キャプチャボタン: 自動検出が通らないときの手動トリガー */}
        {showManualButton && (
          <button
            type="button"
            onClick={() => { void manualCapture() }}
            className="px-8 py-3 rounded-full bg-white/90 text-gray-900 text-sm font-semibold
              shadow-lg active:scale-95 transition-transform
              focus:outline-none focus:ring-2 focus:ring-white"
          >
            {GUIDE_MESSAGES.manual}
          </button>
        )}
        <ScanGuide state={scanState} error={error ?? undefined} />
      </div>

      {scanState === 'result' && result !== null && (
        <ResultCard result={result} onClose={handleScanAgain} storeCandidates={storeCandidates} onStoreSelect={onStoreSelect} />
      )}
    </div>
  )
}
