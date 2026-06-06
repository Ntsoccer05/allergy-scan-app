'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { ScanError, ScanResult, ScanState, StoreCandidate } from '@/app/scan/scan.types'
import type { CreateHistoryBody } from '@/app/history/history.types'
import {
  FRAME_CHECK_INTERVAL_MS,
  GEO_TIMEOUT_MS,
  OCR_MAX_DIMENSION,
  OCR_JPEG_QUALITY,
} from '@/app/scan/scan.constants'
import type { OcrApiResponse, OcrStreamEvent } from '@/lib/api/scan.api'
import { preprocessFrame } from '@/lib/image-preprocess'
import { useBarcode } from './useBarcode'
import { useCamera } from './useCamera'
import { useScanApi } from './useScanApi'

export type Action =
  | { type: 'START_CAMERA' }
  | { type: 'PREVIEW'; imageDataUrl: string }
  | { type: 'PROCESSING' }
  | { type: 'RESULT'; payload: ScanResult }
  | { type: 'ERROR'; error: ScanError }
  | { type: 'RESET' }
  | { type: 'STORE_SELECTED' }

export type State = {
  scanState: ScanState
  error: ScanError | null
  result: ScanResult | null
  previewDataUrl: string | null
  storeCandidates: StoreCandidate[]
}

export const initialState: State = {
  scanState: 'idle',
  error: null,
  result: null,
  previewDataUrl: null,
  storeCandidates: [],
}

export const scanReducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'START_CAMERA':
      return { ...initialState, scanState: 'idle' }

    case 'PREVIEW':
      return { ...state, scanState: 'preview', previewDataUrl: action.imageDataUrl, error: null }

    case 'PROCESSING':
      return { ...state, scanState: 'processing', previewDataUrl: null }

    case 'RESULT': {
      const storeCandidates = action.payload.type === 'ocr' ? (action.payload.storeCandidates ?? []) : []
      return { ...state, scanState: 'result', result: action.payload, storeCandidates }
    }

    case 'ERROR':
      return { ...state, scanState: 'error', error: action.error }

    case 'STORE_SELECTED':
      return { ...state, storeCandidates: [] }

    case 'RESET':
      return initialState

    default:
      return state
  }
}

/** pointer: coarse = タッチスクリーン（モバイル）、それ以外 = PC */
const isPC = (): boolean =>
  typeof window !== 'undefined' && !window.matchMedia('(pointer: coarse)').matches

type UseScanReturn = {
  scanState: ScanState
  error: ScanError | null
  result: ScanResult | null
  storeCandidates: StoreCandidate[]
  videoRef: React.RefObject<HTMLVideoElement | null>
  startScan: () => Promise<void>
  stopScan: () => void
  reset: () => void
  /** タップ撮影: 現在フレームをキャプチャして即座に OCR フローに進む */
  handleCapture: () => void
  manualCapture: () => Promise<void>
  uploadAndScanImage: (file: File) => Promise<void>
  zoomLevel: number
  setZoom: (level: number) => void
  supportsHardwareZoom: boolean
  facingMode: 'environment' | 'user'
  toggleFacingMode: () => void
  onStoreSelect: (candidate: StoreCandidate | null) => void
}

/** ScanResult から POST /history のリクエストボディを構築する。 */
const buildHistoryBody = (result: ScanResult): CreateHistoryBody | null => {
  if (result.type === 'barcode') {
    const { data } = result
    if (!data.found || !data.judgment) return null
    return {
      product_name: data.product_name ?? undefined,
      judgment: data.judgment,
      detected: data.detected ?? [],
    }
  }

  if (result.type === 'low_confidence') return null

  if (result.type === 'ocr') {
    const { data } = result
    // results[] から overall judgment を導出する（優先順位: 含む > 一部含む > 判定不能 > なし）
    // results[] が空の場合は「アレルギー設定なし」と解釈して「なし」を返す
    const overallJudgment = (() => {
      const results = data.results
      if (results.length === 0) return 'なし' as const
      if (results.some((r) => r.judgment === '含む')) return '含む' as const
      if (results.some((r) => r.judgment === '一部含む')) return '一部含む' as const
      if (results.some((r) => r.judgment === '判定不能')) return '判定不能' as const
      return 'なし' as const
    })()
    // 判定不能は保存しない（安全設計: 不確実な判定を履歴に残さない）
    if (overallJudgment === '判定不能') return null
    const judgment: 'ng' | 'partial' | 'ok' =
      overallJudgment === '含む' ? 'ng' :
      overallJudgment === '一部含む' ? 'partial' :
      'ok'
    const allDetected = data.results.flatMap((r) => r.detected)
    return {
      judgment,
      detected: allDetected,
    }
  }

  return null
}

