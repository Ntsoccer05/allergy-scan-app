'use client'

import { useCallback, useRef } from 'react'

type UseBarcodeReturn = {
  detectFromImageData: (imageData: ImageData) => Promise<string | null>
}

export const useBarcode = (): UseBarcodeReturn => {
  // ZXing のインスタンスはフレームごとに再生成しないようにメモ化する
  const readerRef = useRef<{ decode: (bitmap: unknown) => { getText: () => string } } | null>(null)
  const classesRef = useRef<{
    RGBLuminanceSource: new (data: Uint8ClampedArray, w: number, h: number) => unknown
    HybridBinarizer: new (source: unknown) => unknown
    BinaryBitmap: new (binarizer: unknown) => unknown
  } | null>(null)

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
    [loadZxing],
  )

  return { detectFromImageData }
}
