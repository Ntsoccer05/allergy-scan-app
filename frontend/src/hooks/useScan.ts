'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { ScanError, ScanResult, ScanState } from '@/app/scan/scan.types'
import type { CreateHistoryBody } from '@/app/history/history.types'
import {
  FRAME_CHECK_INTERVAL_MS,
  GEO_TIMEOUT_MS,
  MAX_UPLOAD_SIZE_BYTES,
  OCR_MAX_DIMENSION,
  OCR_JPEG_QUALITY,
  USE_OCR_AS_THUMBNAIL,
} from '@/app/scan/scan.constants'
import type { OcrApiResponse, OcrStreamEvent } from '@/lib/api/scan.api'
import type { PlaceCandidatesResponse } from '@/lib/api/places.api'
import { getPublicUrlFromPresigned } from '@/lib/s3.utils'
import { generateThumbnail } from '@/lib/thumbnail'
import { preprocessFrame } from '@/lib/image-preprocess'
import { useBarcode } from './useBarcode'
import { useCamera } from './useCamera'
import { useScanApi } from './useScanApi'
import { useScanQueue, saveTodayScanFromDirectOcr } from './useScanQueue'

export type Action =
  | { type: 'START_CAMERA' }
  | { type: 'PREVIEW'; imageDataUrl: string }
  | { type: 'PROCESSING'; capturedImageUrl?: string }
  | { type: 'RESULT'; payload: ScanResult }
  | { type: 'ERROR'; error: ScanError }
  | { type: 'RESET' }
  | { type: 'SET_THUMBNAIL_URL'; url: string | null }

export type State = {
  scanState: ScanState
  error: ScanError | null
  result: ScanResult | null
  previewDataUrl: string | null
  capturedImageUrl: string | null
  thumbnailUrl: string | null
}

export const initialState: State = {
  scanState: 'idle',
  error: null,
  result: null,
  previewDataUrl: null,
  capturedImageUrl: null,
  thumbnailUrl: null,
}

export const scanReducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'START_CAMERA':
      return { ...initialState, scanState: 'idle' }

    case 'PREVIEW':
      return { ...state, scanState: 'preview', previewDataUrl: action.imageDataUrl, error: null }

    case 'PROCESSING':
      return {
        ...state,
        scanState: 'processing',
        previewDataUrl: null,
        capturedImageUrl: action.capturedImageUrl !== undefined ? action.capturedImageUrl : state.capturedImageUrl,
      }

    case 'RESULT':
      return { ...state, scanState: 'result', result: action.payload }

    case 'ERROR':
      return { ...state, scanState: 'error', error: action.error }

    case 'SET_THUMBNAIL_URL':
      return { ...state, thumbnailUrl: action.url }

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
  capturedImageUrl: string | null
  thumbnailUrl: string | null
  /** スキャン開始時に取得した GPS 座標（取得失敗・未取得時は null） */
  geolocation: { lat: number; lng: number } | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  setThumbnailUrl: (url: string | null) => void
  startScan: () => Promise<void>
  stopScan: () => void
  reset: () => void
  /** タップ撮影: 現在フレームをキャプチャして即座に OCR フローに進む */
  handleCapture: () => void
  manualCapture: () => Promise<void>
  uploadAndScanImage: (file: File) => Promise<void>
  /** ファイルをキューに積む（変換は addJob 内で実施・複数ファイル選択用） */
  queueFileForScan: (file: File) => void
  zoomLevel: number
  setZoom: (level: number) => void
  supportsHardwareZoom: boolean
  facingMode: 'environment' | 'user'
  toggleFacingMode: () => void
  /** 現在地の住所・施設候補を取得する（「場所を登録」ボタン用。GPS 未取得・失敗時は null） */
  fetchPlaceCandidates: (query?: string) => Promise<PlaceCandidatesResponse | null>
  /** 選択した場所をスキャン履歴の location に登録する（place_id は施設選択時のみ、address は逆ジオコーディング住所、storeLat/storeLng は店舗座標） */
  registerLocation: (storeName: string, placeId?: string, address?: string, storeLat?: number, storeLng?: number) => void
  /**
   * 商品名未入力でキャンセルする際にスキャン履歴を削除してリセットする。
   * バックエンドが自動保存した履歴エントリを破棄する。
   */
  discardResult: () => void
  onPatchHistory: (data: { product_name?: string | null; store_name?: string | null; memo?: string | null; thumbnail_url?: string | null }) => void
  scanQueue: ReturnType<typeof useScanQueue>
}

