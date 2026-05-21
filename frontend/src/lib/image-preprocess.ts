/**
 * OCR 精度向上のための画像前処理ユーティリティ。
 * グレースケール → コントラスト強調 → シャープニングの順で適用する。
 *
 * 用途: 透明袋の反射・映り込み除去、斜め撮影・手ブレのぼけ補正。
 * Gemini Vision はカラー情報よりも輝度・エッジを主に使うため
 * グレースケール化が精度劣化なくノイズ除去できる。
 */

const CONTRAST_FACTOR = 1.4
const CONTRAST_INTERCEPT = 128 * (1 - CONTRAST_FACTOR)
// 3×3 ラプラシアン系シャープニングカーネル
const SHARPEN_KERNEL = [0, -1, 0, -1, 5, -1, 0, -1, 0] as const

/** ImageData をグレースケール + コントラスト強調する（インプレース）。 */
const toGrayContrast = (data: Uint8ClampedArray): void => {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    const boosted = Math.min(255, Math.max(0, Math.round(gray * CONTRAST_FACTOR + CONTRAST_INTERCEPT)))
    data[i] = boosted
    data[i + 1] = boosted
    data[i + 2] = boosted
    // alpha は変更しない
  }
}

/** グレースケール済み ImageData に 3×3 シャープニングカーネルを適用する。 */
const applySharpening = (src: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray => {
  const dst = new Uint8ClampedArray(src)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const kidx = ((y + ky) * width + (x + kx)) * 4
          const kval = SHARPEN_KERNEL[(ky + 1) * 3 + (kx + 1)]!
          sum += src[kidx]! * kval
        }
      }
      const val = Math.min(255, Math.max(0, sum))
      const idx = (y * width + x) * 4
      dst[idx] = val
      dst[idx + 1] = val
      dst[idx + 2] = val
      dst[idx + 3] = src[idx + 3]!
    }
  }
  return dst
}

/**
 * canvas に描画済みのフレームにグレースケール・コントラスト強調・シャープニングを適用する。
 * OCR 送信直前に呼ぶこと。
 */
export const preprocessFrame = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void => {
  const imageData = ctx.getImageData(0, 0, width, height)
  toGrayContrast(imageData.data)
  const sharpened = applySharpening(imageData.data, width, height)
  imageData.data.set(sharpened)
  ctx.putImageData(imageData, 0, 0)
}
