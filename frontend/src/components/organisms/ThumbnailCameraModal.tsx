'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useCamera } from '@/hooks/useCamera'
import { useScanApi } from '@/hooks/useScanApi'
import { generateThumbnail } from '@/lib/thumbnail'
import { getPublicUrlFromPresigned } from '@/lib/s3.utils'

type ModalState = 'camera' | 'preview' | 'uploading'

type Props = {
  onCapture: (s3Url: string, localDataUrl: string) => void
  onClose: () => void
}

export const ThumbnailCameraModal = ({ onCapture, onClose }: Props) => {
  const tScan = useTranslations('scan')
  const tHistory = useTranslations('history')
  const { videoRef, startCamera, stopCamera } = useCamera()
  const { fetchPresignedUrl, putS3 } = useScanApi()
  const [modalState, setModalState] = useState<ModalState>('camera')
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null)

  useEffect(() => {
    void startCamera()
    return () => {
      stopCamera()
    }
  }, [startCamera, stopCamera])

  const handleCapture = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    setCapturedDataUrl(canvas.toDataURL('image/jpeg', 0.9))
    setModalState('preview')
  }, [videoRef])

  const handleRetake = useCallback(() => {
    setCapturedDataUrl(null)
    setModalState('camera')
    void startCamera()
  }, [startCamera])

  const handleConfirm = useCallback(async () => {
    if (!capturedDataUrl) return
    setModalState('uploading')
    try {
      const thumbBlob = await generateThumbnail(capturedDataUrl)
      const { url: presigned } = await fetchPresignedUrl()
      await putS3(presigned, thumbBlob)
      stopCamera()
      onCapture(getPublicUrlFromPresigned(presigned), capturedDataUrl!)
    } catch {
      // アップロード失敗時はプレビューに戻してユーザーが再試行できるようにする
      setModalState('preview')
    }
  }, [capturedDataUrl, fetchPresignedUrl, putS3, stopCamera, onCapture])

  const handleClose = useCallback(() => {
    stopCamera()
    onClose()
  }, [stopCamera, onClose])

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-black">
      {/* フルスクリーン背景：カメラ映像 or プレビュー画像 */}
      {modalState === 'camera' ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
      ) : capturedDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={capturedDataUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : null}

      {/* オーバーレイUI（スキャンページと同じ構造） */}
      <div className="absolute inset-0 flex flex-col justify-between p-4">
        {/* 上部: キャンセル（右上に配置） */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-lg text-white backdrop-blur-sm"
            aria-label={tHistory('editModal.cancel')}
          >
            ✕
          </button>
        </div>

        {/* 下部: 撮影 / 撮り直す＋確定 */}
        <div className="flex flex-col items-center gap-3 pb-4">
          {modalState === 'camera' && (
            <button
              type="button"
              onClick={handleCapture}
              aria-label={tScan('capture')}
              className="flex flex-col items-center gap-1 rounded-2xl bg-black/40 px-4 py-3 text-white backdrop-blur-sm"
            >
              <span className="text-2xl">📷</span>
              <span className="text-xs font-medium">{tScan('camera.cameraButton')}</span>
            </button>
          )}

          {(modalState === 'preview' || modalState === 'uploading') && (
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={handleRetake}
                disabled={modalState === 'uploading'}
                className="rounded-2xl bg-black/40 px-4 py-3 text-sm text-white backdrop-blur-sm disabled:opacity-50 whitespace-nowrap"
              >
                {tHistory('editModal.retakeCapture')}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={modalState === 'uploading'}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-black disabled:opacity-50 whitespace-nowrap"
              >
                {modalState === 'uploading' ? tHistory('loading') : tHistory('editModal.confirm')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
