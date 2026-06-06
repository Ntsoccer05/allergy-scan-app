'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AppLayout } from '@/components/templates/AppLayout'
import { LoadingOverlay } from '@/components/atoms/LoadingOverlay'
import { ScanLimitBadge } from '@/components/molecules/ScanLimitBadge'
import { useScan } from '@/hooks/useScan'
import { useOnboardingGuard } from '@/hooks/useOnboardingGuard'
import { useAuthContext } from '@/providers/AuthProvider'
import { ResultCard } from '@/components/organisms/ResultCard'
import { useScanUsage } from '@/hooks/useScanUsage'

export default function ScanPage() {
  useOnboardingGuard()
  const t = useTranslations('scan')
  const { user } = useAuthContext()
  const { scanUsage, refreshScanUsage } = useScanUsage(user?.id)

  const {
    scanState,
    error,
    result,
    storeCandidates,
    capturedImageUrl,
    onStoreSelect,
    videoRef,
    startScan,
    stopScan,
    reset,
    handleCapture,
    toggleFacingMode,
    uploadAndScanImage,
  } = useScan()

  // 初回マウント時にカメラを起動し、アンマウント時に停止する
  useEffect(() => {
    void startScan()
    return () => stopScan()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // スキャン完了後にカウントを再取得する
  useEffect(() => {
    if (scanState === 'result') refreshScanUsage()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanState])

  // 結果画面
  if (scanState === 'result' && result !== null) {
    return (
      <AppLayout>
        <div className="relative h-[calc(100dvh-4rem)] lg:h-screen">
          {/* スキャン画像をカメラフレームと同じ位置に全面表示 */}
          {capturedImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={capturedImageUrl}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gray-900" />
          )}
          <ResultCard
            result={result}
            onReset={reset}
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
          <div className="flex items-center justify-between">
            {/* スキャン使用量バッジ */}
            {scanUsage !== null && (
              <ScanLimitBadge used={scanUsage.used} limit={scanUsage.limit} />
            )}
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

          {/* 下部: 注意文 + 撮影ボタン + アップロードボタン */}
          <div className="flex flex-col items-center gap-3 pb-4">
            {/* ⚠️ 安全設計: オーバーレイ内に配置して常時視認可能にする（省略禁止） */}
            <p className="rounded-lg bg-black/50 px-3 py-1.5 text-center text-xs text-white backdrop-blur-sm">
              {t('caution')}
            </p>
            <div className="flex items-center gap-6">
              {/* タップ撮影ボタン */}
              <button
                onClick={handleCapture}
                disabled={scanState === 'processing'}
                aria-label={t('capture')}
                className="h-20 w-20 rounded-full border-4 border-white bg-white/20 backdrop-blur-sm transition-opacity disabled:opacity-50"
              >
                <span className="text-2xl">📷</span>
              </button>
              {/* ファイルアップロードボタン */}
              <label
                aria-label={t('camera.uploadButton')}
                className={`flex flex-col items-center gap-1 cursor-pointer rounded-2xl bg-black/40 px-4 py-3 text-white backdrop-blur-sm transition-opacity
                  ${scanState === 'processing' ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <span className="text-2xl">🖼️</span>
                <span className="text-xs font-medium">{t('camera.uploadButton')}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={scanState === 'processing'}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void uploadAndScanImage(file)
                    // 同じファイルを再選択できるようにリセット
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
