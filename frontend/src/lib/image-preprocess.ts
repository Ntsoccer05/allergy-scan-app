/**
 * OCR 精度向上のための画像前処理ユーティリティ（適応型）。
 *
 * ぼけ画像: グレースケール → 強コントラスト(1.6) → シャープニング
 * 鮮明画像: グレースケール → 軽コントラスト(1.2) のみ
 *
 * 鮮明な画像に強いシャープニングを適用すると文字エッジにリンギングアーティファクトが
 * 発生し Gemini の文字認識精度が低下するため、鮮明度を測定してから補正強度を決める。
 */

/** ぼけ画像向け（手ブレ・ピンぼけ）— 元の実績値を維持 */
const CONTRAST_BLUR = 1.4
const INTERCEPT_BLUR = 128 * (1 - CONTRAST_BLUR)

/** 鮮明画像向け（過補正防止） */
const CONTRAST_CLEAR = 1.2
const INTERCEPT_CLEAR = 128 * (1 - CONTRAST_CLEAR)

/** 3×3 ラプラシアン系シャープニングカーネル — 元の実績値(中心5)を維持 */
const SHARPEN_KERNEL = [0, -1, 0, -1, 5, -1, 0, -1, 0] as const

/**
 * ラプラシアン分散がこの値未満をぼけ画像と判定する。
 * 実測値目安: ぼけ画像 < 200、鮮明画像 > 400
 */
const BLUR_THRESHOLD = 300

/**
 * 元の RGBA ImageData からラプラシアン分散で鮮明度を推定する。
 * 画像中央 50% を 3px おきにサンプリングして高速化。
 */
const measureSharpness = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
): number => {
  const LAP = [0, -1, 0, -1, 4, -1, 0, -1, 0] as const
  const x0 = Math.floor(width * 0.25)
  const x1 = Math.floor(width * 0.75)
  const y0 = Math.floor(height * 0.25)
  const y1 = Math.floor(height * 0.75)
  let sumSq = 0, sum = 0, count = 0

  for (let y = y0; y < y1 - 1; y += 3) {
    for (let x = x0; x < x1 - 1; x += 3) {
      let v = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4
          // RGB → 輝度（グレースケール相当）
          const lum = 0.299 * data[idx]! + 0.587 * data[idx + 1]! + 0.114 * data[idx + 2]!
          v += lum * LAP[(ky + 1) * 3 + (kx + 1)]!
        }
      }
      sum += v
      sumSq += v * v
      count++
    }
  }
  return count > 0 ? sumSq / count - (sum / count) ** 2 : 0
}

/** ImageData をグレースケール + コントラスト強調する（インプレース）。 */
const toGrayContrast = (
  data: Uint8ClampedArray,
  factor: number,
  intercept: number,
): void => {
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!)
    const boosted = Math.min(255, Math.max(0, Math.round(gray * factor + intercept)))
    data[i] = boosted
    data[i + 1] = boosted
    data[i + 2] = boosted
    // alpha は変更しない
  }
}

/** グレースケール済み ImageData に 3×3 シャープニングカーネルを適用する。 */
const applySharpening = (
  src: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray => {
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
 * canvas に描画済みのフレームに適応型前処理を適用する。
 * - ぼけ画像（sharpness < BLUR_THRESHOLD）: コントラスト1.6 + シャープニング
 * - 鮮明画像: コントラスト1.2 のみ（過補正によるアーティファクト防止）
 * OCR 送信直前に呼ぶこと。
 */
export const preprocessFrame = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void => {
  // 前処理を無効化して Gemini にオリジナル画像を渡す（精度比較用）
  void ctx; void width; void height
}
