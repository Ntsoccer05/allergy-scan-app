'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AppLayout } from '@/components/templates/AppLayout'
import { LoadingOverlay } from '@/components/atoms/LoadingOverlay'
import { useScan } from '@/hooks/useScan'
import { useOnboardingGuard } from '@/hooks/useOnboardingGuard'
import { ResultCard } from '@/components/organisms/ResultCard'

export default function ScanPage() {
  useOnboardingGuard()
  const t = useTranslations('scan')

  const {
    scanState,
    error,
    result,
    previewDataUrl,
    storeCandidates,
    onStoreSelect,
    videoRef,
    startScan,
    stopScan,
    reset,
    handleCapture,
    confirmAndScan,
    facingMode,
    toggleFacingMode,
  } = useScan()

  // 初回マウント時にカメラを起動し、アンマウント時に停止する
  useEffect(() => {
    void startScan()
    return () => stopScan()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // プレビュー画面
  if (scanState === 'preview' && previewDataUrl) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center gap-4 p-4">
          <h2 className="font-bold">{t('preview.title')}</h2>
          <img src={previewDataUrl} alt="preview" className="max-w-sm rounded-lg shadow" />
          <div className="flex gap-4">
            <button
              onClick={reset}
              className="rounded-lg border px-6 py-3 text-sm font-medium hover:bg-accent"
            >
              {t('preview.retake')}
            </button>
            <button
              onClick={() => { void confirmAndScan() }}
              className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
            >
              {t('preview.confirm')}
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  // 結果画面
  if (scanState === 'result' && result !== null) {
    return (
      <AppLayout>
        <div className="relative h-[calc(100dvh-4rem)] lg:h-screen">
          <ResultCard
            result={result}
            onClose={reset}
            storeCandidates={storeCandidates}
            onStoreSelect={onStoreSelect}
          />
        </div>
      </AppLayout>
    )
  }

  // カメラ画面（idle / processing / error）
  return (
    <AppLayout>
      <LoadingOverlay isOpen={scanState === 'processing'} message={t('processing')} />

      <div className="relative flex h-[calc(100dvh-4rem)] flex-col lg:h-screen">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
          aria-label={t('camera.videoLabel')}
        />

        <div className="absolute inset-0 flex flex-col justify-between p-4">
          <div className="flex items-center justify-end">
            {/* カメラ切り替えボタン（モバイルのみ表示） */}
            <button
              onClick={toggleFacingMode}
              aria-label={t('camera.switchCamera')}
              className="rounded-full bg-black/40 p-2 text-white lg:hidden"
            >
              🔄
            </button>
          </div>

          {error && (
            <div className="mx-auto rounded-lg bg-black/60 px-4 py-2 text-sm text-white">
              {t(`error.${error}`)}
            </div>
          )}

          <div className="flex flex-col items-center gap-3 pb-8">
            {/* タップ撮影ボタン */}
            <button
              onClick={handleCapture}
              disabled={scanState === 'processing'}
              aria-label={t('capture')}
              className="h-20 w-20 rounded-full border-4 border-white bg-white/20 backdrop-blur-sm transition-opacity disabled:opacity-50"
            >
              <span className="text-2xl">📷</span>
            </button>
          </div>
        </div>
      </div>

      {/* ⚠️ 安全設計: 全判定で常時表示（省略禁止） */}
      <p className="p-2 text-center text-xs text-muted-foreground">
        {t('caution')}
      </p>
    </AppLayout>
  )
}
