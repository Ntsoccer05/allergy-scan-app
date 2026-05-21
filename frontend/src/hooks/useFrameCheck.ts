'use client'

import { useCallback, useRef } from 'react'
import { THRESHOLDS_BY_DEVICE, getDeviceType } from '@/app/scan/scan.constants'

type Thresholds = { brightness: number; blur: number; motion: number }

/** 平均輝度が閾値以上かチェック */
export const checkBrightness = (imageData: ImageData, min: number): boolean => {
  const data = imageData.data
  let sum = 0
  const pixelCount = imageData.width * imageData.height
  for (let i = 0; i < data.length; i += 4) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3
  }
  return sum / pixelCount >= min
}

/** フレーム間の差分（モーションブレ）が閾値未満かチェック */
export const checkMotion = (
  current: ImageData,
  previous: ImageData,
  max: number,
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
  return diffSum / pixelCount < max
}

/** エッジシャープネス（ぼやけ）チェック: Laplacian フィルタで輝度変化量を計算 */
export const checkBlur = (imageData: ImageData, min: number): boolean => {
  const data = imageData.data
  const width = imageData.width
  const height = imageData.height
  let variance = 0
  let count = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3

      const top = ((y - 1) * width + x) * 4
      const bottom = ((y + 1) * width + x) * 4
      const left = (y * width + (x - 1)) * 4
      const right = (y * width + (x + 1)) * 4

      const grayTop = (data[top] + data[top + 1] + data[top + 2]) / 3
      const grayBottom = (data[bottom] + data[bottom + 1] + data[bottom + 2]) / 3
      const grayLeft = (data[left] + data[left + 1] + data[left + 2]) / 3
      const grayRight = (data[right] + data[right + 1] + data[right + 2]) / 3

      const laplacian = Math.abs(4 * gray - grayTop - grayBottom - grayLeft - grayRight)
      variance += laplacian
      count++
    }
  }

  const avgVariance = count > 0 ? variance / count : 0
  return avgVariance >= min
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
  deviceType: string
}

export const useFrameCheck = (): UseFrameCheckReturn => {
  // マウント時に一度だけデバイス種別を判定し、以降はその閾値を使い続ける
  const thresholdsRef = useRef<Thresholds>(THRESHOLDS_BY_DEVICE[getDeviceType()])
  const deviceTypeRef = useRef(getDeviceType())

  const isQualityOk = useCallback(
    (frame: ImageData, prevFrame: ImageData | null): FrameCheckResult => {
      const t = thresholdsRef.current
      const reasons: Array<'dark' | 'blur' | 'motion'> = []

      if (!checkBrightness(frame, t.brightness)) reasons.push('dark')
      if (!checkBlur(frame, t.blur)) reasons.push('blur')
      if (prevFrame && !checkMotion(frame, prevFrame, t.motion)) reasons.push('motion')

      return { ok: reasons.length === 0, reasons }
    },
    [],
  )

  return { isQualityOk, deviceType: deviceTypeRef.current }
}
