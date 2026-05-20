'use client'

import { useEffect } from 'react'
import { useScan } from '@/hooks/useScan'
import { useOnboardingGuard } from '@/hooks/useOnboardingGuard'
import { CameraView } from '@/components/CameraView'
import { ScanGuide } from '@/components/ScanGuide'
import { ScanOverlay } from '@/components/ScanOverlay'
import { ResultCard } from '@/components/ResultCard'

export default function ScanPage() {
  useOnboardingGuard()
  const { scanState, error, result, storeCandidates, onStoreSelect, videoRef, startScan, reset, zoomLevel, setZoom, supportsHardwareZoom, facingMode, toggleFacingMode } = useScan()

  useEffect(() => {
    void startScan()
  }, [startScan])

  return (
    <div className="relative flex flex-col w-full max-w-[480px] mx-auto h-[calc(100vh-56px)] overflow-hidden bg-black">
      <CameraView
          videoRef={videoRef}
          zoomLevel={zoomLevel}
          supportsHardwareZoom={supportsHardwareZoom}
          onZoomChange={setZoom}
          facingMode={facingMode}
          onToggleFacingMode={toggleFacingMode}
        />
      <ScanOverlay state={scanState} />
      <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
        <ScanGuide state={scanState} error={error ?? undefined} />
      </div>
      {scanState === 'result' && result !== null && (
        <ResultCard result={result} onClose={reset} storeCandidates={storeCandidates} onStoreSelect={onStoreSelect} />
      )}
    </div>
  )
}
