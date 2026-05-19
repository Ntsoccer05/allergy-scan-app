'use client'

import { useCallback } from 'react'
import { THRESHOLDS } from '@/app/scan/scan.constants'

/** 平均輝度が閾値以上かチェック */
export const checkBrightness = (imageData: ImageData): boolean => {
  const data = imageData.data
  let sum = 0
  const pixelCount = imageData.width * imageData.height
  for (let i = 0; i < data.length; i += 4) {
    // RGBA の R+G+B の平均で輝度を近似
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3
  }
  return sum / pixelCount >= THRESHOLDS.brightness
}

/** フレーム間の差分（モーションブレ）が閾値未満かチェック */
export const checkMotion = (
  current: ImageData,
  previous: ImageData,
): boolean => {
  if (
    current.width !== previous.width ||
    current.height !== previous.height
  ) {
    return true
  }
  const data1 = current.data
  const data2 = previous.data
  let diffSum = 0
  const pixelCount = current.width * current.height
  for (let i = 0; i < data1.length; i += 4) {
    diffSum +=
      (Math.abs(data1[i] - data2[i]) +
        Math.abs(data1[i + 1] - data2[i + 1]) +
        Math.abs(data1[i + 2] - data2[i + 2])) /
      3
  }
  return diffSum / pixelCount < THRESHOLDS.motion
}

/** エッジシャープネス（ぼやけ）チェック */
export const checkBlur = (imageData: ImageData): boolean => {
  const data = imageData.data
  const width = imageData.width
  const height = imageData.height
  let variance = 0
  let count = 0

  // Laplacian フィルタで輝度の変化量を計算
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4
      const gray =
        (data[idx] + data[idx + 1] + data[idx + 2]) / 3

      const top = ((y - 1) * width + x) * 4
      const bottom = ((y + 1) * width + x) * 4
      const left = (y * width + (x - 1)) * 4
      const right = (y * width + (x + 1)) * 4

      const grayTop = (data[top] + data[top + 1] + data[top + 2]) / 3
      const grayBottom =
        (data[bottom] + data[bottom + 1] + data[bottom + 2]) / 3
      const grayLeft = (data[left] + data[left + 1] + data[left + 2]) / 3
      const grayRight =
        (data[right] + data[right + 1] + data[right + 2]) / 3

      const laplacian = Math.abs(
        4 * gray - grayTop - grayBottom - grayLeft - grayRight,
      )
      variance += laplacian
      count++
    }
  }

  const avgVariance = count > 0 ? variance / count : 0
  return avgVariance >= THRESHOLDS.blur
}

/** テキスト領域検出（輝度コントラストで近似） */
export const checkSharpness = (imageData: ImageData): boolean => {
  // blur チェックと同様のシャープネス指標を流用
  return checkBlur(imageData)
}

type FrameCheckResult = {
  ok: boolean
  reasons: Array<'dark' | 'blur' | 'motion'>
}

type UseFrameCheckReturn = {
  isQualityOk: (
    frame: ImageData,
    prevFrame: ImageData | null,
  ) => FrameCheckResult
}

export const useFrameCheck = (): UseFrameCheckReturn => {
  const isQualityOk = useCallback(
    (frame: ImageData, prevFrame: ImageData | null): FrameCheckResult => {
      const reasons: Array<'dark' | 'blur' | 'motion'> = []

      if (!checkBrightness(frame)) reasons.push('dark')
      if (!checkBlur(frame)) reasons.push('blur')
      if (prevFrame && !checkMotion(frame, prevFrame)) reasons.push('motion')

      return { ok: reasons.length === 0, reasons }
    },
    [],
  )

  return { isQualityOk }
}