/** ScanResult から POST /history のリクエストボディを構築する。 */
const buildHistoryBody = (result: ScanResult): CreateHistoryBody | null => {
  if (result.type === 'barcode') {
    const { data } = result
    if (!data.found || !data.judgment) return null
    return {
      product_id: data.product_id ?? undefined,
      product_name: data.product_name ?? undefined,
      judgment: data.judgment,
      detected: data.detected ?? [],
      raw_text: data.raw_text ?? undefined,
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
      raw_text: data.raw_text || undefined,
    }
  }

  return null
}

export const useScan = (): UseScanReturn => {
  const [state, dispatch] = useReducer(scanReducer, initialState)
  const { videoRef, captureFrame, startCamera, stopCamera, zoomLevel, setZoom, supportsHardwareZoom, facingMode, toggleFacingMode } = useCamera()
  const scanQueue = useScanQueue()
  const { detectFromImageData } = useBarcode()
  const { scanBarcodeWithCache, fetchPresignedUrl, putS3, scanOcrStream, saveHistory, patchLocation, patchHistoryFields, fetchPlaceCandidates: fetchPlaceCandidatesApi, deleteHistoryEntry } =
    useScanApi()

  const intervalRef = useRef<number | null>(null)
  const isProcessingRef = useRef(false)
  const stateRef = useRef<ScanState>('idle')
  const geolocationRef = useRef<{ lat: number; lng: number } | null>(null)
  const scanHistoryIdRef = useRef<string | null>(null)
  // ref と並行して state でも保持する（「場所を登録」ボタンの有効/無効を GPS 取得完了時に再描画させるため）
  const [geolocation, setGeolocation] = useState<{ lat: number; lng: number } | null>(null)

  // state.scanState を ref で同期して setInterval コールバックから参照できるようにする
  useEffect(() => {
    stateRef.current = state.scanState
  }, [state.scanState])

  const runOcrFlow = useCallback(
    async (imageData: ImageData, janCode?: string): Promise<void> => {
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

        // OCR前処理適用前のオリジナルカラー画像を保持する（サムネイル用）
        const originalColorDataUrl = canvas.toDataURL('image/jpeg', OCR_JPEG_QUALITY)

        // グレースケール・コントラスト強調・シャープニングを適用（反射・ぼけ対策）
        preprocessFrame(ctx, targetW, targetH)

        // 結果表示用にスキャン画像を保持する（前処理後の状態）
        const capturedImageUrl = canvas.toDataURL('image/jpeg', OCR_JPEG_QUALITY)
        dispatch({ type: 'PROCESSING', capturedImageUrl })

        // オリジナルカラー画像をサムネイルとして即座にセット（S3 URL は DB 保存のみ使用）
        // ⚠️ RESULT dispatch 前にセットして結果画面に即表示させる
        dispatch({ type: 'SET_THUMBNAIL_URL', url: originalColorDataUrl })

        // Branch B: サムネイルアップロード（USE_OCR_AS_THUMBNAIL=true のときはスキップ）
        // USE_OCR_AS_THUMBNAIL=false に戻せば 300px サムネイル専用アップロードに戻る
        const thumbnailUrlPromise: Promise<string | null> = USE_OCR_AS_THUMBNAIL
          ? Promise.resolve(null)
          : (async () => {
              try {
                const thumbBlob = await generateThumbnail(originalColorDataUrl)
                const { url: thumbPresigned } = await fetchPresignedUrl()
                await putS3(thumbPresigned, thumbBlob)
                return getPublicUrlFromPresigned(thumbPresigned)
              } catch {
                return null
              }
            })()

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => {
            if (b) resolve(b)
            else reject(new Error('toBlob failed'))
          }, 'image/jpeg', OCR_JPEG_QUALITY)
        })

        if (blob.size > MAX_UPLOAD_SIZE_BYTES) {
          dispatch({ type: 'ERROR', error: 'api_error' })
          return
        }

        const { url, s3_key } = await fetchPresignedUrl()
        await putS3(url, blob)
        const ocrPublicUrl = getPublicUrlFromPresigned(url)

        const geo = geolocationRef.current
        const stream = scanOcrStream({
          s3Key: s3_key,
          lat: geo?.lat,
          lng: geo?.lng,
          allowLowConfidence: isPC(),
          // バーコード検出済みなら OCR 結果を JAN キャッシュとして保存させる（00310）
          janCode,
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
              void thumbnailUrlPromise  // fire-and-forget; result discarded on incomplete scan
              dispatch({ type: 'ERROR', error: 'incomplete' })
              return
            }
            throw new Error(event.message)
          } else if (event.type === 'result') {
            ocrResult = event.data
          }
        }

        if (lowConfidenceRawText !== null) {
          void thumbnailUrlPromise  // fire-and-forget; result discarded on low_confidence
          dispatch({ type: 'RESULT', payload: { type: 'low_confidence', raw_text: lowConfidenceRawText } })
          return
        }

        if (!ocrResult) {
          dispatch({ type: 'ERROR', error: 'api_error' })
          return
        }

        const scanResult: ScanResult = {
          type: 'ocr',
          data: ocrResult,
        }
        dispatch({ type: 'RESULT', payload: scanResult })

        // 今日のスキャン一覧（localStorage）に追加する。
        // キューパス（handleCapture）は useScanQueue.addJob が担当するが、
        // 直接スキャンパス（manualCapture / uploadAndScanImage）はここで保存する。
        void saveTodayScanFromDirectOcr(ocrResult, originalColorDataUrl)

        // バックエンドが履歴を作成済みのため history_id を使用する。
        // 未認証の場合（history_id なし）はフォールバックとして POST /history で保存する。
        const historyIdFromBackend = ocrResult.history_id
        if (historyIdFromBackend) {
          scanHistoryIdRef.current = historyIdFromBackend
          // S3 アップロード完了後に thumbnail_url / ocr_image_url をパッチ（失敗は無視）
          const thumbnailUrl = await thumbnailUrlPromise
          void patchHistoryFields(historyIdFromBackend, {
            thumbnail_url: USE_OCR_AS_THUMBNAIL ? ocrPublicUrl : (thumbnailUrl ?? undefined),
            ocr_image_url: ocrPublicUrl,
          })
        } else {
          // 未認証ユーザー: フォールバックとして POST /history で保存
          const historyBody = buildHistoryBody(scanResult)
          if (historyBody) {
            const thumbnailUrl = await thumbnailUrlPromise
            const saved = await saveHistory({
              ...historyBody,
              thumbnail_url: USE_OCR_AS_THUMBNAIL ? ocrPublicUrl : (thumbnailUrl ?? undefined),
              ocr_image_url: ocrPublicUrl,
            })
            if (saved) {
              scanHistoryIdRef.current = saved.id
            }
          }
        }
      } catch {
        dispatch({ type: 'ERROR', error: 'api_error' })
      }
    },
    [fetchPresignedUrl, putS3, scanOcrStream, saveHistory, patchHistoryFields],
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
    setGeolocation(null)
    scanHistoryIdRef.current = null

    // GPS 座標を非同期で取得（ブロッキングなし。失敗しても lat/lng なしで OCR へ進む）
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const geo = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }
          geolocationRef.current = geo
          setGeolocation(geo)
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

  /**
   * フレームからバーコードを検出し、可能ならバーコード判定 → ダメなら OCR にフォールバックする。
   * JAN が検出できたが商品未登録（found: false）の場合は、OCR に JAN を引き継いで
   * 結果を JAN キャッシュとして保存させる（00310: 次回以降は Gemini 不要になる）。
   */
  const runScanFlow = useCallback(
    async (frame: ImageData): Promise<void> => {
      const janCode = await detectFromImageData(frame)
      if (janCode) {
        dispatch({ type: 'PROCESSING' })
        try {
          const result = await scanBarcodeWithCache(janCode)
          if (result.found) {
            const scanResult: ScanResult = { type: 'barcode', data: result }
            dispatch({ type: 'RESULT', payload: scanResult })
            const historyBody = buildHistoryBody(scanResult)
            if (historyBody) {
              void saveHistory(historyBody)
            }
            return
          }
        } catch {
          // バーコード照合の失敗は OCR フォールバックに進む（エラーで止めない）
        }
        await runOcrFlow(frame, janCode)
        return
      }
      await runOcrFlow(frame)
    },
    [detectFromImageData, scanBarcodeWithCache, runOcrFlow, saveHistory],
  )

  /** 品質チェックをスキップして現在フレームを即時スキャンする（PC・手動操作用） */
  const manualCapture = useCallback(async (): Promise<void> => {
    if (isProcessingRef.current) return
    if (stateRef.current !== 'idle') return
    const frame = captureFrame()
    if (!frame) return
    isProcessingRef.current = true
    await runScanFlow(frame).finally(() => {
      isProcessingRef.current = false
    })
  }, [captureFrame, runScanFlow])

  /**
   * タップ撮影: 現在フレームをキャプチャして useScanQueue 経由でジョブとして投入する。
   * processing 状態または並列上限到達時は無効。確認画面なし。
   */
  const handleCapture = useCallback((): void => {
    if (stateRef.current === 'processing') return
    if (scanQueue.isAtCapacity) return

    const imageData = captureFrame()
    if (!imageData) return

    const canvas = document.createElement('canvas')
    canvas.width = imageData.width
    canvas.height = imageData.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(imageData, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const capturedImageUrl = URL.createObjectURL(blob)
      void scanQueue.addJob(blob, capturedImageUrl)
    }, 'image/jpeg', OCR_JPEG_QUALITY)
  }, [captureFrame, scanQueue])

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
        await runScanFlow(imageData)
      } catch {
        dispatch({ type: 'ERROR', error: 'api_error' })
      } finally {
        isProcessingRef.current = false
      }
    },
    [runScanFlow],
  )

  /**
   * ファイルをスキャンキューに積む。
   * 変換（リサイズ・JPEG 化）は addJob 内で行うため、File を直接渡して即座にローディングを表示する。
   */
  const queueFileForScan = useCallback(
    (file: File): void => {
      const capturedImageUrl = URL.createObjectURL(file)
      void scanQueue.addJob(file, capturedImageUrl)
    },
    [scanQueue],
  )

  /**
   * 現在地の住所・施設候補を取得する（「場所を登録」操作時のみ呼ぶ — 00320）。
   * Places API はコール課金のためスキャン毎の自動呼び出しは行わない。
   */
  const fetchPlaceCandidates = useCallback(
    async (query?: string): Promise<PlaceCandidatesResponse | null> => {
      const geo = geolocationRef.current
      if (!geo) return null
      return fetchPlaceCandidatesApi(geo.lat, geo.lng, query)
    },
    [fetchPlaceCandidatesApi],
  )

  /** 選択した場所を履歴の location に登録する。storeLat/storeLng が渡された場合は店舗座標を使用し、なければユーザーの現在地にフォールバックする。 */
  const registerLocation = useCallback(
    (storeName: string, placeId?: string, address?: string, storeLat?: number, storeLng?: number): void => {
      const historyId = scanHistoryIdRef.current
      const geo = geolocationRef.current
      if (!historyId) return
      const lat = storeLat ?? geo?.lat
      const lng = storeLng ?? geo?.lng
      if (lat === undefined || lng === undefined) return
      void patchLocation(historyId, {
        store_name: storeName,
        lat,
        lng,
        ...(address !== undefined ? { address } : {}),
        ...(placeId !== undefined ? { place_id: placeId } : {}),
      })
    },
    [patchLocation],
  )

  const setThumbnailUrl = useCallback((url: string | null) => {
    dispatch({ type: 'SET_THUMBNAIL_URL', url })
  }, [])

  /**
   * 商品名未入力でキャンセル時: バックエンドが自動保存した履歴エントリを削除してリセットする。
   * OCR は結果返却時にバックエンドが history_id を生成するため、キャンセル時はここで削除する。
   */
  const discardResult = useCallback((): void => {
    const historyId = scanHistoryIdRef.current
    if (historyId) {
      void deleteHistoryEntry(historyId)
    }
    stopScan()
    dispatch({ type: 'RESET' })
  }, [deleteHistoryEntry, stopScan])

  const onPatchHistory = useCallback(
    (data: { product_name?: string | null; store_name?: string | null; memo?: string | null; thumbnail_url?: string | null }): void => {
      const historyId = scanHistoryIdRef.current
      if (!historyId) return
      void patchHistoryFields(historyId, data)
    },
    [patchHistoryFields],
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
    capturedImageUrl: state.capturedImageUrl,
    thumbnailUrl: state.thumbnailUrl,
    geolocation,
    videoRef,
    setThumbnailUrl,
    startScan,
    stopScan,
    reset,
    handleCapture,
    manualCapture,
    uploadAndScanImage,
    queueFileForScan,
    zoomLevel,
    setZoom,
    supportsHardwareZoom,
    facingMode,
    toggleFacingMode,
    fetchPlaceCandidates,
    registerLocation,
    onPatchHistory,
    discardResult,
    scanQueue,
  }
}
