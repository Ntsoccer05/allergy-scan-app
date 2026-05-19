'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type {
  BarcodeScanResponse,
  OcrScanResponse,
  PresignedUrlResponse,
} from '@/app/scan/scan.types'
import type { CreateHistoryBody } from '@/app/history/history.types'
import {
  getPresignedUrl,
  postBarcode,
  postOcr,
  uploadToS3,
} from '@/lib/api/scan.api'
import { postHistory } from '@/lib/api/history.api'
import { getCached, setCached } from '@/lib/cache'

type UseScanApiReturn = {
  scanBarcode: (janCode: string) => Promise<BarcodeScanResponse>
  fetchPresignedUrl: () => Promise<PresignedUrlResponse>
  putS3: (url: string, imageBlob: Blob) => Promise<void>
  scanOcr: (s3Key: string) => Promise<OcrScanResponse>
  scanBarcodeWithCache: (janCode: string) => Promise<BarcodeScanResponse>
  saveHistory: (body: CreateHistoryBody) => Promise<void>
}

export const useScanApi = (): UseScanApiReturn => {
  const queryClient = useQueryClient()

  const scanBarcodeWithCache = useCallback(
    async (janCode: string): Promise<BarcodeScanResponse> => {
      const cacheKey = `jan:${janCode}`
      const cached = getCached<BarcodeScanResponse>(cacheKey)
      if (cached) return { ...cached, from_cache: true }

      const result = await postBarcode(janCode)
      if (result.found) {
        setCached(cacheKey, result)
      }
      return result
    },
    [],
  )

  const scanBarcode = useCallback(
    async (janCode: string): Promise<BarcodeScanResponse> => {
      return postBarcode(janCode)
    },
    [],
  )

  const fetchPresignedUrl = useCallback(
    async (): Promise<PresignedUrlResponse> => {
      return getPresignedUrl()
    },
    [],
  )

  const putS3 = useCallback(
    async (url: string, imageBlob: Blob): Promise<void> => {
      return uploadToS3(url, imageBlob)
    },
    [],
  )

  const scanOcr = useCallback(
    async (s3Key: string): Promise<OcrScanResponse> => {
      return postOcr(s3Key)
    },
    [],
  )

  const saveHistory = useCallback(
    async (body: CreateHistoryBody): Promise<void> => {
      try {
        await postHistory(body)
        await queryClient.invalidateQueries({ queryKey: ['history'] })
      } catch (e) {
        console.error('履歴保存に失敗しました', e)
      }
    },
    [queryClient],
  )

  return { scanBarcode, scanBarcodeWithCache, fetchPresignedUrl, putS3, scanOcr, saveHistory }
}
