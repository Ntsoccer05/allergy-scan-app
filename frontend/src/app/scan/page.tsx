'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LoadingOverlay } from '@/components/atoms/LoadingOverlay'
import { ScanLimitBadge } from '@/components/molecules/ScanLimitBadge'
import { useScan } from '@/hooks/useScan'
import { useOnboardingGuard } from '@/hooks/useOnboardingGuard'
import { useAuthContext } from '@/providers/AuthProvider'
import { ResultCard } from '@/components/organisms/ResultCard'
import { ThumbnailCameraModal } from '@/components/organisms/ThumbnailCameraModal'
import { useScanUsage } from '@/hooks/useScanUsage'
import { ScanJobChip } from '@/components/molecules/ScanJobChip'
import { ResultCardQueue } from '@/components/organisms/ResultCardQueue'
import { TodayScansSheet } from '@/components/organisms/TodayScansSheet'
import { useTodayScans, updateTodayScanItem } from '@/hooks/useScanQueue'
import { patchHistory } from '@/lib/api/history.api'

export default function ScanPage() {
  useOnboardingGuard()
  const t = useTranslations('scan')
  const { user } = useAuthContext()
  const { scanUsage, refreshScanUsage } = useScanUsage(user?.id)
  const [showThumbnailCamera, setShowThumbnailCamera] = useState(false)
  const [showTodaySheet, setShowTodaySheet] = useState(false)
  const [showFileLimitWarning, setShowFileLimitWarning] = useState(false)

  // 画像ズーム用 state / refs（タッチ: ピンチ、PC: ホイール＋ドラッグ）
  const [imgScale, setImgScale] = useState(1)
  const [imgTranslate, setImgTranslate] = useState({ x: 0, y: 0 })
  const pinchRef = useRef<{ initDist: number; initScale: number } | null>(null)
  const singleDragRef = useRef<{ startX: number; startY: number; initTx: number; initTy: number } | null>(null)
  const lastTapRef = useRef(0)
  // imgScaleRef: ホイールハンドラー内での stale closure 回避
  const imgScaleRef = useRef(1)
  const imgTranslateRef = useRef({ x: 0, y: 0 })
  // 非パッシブ wheel リスナー用 img 要素参照
  const imgRef = useRef<HTMLImageElement | null>(null)

  const {
    scanState,
    error,
    result,
    capturedImageUrl,
    thumbnailUrl,
    geolocation,
    setThumbnailUrl,
    fetchPlaceCandidates,
    registerLocation,
    onPatchHistory,
    videoRef,
    startScan,
    stopScan,
    reset,
    handleCapture,
    toggleFacingMode,
    uploadAndScanImage,
    queueFileForScan,
    discardResult,
    scanQueue,
  } = useScan()

  const { activeJobs, doneJobs, jobs, dismissJob, isAtCapacity } = scanQueue
  const isLimitExceeded = scanUsage !== null && scanUsage.used >= scanUsage.limit
  const todayScans = useTodayScans(doneJobs.length, showTodaySheet)

  // セッション内のジョブから撮影画像（blob URL）を付与する（localStorage には保存できないためここでマージ）
  const todayScansWithImages = todayScans.map((item) => ({
    ...item,
    capturedImageUrl: jobs.find((j) => j.id === item.id)?.capturedImageUrl ?? null,
  }))

  // 初回マウント時にカメラを起動し、アンマウント時に停止する
  useEffect(() => {
    void startScan()
    return () => stopScan()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // スキャン完了後にカウントを再取得し、ズームをリセットする
  useEffect(() => {
    if (scanState === 'result') {
      refreshScanUsage()
      setImgScale(1)
      setImgTranslate({ x: 0, y: 0 })
      imgScaleRef.current = 1
      imgTranslateRef.current = { x: 0, y: 0 }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanState])

  // useScanQueue の完了ジョブが増えるたびにスキャン使用量を再取得する
  useEffect(() => {
    if (doneJobs.length > 0) refreshScanUsage()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneJobs.length])

  // imgScaleRef / imgTranslateRef を state と同期（非パッシブホイールハンドラーから参照するため）
  useEffect(() => { imgScaleRef.current = imgScale }, [imgScale])
  useEffect(() => { imgTranslateRef.current = imgTranslate }, [imgTranslate])

  // PC: マウスホイールで拡大縮小。React の onWheel はパッシブなため非パッシブで直接登録する
  useEffect(() => {
    const img = imgRef.current
    if (!img || scanState !== 'result') return
    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.12 : 0.9
      const newScale = Math.max(1, Math.min(5, imgScaleRef.current * factor))
      imgScaleRef.current = newScale
      setImgScale(newScale)
      if (newScale <= 1) {
        imgTranslateRef.current = { x: 0, y: 0 }
        setImgTranslate({ x: 0, y: 0 })
      }
    }
    img.addEventListener('wheel', handleWheel, { passive: false })
    return () => img.removeEventListener('wheel', handleWheel)
  }, [scanState])

  // PC: ドラッグでパン（ズーム中のみ有効）
  const handleImgMouseDown = (e: React.MouseEvent<HTMLImageElement>): void => {
    if (imgScale <= 1) return
    e.preventDefault()
    singleDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initTx: imgTranslate.x,
      initTy: imgTranslate.y,
    }
  }

  const handleImgMouseMove = (e: React.MouseEvent<HTMLImageElement>): void => {
    if (!singleDragRef.current) return
    setImgTranslate({
      x: singleDragRef.current.initTx + (e.clientX - singleDragRef.current.startX),
      y: singleDragRef.current.initTy + (e.clientY - singleDragRef.current.startY),
    })
  }

  const handleImgMouseUpOrLeave = (): void => {
    singleDragRef.current = null
  }

  // PC: ダブルクリックでズームリセット
  const handleImgDoubleClick = (): void => {
    setImgScale(1)
    setImgTranslate({ x: 0, y: 0 })
  }

  const getTouchDist = (touches: React.TouchList): number => {
    const dx = touches[1].clientX - touches[0].clientX
    const dy = touches[1].clientY - touches[0].clientY
    return Math.hypot(dx, dy)
  }

  const handleImgTouchStart = (e: React.TouchEvent<HTMLImageElement>): void => {
    if (e.touches.length === 2) {
      pinchRef.current = { initDist: getTouchDist(e.touches), initScale: imgScale }
      singleDragRef.current = null
    } else if (e.touches.length === 1) {
      if (imgScale > 1) {
        singleDragRef.current = {
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          initTx: imgTranslate.x,
          initTy: imgTranslate.y,
        }
      }
      // ダブルタップでリセット
      const now = Date.now()
      if (now - lastTapRef.current < 300) {
        setImgScale(1)
        setImgTranslate({ x: 0, y: 0 })
      }
      lastTapRef.current = now
    }
  }

  const handleImgTouchMove = (e: React.TouchEvent<HTMLImageElement>): void => {
    if (e.touches.length === 2 && pinchRef.current) {
      const newDist = getTouchDist(e.touches)
      const newScale = Math.max(1, Math.min(5, pinchRef.current.initScale * (newDist / pinchRef.current.initDist)))
      setImgScale(newScale)
      if (newScale <= 1) setImgTranslate({ x: 0, y: 0 })
    } else if (e.touches.length === 1 && singleDragRef.current && imgScale > 1) {
      setImgTranslate({
        x: singleDragRef.current.initTx + (e.touches[0].clientX - singleDragRef.current.startX),
        y: singleDragRef.current.initTy + (e.touches[0].clientY - singleDragRef.current.startY),
      })
    }
  }

  const handleImgTouchEnd = (): void => {
    pinchRef.current = null
    singleDragRef.current = null
  }

  // 結果画面
  if (scanState === 'result' && result !== null) {
    return (
      <div className="relative h-[calc(100dvh-4rem)] lg:h-screen">
        {/* スキャン画像をカメラフレームと同じ位置に全面表示 */}
        {capturedImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={capturedImageUrl}
            alt=""
            aria-hidden="true"
            onTouchStart={handleImgTouchStart}
            onTouchMove={handleImgTouchMove}
            onTouchEnd={handleImgTouchEnd}
            onMouseDown={handleImgMouseDown}
            onMouseMove={handleImgMouseMove}
            onMouseUp={handleImgMouseUpOrLeave}
            onMouseLeave={handleImgMouseUpOrLeave}
            onDoubleClick={handleImgDoubleClick}
            className="h-full w-full object-cover select-none"
            style={{
              touchAction: 'none',
              cursor: imgScale > 1 ? (singleDragRef.current ? 'grabbing' : 'grab') : 'default',
              transform: imgScale > 1
                ? `scale(${imgScale}) translate(${imgTranslate.x / imgScale}px, ${imgTranslate.y / imgScale}px)`
                : undefined,
              transformOrigin: 'center center',
            }}
          />
        ) : (
          <div className="h-full w-full bg-gray-900" />
        )}
        <ResultCard
          result={result}
          onReset={() => { reset(); void startScan() }}
          onDiscard={() => { discardResult(); void startScan() }}
          geolocation={geolocation}
          onFetchPlaceCandidates={fetchPlaceCandidates}
          onRegisterLocation={registerLocation}
          onPatchHistory={onPatchHistory}
          onRetakeThumbnail={() => setShowThumbnailCamera(true)}
          thumbnailUrl={thumbnailUrl}
        />
        {showThumbnailCamera && (
          <ThumbnailCameraModal
            onCapture={(s3Url, localDataUrl) => {
              onPatchHistory({ thumbnail_url: s3Url })
              setThumbnailUrl(localDataUrl)
              setShowThumbnailCamera(false)
            }}
            onClose={() => setShowThumbnailCamera(false)}
          />
        )}
      </div>
    )
  }

  // カメラ画面（idle / processing / error）
  return (
    <>
      <LoadingOverlay
        isOpen={scanState === 'processing'}
        message={t('processing')}
        subtitle={t('camera.processingSubtitle')}
      />

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
            {/* 左: スキャン使用量バッジ + 今日のスキャンバッジ */}
            <div className="flex items-center gap-2">
              {scanUsage !== null && (
                <ScanLimitBadge used={scanUsage.used} limit={scanUsage.limit} />
              )}
              {todayScans.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowTodaySheet(true)}
                  className="rounded-full bg-black/40 px-3 py-1 text-xs text-white backdrop-blur-sm"
                >
                  {t('today.button', { count: todayScans.length })}
                </button>
              )}
            </div>
            {/* カメラ切り替えボタン（モバイルのみ表示） */}
            <button
              onClick={toggleFacingMode}
              aria-label={t('camera.switchCamera')}
              className="rounded-full bg-black/40 p-2 text-white lg:hidden"
            >
              🔄
            </button>
          </div>

          {showFileLimitWarning ? (
            <div className="mx-auto rounded-xl bg-amber-500/90 px-5 py-3 text-center backdrop-blur-sm">
              <p className="text-sm font-bold text-white">
                {t('fileLimit.exceeded', { max: scanQueue.MAX_CONCURRENT_JOBS })}
              </p>
            </div>
          ) : isLimitExceeded ? (
            <div className="mx-auto rounded-xl bg-red-600/90 px-5 py-3 text-center backdrop-blur-sm">
              <p className="text-sm font-bold text-white">{t('limitExceeded.title')}</p>
              <p className="mt-0.5 text-xs text-red-100">{t('limitExceeded.message')}</p>
            </div>
          ) : error ? (
            <div className="mx-auto rounded-lg bg-black/60 px-4 py-2 text-sm text-white">
              {t(`error.${error}`)}
            </div>
          ) : null}

          {/* 中段: 進捗チップ（アップロード/解析中ジョブ）+ 商品から離していい案内 */}
          {activeJobs.length > 0 && (
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="flex gap-2 overflow-x-auto">
                {activeJobs.map((job) => (
                  <ScanJobChip
                    key={job.id}
                    job={job}
                    isActive={false}
                    onClick={() => {}}
                  />
                ))}
              </div>
              {/* ファイル選択時（processing）は LoadingOverlay が同じメッセージを出すため非表示 */}
              {scanState !== 'processing' && (
                <p className="rounded-lg bg-black/60 px-3 py-1.5 text-center text-xs text-white backdrop-blur-sm">
                  {t('camera.processingSubtitle')}
                </p>
              )}
            </div>
          )}

          {/* 下部: 注意文 + 撮影ボタン + アップロードボタン */}
          <div className="flex flex-col items-center gap-3 pb-4">
            {/* ⚠️ 安全設計: オーバーレイ内に配置して常時視認可能にする（省略禁止） */}
            <p className="rounded-lg bg-black/50 px-3 py-1.5 text-center text-sm md:text-base text-white backdrop-blur-sm font-medium">
              {t('caution')}
            </p>
            <div className="flex items-center gap-6">
              {/* タップ撮影ボタン */}
              <button
                onClick={handleCapture}
                disabled={scanState === 'processing' || isAtCapacity || isLimitExceeded}
                aria-label={t('capture')}
                className="flex flex-col items-center gap-1 rounded-2xl bg-black/40 px-4 py-3 text-white backdrop-blur-sm transition-opacity disabled:opacity-50"
              >
                <span className="text-2xl">📷</span>
                <span className="text-xs font-medium">{t('camera.cameraButton')}</span>
              </button>
              {/* ファイルアップロードボタン */}
              <label
                aria-label={t('camera.uploadButton')}
                className={`flex flex-col items-center gap-1 cursor-pointer rounded-2xl bg-black/40 px-4 py-3 text-white backdrop-blur-sm transition-opacity
                  ${isAtCapacity || isLimitExceeded ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <span className="text-2xl">🖼️</span>
                <span className="text-xs font-medium">{t('camera.uploadButton')}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  disabled={isAtCapacity || isLimitExceeded}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? [])
                    const slots = Math.max(0, scanQueue.MAX_CONCURRENT_JOBS - scanQueue.activeJobs.length)
                    if (files.length > slots) {
                      setShowFileLimitWarning(true)
                      setTimeout(() => setShowFileLimitWarning(false), 4000)
                    }
                    files.slice(0, slots).forEach((file) => {
                      void queueFileForScan(file)
                    })
                    // 同じファイルを再選択できるようにリセット
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          </div>
        </div>

        {/* 完了ジョブ結果タブ */}
        {doneJobs.length > 0 && (
          <ResultCardQueue
            doneJobs={doneJobs}
            allJobs={jobs}
            onDismiss={dismissJob}
            geolocation={geolocation}
            onFetchPlaceCandidates={fetchPlaceCandidates}
            onRegisterLocation={registerLocation}
            onPatchHistory={onPatchHistory}
          />
        )}
      </div>
      {/* 今日のスキャン一覧ボトムシート */}
      <TodayScansSheet
        items={todayScansWithImages}
        isOpen={showTodaySheet}
        onClose={() => setShowTodaySheet(false)}
        onTogglePublic={(itemId, historyId, isPublic) => {
          void patchHistory(historyId, { is_public: isPublic })
          updateTodayScanItem(itemId, { isPublic })
        }}
      />
    </>
  )
}