export const useScan = (): UseScanReturn => {
  const [state, dispatch] = useReducer(scanReducer, initialState)
  const { videoRef, captureFrame, startCamera, stopCamera, zoomLevel, setZoom, supportsHardwareZoom, facingMode, toggleFacingMode } = useCamera()
  const { detectFromImageData } = useBarcode()
  const { scanBarcodeWithCache, fetchPresignedUrl, putS3, scanOcrStream, saveHistory, patchLocation } =
    useScanApi()

  const intervalRef = useRef<number | null>(null)
  const isProcessingRef = useRef(false)
  const stateRef = useRef<ScanState>('idle')
  const geolocationRef = useRef<{ lat: number; lng: number } | null>(null)
  const scanHistoryIdRef = useRef<string | null>(null)

  // state.scanState を ref で同期して setInterval コールバックから参照できるようにする
  useEffect(() => {
    stateRef.current = state.scanState
  }, [state.scanState])

  const runOcrFlow = useCallback(
    async (imageData: ImageData): Promise<void> => {
      dispatch({ type: 'PROCESSING' })
      try {
        // 元フレームを一旦フルサイズで Canvas に描画
        const srcCanvas = document.createElement('canvas')
        srcCanvas.width = imageData.width
        srcCanvas.height = imageData.height
        const srcCtx = srcCanvas.getContext('2d')
        if (!srcCtx) throw new Error('canvas context unavailable')
        srcCtx.putImageData(imageData, 0, 0)

        // OCR_MAX_DIMENSION を超える場合はリサイズ（Gemini 処理時間・S3 転送サイズ削減のため）
        const longEdge = Math.max(imageData.width, imageData.height)
        const scale = Math.min(1, OCR_MAX_DIMENSION / longEdge)
        const targetW = Math.round(imageData.width * scale)
        const targetH = Math.round(imageData.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = targetW
        canvas.height = targetH
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas context unavailable')
        ctx.drawImage(srcCanvas, 0, 0, targetW, targetH)

        // グレースケール・コントラスト強調・シャープニングを適用（反射・ぼけ対策）
        preprocessFrame(ctx, targetW, targetH)

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => {
            if (b) resolve(b)
            else reject(new Error('toBlob failed'))
          }, 'image/jpeg', OCR_JPEG_QUALITY)
        })

        const { url, s3_key } = await fetchPresignedUrl()
        await putS3(url, blob)

        const geo = geolocationRef.current
        const stream = scanOcrStream({
          s3Key: s3_key,
          lat: geo?.lat,
          lng: geo?.lng,
          allowLowConfidence: isPC(),
        })

        let ocrResult: OcrApiResponse | null = null
        let lowConfidenceRawText: string | null = null

        for await (const event of stream as AsyncGenerator<OcrStreamEvent>) {
          if (event.type === 'raw_text') {
            // raw_text イベントは現在表示しない（プレビューフローでは不要）
          } else if (event.type === 'confidence_low') {
            lowConfidenceRawText = event.raw_text
          } else if (event.type === 'error') {
            if (event.code === 'INCOMPLETE_IMAGE') {
              dispatch({ type: 'ERROR', error: 'incomplete' })
              return
            }
            throw new Error(event.message)
          } else if (event.type === 'result') {
            ocrResult = event.data
          }
        }

        if (lowConfidenceRawText !== null) {
          dispatch({ type: 'RESULT', payload: { type: 'low_confidence', raw_text: lowConfidenceRawText } })
          return
        }

        if (!ocrResult) {
          dispatch({ type: 'ERROR', error: 'api_error' })
          return
        }

        const { storeCandidates, ...ocrData } = ocrResult
        const scanResult: ScanResult = {
          type: 'ocr',
          data: ocrData,
          storeCandidates,
        }
        dispatch({ type: 'RESULT', payload: scanResult })

        // スキャン完了後に履歴保存（saveHistory の失敗はスキャン状態に影響させない）
        const historyBody = buildHistoryBody(scanResult)
        if (historyBody) {
          const saved = await saveHistory(historyBody)
          if (saved) {
            scanHistoryIdRef.current = saved.id
          }
        }
      } catch {
        dispatch({ type: 'ERROR', error: 'api_error' })
      }
    },
    [fetchPresignedUrl, putS3, scanOcrStream, saveHistory],
  )

  const tick = useCallback(async (): Promise<void> => {
    if (isProcessingRef.current) return
    if (stateRef.current !== 'idle') return

    const frame = captureFrame()
    if (!frame) return

    // バーコード検出を優先
    const janCode = await detectFromImageData(frame)
    if (janCode) {
      isProcessingRef.current = true
      dispatch({ type: 'PROCESSING' })
      try {
        const result = await scanBarcodeWithCache(janCode)
        if (result.found) {
          const scanResult: ScanResult = { type: 'barcode', data: result }
          dispatch({ type: 'RESULT', payload: scanResult })

          // スキャン完了後に履歴保存（saveHistory の失敗はスキャン状態に影響させない）
          const historyBody = buildHistoryBody(scanResult)
          if (historyBody) {
            void saveHistory(historyBody)
          }
        } else {
          // found:false → OCR フローに自動切り替え
          await runOcrFlow(frame)
        }
      } catch {
        dispatch({ type: 'ERROR', error: 'api_error' })
      } finally {
        isProcessingRef.current = false
      }
    }
  }, [
    captureFrame,
    detectFromImageData,
    scanBarcodeWithCache,
    runOcrFlow,
    saveHistory,
  ])

  const startScan = useCallback(async (): Promise<void> => {
    await startCamera()
    dispatch({ type: 'START_CAMERA' })
    isProcessingRef.current = false
    geolocationRef.current = null
    scanHistoryIdRef.current = null

    // GPS 座標を非同期で取得（ブロッキングなし。失敗しても lat/lng なしで OCR へ進む）
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          geolocationRef.current = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }
        },
        () => {
          // GPS 取得失敗（権限拒否・タイムアウト等）は無視してスキャンを継続する（R14）
        },
        { timeout: GEO_TIMEOUT_MS },
      )
    }

    intervalRef.current = window.setInterval(() => {
      void tick()
    }, FRAME_CHECK_INTERVAL_MS)
  }, [startCamera, tick])

  const stopScan = useCallback((): void => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    stopCamera()
    isProcessingRef.current = false
  }, [stopCamera])

  const reset = useCallback((): void => {
    stopScan()
    dispatch({ type: 'RESET' })
  }, [stopScan])

  /** 品質チェックをスキップして現在フレームを即時OCR送信する（PC・手動操作用） */
  const manualCapture = useCallback(async (): Promise<void> => {
    if (isProcessingRef.current) return
    if (stateRef.current !== 'idle') return
    const frame = captureFrame()
    if (!frame) return
    isProcessingRef.current = true
    await runOcrFlow(frame).finally(() => {
      isProcessingRef.current = false
    })
  }, [captureFrame, runOcrFlow])

  /**
   * タップ撮影: 現在フレームをキャプチャして即座に OCR フローに進む。
   * idle 状態でのみ有効。確認画面なし。
   */
  const handleCapture = useCallback((): void => {
    if (isProcessingRef.current) return
    if (stateRef.current !== 'idle') return
    const frame = captureFrame()
    if (!frame) return
    isProcessingRef.current = true
    void runOcrFlow(frame).finally(() => {
      isProcessingRef.current = false
    })
  }, [captureFrame, runOcrFlow])

  /**
   * ギャラリー / ファイルシステムから選択した画像を OCR 解析する。
   * File → createImageBitmap → Canvas → ImageData に変換して runOcrFlow に渡す。
   */
  const uploadAndScanImage = useCallback(
    async (file: File): Promise<void> => {
      if (isProcessingRef.current) return
      isProcessingRef.current = true
      dispatch({ type: 'PROCESSING' })
      try {
        const bitmap = await createImageBitmap(file)
        const longEdge = Math.max(bitmap.width, bitmap.height)
        const scale = Math.min(1, OCR_MAX_DIMENSION / longEdge)
        const targetW = Math.round(bitmap.width * scale)
        const targetH = Math.round(bitmap.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = targetW
        canvas.height = targetH
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas context unavailable')
        ctx.drawImage(bitmap, 0, 0, targetW, targetH)
        const imageData = ctx.getImageData(0, 0, targetW, targetH)
        await runOcrFlow(imageData)
      } catch {
        dispatch({ type: 'ERROR', error: 'api_error' })
      } finally {
        isProcessingRef.current = false
      }
    },
    [runOcrFlow],
  )

  const onStoreSelect = useCallback(
    (candidate: StoreCandidate | null): void => {
      dispatch({ type: 'STORE_SELECTED' })
      const historyId = scanHistoryIdRef.current
      const geo = geolocationRef.current
      if (candidate && historyId && geo) {
        void patchLocation(historyId, {
          store_name: candidate.name,
          lat: geo.lat,
          lng: geo.lng,
        })
      }
    },
    [patchLocation],
  )

  // アンマウント時にクリーンアップ
  useEffect(() => {
    return () => {
      stopScan()
    }
  }, [stopScan])

  return {
    scanState: state.scanState,
    error: state.error,
    result: state.result,
    storeCandidates: state.storeCandidates,
    videoRef,
    startScan,
    stopScan,
    reset,
    handleCapture,
    manualCapture,
    uploadAndScanImage,
    zoomLevel,
    setZoom,
    supportsHardwareZoom,
    facingMode,
    toggleFacingMode,
    onStoreSelect,
  }
}
