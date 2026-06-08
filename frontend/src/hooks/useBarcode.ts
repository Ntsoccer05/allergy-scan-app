'use client'

import { useCallback, useRef } from 'react'

// BarcodeDetector はブラウザ標準APIだが TypeScript 型定義が未整備のため宣言
interface BarcodeDetectorResult {
  rawValue: string
  format: string
}
interface BarcodeDetectorAPI {
  detect(source: ImageBitmapSource): Promise<BarcodeDetectorResult[]>
}
declare const BarcodeDetector: {
  new (options?: { formats?: string[] }): BarcodeDetectorAPI
  getSupportedFormats?: () => Promise<string[]>
}

const JAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code']

type UseBarcodeReturn = {
  detectFromImageData: (imageData: ImageData) => Promise<string | null>
}

export const useBarcode = (): UseBarcodeReturn => {
  const nativeDetectorRef = useRef<BarcodeDetectorAPI | null | false>(null)

  // ZXing のインスタンスはフレームごとに再生成しないようにメモ化する
  const readerRef = useRef<{ decode: (bitmap: unknown) => { getText: () => string } } | null>(null)
  const classesRef = useRef<{
    RGBLuminanceSource: new (data: Uint8ClampedArray, w: number, h: number) => unknown
    HybridBinarizer: new (source: unknown) => unknown
    BinaryBitmap: new (binarizer: unknown) => unknown
  } | null>(null)

  const loadNativeDetector = useCallback(async (): Promise<BarcodeDetectorAPI | false> => {
    if (nativeDetectorRef.current !== null) return nativeDetectorRef.current
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
      nativeDetectorRef.current = false
      return false
    }
    try {
      const detector = new BarcodeDetector({ formats: JAN_FORMATS })
      nativeDetectorRef.current = detector
      return detector
    } catch {
      nativeDetectorRef.current = false
      return false
    }
  }, [])

  const loadZxing = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false
    if (readerRef.current) return true

    try {
      const {
        MultiFormatReader,
        RGBLuminanceSource,
        HybridBinarizer,
        BinaryBitmap,
      } = await import('@zxing/library')

      readerRef.current = new MultiFormatReader() as {
        decode: (bitmap: unknown) => { getText: () => string }
      }
      classesRef.current = {
        RGBLuminanceSource: RGBLuminanceSource as new (
          data: Uint8ClampedArray,
          w: number,
          h: number,
        ) => unknown,
        HybridBinarizer: HybridBinarizer as new (source: unknown) => unknown,
        BinaryBitmap: BinaryBitmap as new (binarizer: unknown) => unknown,
      }
      return true
    } catch {
      return false
    }
  }, [])

  const detectFromImageData = useCallback(
    async (imageData: ImageData): Promise<string | null> => {
      if (typeof window === 'undefined') return null

      // --- Primary: BarcodeDetector Web API (ML Kit on Android / Vision on iOS) ---
      // 全方向のバーコードを公式サポート（0°/90°/180°/270°）
      const detector = await loadNativeDetector()
      if (detector) {
        try {
          const bitmap = await createImageBitmap(imageData)
          const results = await detector.detect(bitmap)
          bitmap.close()
          if (results.length > 0) return results[0]!.rawValue
          return null
        } catch {
          // BarcodeDetector が予期せず失敗した場合は ZXing にフォールバック
        }
      }

      // --- Fallback: ZXing.js ---
      const loaded = await loadZxing()
      if (!loaded || !readerRef.current || !classesRef.current) return null

      try {
        const { RGBLuminanceSource, HybridBinarizer, BinaryBitmap } =
          classesRef.current
        const source = new RGBLuminanceSource(
          imageData.data,
          imageData.width,
          imageData.height,
        )
        const binarizer = new HybridBinarizer(source)
        const bitmap = new BinaryBitmap(binarizer)
        const result = readerRef.current.decode(bitmap)
        return result.getText()
      } catch {
        // バーコード未検出は正常ケース。null を返してエラー扱いにしない
        return null
      }
    },
    [loadNativeDetector, loadZxing],
  )

  return { detectFromImageData }
}
