'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { ScanError, ScanResult, ScanState } from '@/app/scan/scan.types'
import type { CreateHistoryBody } from '@/app/history/history.types'
import {
  CONSECUTIVE_FRAMES_REQUIRED,
  FRAME_CHECK_INTERVAL_MS,
} from '@/app/scan/scan.constants'
import { useBarcode } from './useBarcode'
import { useCamera } from './useCamera'
import { useFrameCheck } from './useFrameCheck'
import { useScanApi } from './useScanApi'

export type Action =
  | { type: 'START_CAMERA' }
  | { type: 'STABLE' }
  | { type: 'PROCESSING' }
  | { type: 'RESULT'; payload: ScanResult }
  | { type: 'ERROR'; error: ScanError }
  | { type: 'RESET' }

export type State = {
  scanState: ScanState
  error: ScanError | null
  result: ScanResult | null
}

export const initialState: State = {
  scanState: 'idle',
  error: null,
  result: null,
}

export const scanReducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'START_CAMERA':
      return { ...state, scanState: 'detecting', error: null, result: null }

    case 'STABLE':
      if (state.scanState !== 'detecting') return state
      return { ...state, scanState: 'stable' }

    case 'PROCESSING':
      return { ...state, scanState: 'processing' }

    case 'RESULT':
      return { ...state, scanState: 'result', result: action.payload }

    case 'ERROR': {
      if (action.error === 'api_error') {
        // api_error → idle（ユーザー操作が必要なため自動リトライしない）
        return { ...state, scanState: 'idle', error: action.error }
      }
      // dark / blur / motion / incomplete / confidence_low → detecting 継続
      return { ...state, scanState: 'detecting', error: action.error }
    }

    case 'RESET':
      return initialState

    default:
      return state
  }
}

type UseScanReturn = {
  scanState: ScanState
  error: ScanError | null
  result: ScanResult | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  startScan: () => Promise<void>
  stopScan: () => void
  reset: () => void
  zoomLevel: number
  setZoom: (level: number) => void
  supportsHardwareZoom: boolean
  facingMode: 'environment' | 'user'
  toggleFacingMode: () => void
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

  if (result.type === 'ocr') {
    const { data } = result
    // results[] から overall judgment を導出する（優先順位: 含む > 一部含む > 判定不能 > なし）
    // results[] が空の場合は「アレルゲン設定なし」と解釈して「なし」を返す
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
  const { isQualityOk } = useFrameCheck()
  const { scanBarcodeWithCache, fetchPresignedUrl, putS3, scanOcr, saveHistory } =
    useScanApi()

  const consecutiveOkRef = useRef(0)
  const prevFrameRef = useRef<ImageData | null>(null)
  const intervalRef = useRef<number | null>(null)
  const isProcessingRef = useRef(false)
  const stateRef = useRef<ScanState>('idle')

  // state.scanState を ref で同期して setInterval コールバックから参照できるようにする
  useEffect(() => {
    stateRef.current = state.scanState
  }, [state.scanState])

  const runOcrFlow = useCallback(
    async (imageData: ImageData): Promise<void> => {
      dispatch({ type: 'PROCESSING' })
      try {
        const canvas = document.createElement('canvas')
        canvas.width = imageData.width
        canvas.height = imageData.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas context unavailable')
        ctx.putImageData(imageData, 0, 0)

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => {
            if (b) resolve(b)
            else reject(new Error('toBlob failed'))
          }, 'image/jpeg')
        })

        const { url, s3_key } = await fetchPresignedUrl()
        await putS3(url, blob)
        const ocrResult = await scanOcr(s3_key)

        // incomplete: true → detecting 継続（安全設計: 部分的な判定をしない）
        if (ocrResult.incomplete) {
          dispatch({ type: 'ERROR', error: 'incomplete' })
          return
        }

        const scanResult: ScanResult = { type: 'ocr', data: ocrResult }
        dispatch({ type: 'RESULT', payload: scanResult })

        // スキャン完了後に履歴保存（saveHistory の失敗はスキャン状態に影響させない）
        const historyBody = buildHistoryBody(scanResult)
        if (historyBody) {
          void saveHistory(historyBody)
        }
      } catch (err) {
        // HTTP 422（confidence: low）は再スキャン誘導（detecting 継続）
        if (err instanceof Error && err.message.includes('422')) {
          dispatch({ type: 'ERROR', error: 'confidence_low' })
        } else {
          dispatch({ type: 'ERROR', error: 'api_error' })
        }
      }
    },
    [fetchPresignedUrl, putS3, scanOcr, saveHistory],
  )

  const tick = useCallback(async (): Promise<void> => {
    if (isProcessingRef.current) return
    if (stateRef.current !== 'detecting' && stateRef.current !== 'stable') return

    const frame = captureFrame()
    if (!frame) return

    // バーコード検出を優先
    if (stateRef.current === 'detecting') {
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
        return
      }
    }

    // フレーム品質チェック
    const { ok, reasons } = isQualityOk(frame, prevFrameRef.current)
    prevFrameRef.current = frame

    if (ok) {
      consecutiveOkRef.current++
      if (consecutiveOkRef.current >= CONSECUTIVE_FRAMES_REQUIRED) {
        consecutiveOkRef.current = 0
        dispatch({ type: 'STABLE' })

        // stable になったら直ちに OCR フロー
        if (stateRef.current === 'stable' || stateRef.current === 'detecting') {
          isProcessingRef.current = true
          await runOcrFlow(frame).finally(() => {
            isProcessingRef.current = false
          })
        }
      }
    } else {
      consecutiveOkRef.current = 0
      const primaryReason = reasons[0]
      if (primaryReason) {
        dispatch({ type: 'ERROR', error: primaryReason })
      }
    }
  }, [
    captureFrame,
    detectFromImageData,
    isQualityOk,
    scanBarcodeWithCache,
    runOcrFlow,
    saveHistory,
  ])

  const startScan = useCallback(async (): Promise<void> => {
    await startCamera()
    dispatch({ type: 'START_CAMERA' })
    consecutiveOkRef.current = 0
    prevFrameRef.current = null
    isProcessingRef.current = false

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
    videoRef,
    startScan,
    stopScan,
    reset,
    zoomLevel,
    setZoom,
    supportsHardwareZoom,
    facingMode,
    toggleFacingMode,
  }
}
