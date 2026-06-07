'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useCamera } from '@/hooks/useCamera'
import { useScanApi } from '@/hooks/useScanApi'
import { generateThumbnail } from '@/lib/thumbnail'
import { getPublicUrlFromPresigned } from '@/lib/s3.utils'

type ThumbnailCameraModalState = 'camera' | 'preview' | 'uploading'

type Props = {
  onCapture: (thumbnailUrl: string) => void
  onClose: () => void
}

export const ThumbnailCameraModal = ({ onCapture, onClose }: Props) => {
  const t = useTranslations('history')
  const { videoRef, startCamera, stopCamera } = useCamera()
  const { fetchPresignedUrl, putS3 } = useScanApi()
  const [modalState, setModalState] = useState<ThumbnailCameraModalState>('camera')
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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    setCapturedDataUrl(dataUrl)
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
      const publicUrl = getPublicUrlFromPresigned(presigned)
      stopCamera()
      onCapture(publicUrl)
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
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      {/* カメラビュー */}
      {modalState === 'camera' && (
        <>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="flex-1 object-cover w-full"
          />
          <div className="flex items-center justify-around px-8 py-6 bg-black">
            <button
              type="button"
              onClick={handleClose}
              className="text-white text-sm w-16 text-left"
            >
              {t('editModal.cancel')}
            </button>
            <button
              type="button"
              onClick={handleCapture}
              className="h-16 w-16 rounded-full bg-white border-4 border-gray-300 shrink-0"
              aria-label={t('editModal.retake')}
            />
            <div className="w-16" />
          </div>
        </>
      )}

      {/* プレビュー */}
      {(modalState === 'preview' || modalState === 'uploading') && capturedDataUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={capturedDataUrl}
            alt=""
            className="flex-1 object-cover w-full"
          />
          <div className="flex items-center justify-around px-8 py-6 bg-black">
            <button
              type="button"
              onClick={handleRetake}
              disabled={modalState === 'uploading'}
              className="text-white text-sm disabled:opacity-50"
            >
              {t('editModal.retakeCapture')}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={modalState === 'uploading'}
              className="px-6 py-2 rounded-full bg-white text-black text-sm font-medium disabled:opacity-50"
            >
              {modalState === 'uploading' ? t('loading') : t('editModal.confirm')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
