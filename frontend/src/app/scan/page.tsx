'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useScan } from '@/hooks/useScan'
import { useOnboardingGuard } from '@/hooks/useOnboardingGuard'
import { CameraView } from '@/components/CameraView'
import { ScanGuide } from '@/components/ScanGuide'
import { ScanOverlay } from '@/components/ScanOverlay'
import { ResultCard } from '@/components/ResultCard'
import { GUIDE_MESSAGES } from '@/app/scan/scan.constants'

type ScanTab = 'camera' | 'upload'

export default function ScanPage() {
  useOnboardingGuard()
  const tTabs = useTranslations('tabs')
  const tCamera = useTranslations('camera')
  const {
    scanState, error, result, storeCandidates, onStoreSelect,
    videoRef, startScan, stopScan, reset, manualCapture, uploadAndScanImage,
    zoomLevel, setZoom, supportsHardwareZoom, facingMode, toggleFacingMode,
  } = useScan()

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState<ScanTab>('camera')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // 初回マウント時のみカメラを起動する（依存配列のサイズを一定に保つ）
  useEffect(() => {
    void startScan()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startScan])

  const handleTabChange = useCallback((tab: ScanTab) => {
    if (tab === activeTab) return
    setActiveTab(tab)
    if (tab === 'upload') {
      stopScan()
    } else {
      void startScan()
    }
  }, [activeTab, stopScan, startScan])

  // 「もう一度スキャンする」: reset で状態をリセットし、タブはそのまま継続
  const handleScanAgain = useCallback(() => {
    reset()
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    if (activeTab === 'camera') {
      void startScan()
    }
  }, [reset, startScan, activeTab])

  const showManualButton = scanState === 'idle'

  return (
    <div className="relative flex flex-col w-full max-w-120 lg:max-w-none mx-auto h-[calc(100vh-56px)] lg:h-screen overflow-hidden bg-black">

      {/* タブバー: 上部に固定 */}
      <div className="flex gap-2 border-b border-gray-700 bg-black/80 z-20 flex-shrink-0">
        {(['camera', 'upload'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => handleTabChange(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-blue-400 text-blue-300'
                : 'border-transparent text-gray-400'
            }`}
          >
            {tTabs(tab)}
          </button>
        ))}
      </div>

      {/* カメラタブのコンテンツ */}
      {activeTab === 'camera' && (
        <>
          <CameraView
            videoRef={videoRef}
            zoomLevel={zoomLevel}
            supportsHardwareZoom={supportsHardwareZoom}
            onZoomChange={setZoom}
            facingMode={facingMode}
            onToggleFacingMode={toggleFacingMode}
          />
          <ScanOverlay state={scanState} />

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
        </>
      )}

      {/* 画像タブのコンテンツ */}
      {activeTab === 'upload' && scanState !== 'result' && (
        <div className="relative flex-1 flex flex-col overflow-hidden">
          {/* アップロードした画像のプレビュー */}
          {previewUrl && (
            <img
              src={previewUrl}
              alt="preview"
              className="absolute inset-0 w-full h-full object-contain"
            />
          )}

          {/* processing 中は ScanOverlay を重ねて表示 */}
          {scanState === 'processing' && (
            <ScanOverlay state="processing" />
          )}

          {/* processing でないとき: ヒントとボタン */}
          {scanState !== 'processing' && (
            <div className="absolute inset-0 flex flex-col items-center justify-end gap-4 pb-8 px-8">
              {!previewUrl && (
                <p className="text-gray-300 text-sm text-center">{tTabs('uploadHint')}</p>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-8 py-4 rounded-full bg-blue-600 text-white text-base font-semibold shadow-lg active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {tCamera('uploadButton')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ResultCard は両タブで共通 */}
      {scanState === 'result' && result !== null && (
        <ResultCard result={result} onClose={handleScanAgain} storeCandidates={storeCandidates} onStoreSelect={onStoreSelect} />
      )}

      {/* hidden file input: 画像タブ用。capture 属性なし（ギャラリー選択を許可するため） */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            setPreviewUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev)
              return URL.createObjectURL(file)
            })
            void uploadAndScanImage(file)
          }
          // 同じファイルを再選択できるようにリセット
          e.target.value = ''
        }}
      />
    </div>
  )
}
