'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type {
  BarcodeScanResponse,
  PresignedUrlResponse,
} from '@/app/scan/scan.types'
import type { CreateHistoryBody, HistoryItem, PatchHistoryBody } from '@/app/history/history.types'
import {
  getPresignedUrl,
  postBarcode,
  postOcr,
  postOcrStream,
  uploadToS3,
  type OcrApiResponse,
  type OcrStreamEvent,
} from '@/lib/api/scan.api'
import { postHistory, patchHistoryLocation, patchHistory } from '@/lib/api/history.api'
import { getCached, setCached } from '@/lib/cache'

type ScanOcrParams = {
  s3Key: string
  lat?: number
  lng?: number
  allowLowConfidence?: boolean
}

type UseScanApiReturn = {
  scanBarcode: (janCode: string) => Promise<BarcodeScanResponse>
  fetchPresignedUrl: () => Promise<PresignedUrlResponse>
  putS3: (url: string, imageBlob: Blob) => Promise<void>
  scanOcr: (params: ScanOcrParams) => Promise<OcrApiResponse>
  scanOcrStream: (params: ScanOcrParams) => AsyncGenerator<OcrStreamEvent>
  scanBarcodeWithCache: (janCode: string) => Promise<BarcodeScanResponse>
  saveHistory: (body: CreateHistoryBody) => Promise<HistoryItem | null>
  patchLocation: (
    historyId: string,
    location: { store_name: string; lat: number; lng: number },
  ) => Promise<void>
  patchHistoryFields: (historyId: string, data: PatchHistoryBody) => Promise<void>
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
    async (params: ScanOcrParams): Promise<OcrApiResponse> => {
      return postOcr({ ...params, allowLowConfidence: params.allowLowConfidence })
    },
    [],
  )

  const scanOcrStream = useCallback(
    (params: ScanOcrParams): AsyncGenerator<OcrStreamEvent> => {
      return postOcrStream({ ...params })
    },
    [],
  )

  const saveHistory = useCallback(
    async (body: CreateHistoryBody): Promise<HistoryItem | null> => {
      try {
        const item = await postHistory(body)
        await queryClient.invalidateQueries({ queryKey: ['history'] })
        return item
      } catch (e) {
        console.error('履歴保存に失敗しました', e)
        return null
      }
    },
    [queryClient],
  )

  const patchLocation = useCallback(
    async (
      historyId: string,
      location: { store_name: string; lat: number; lng: number },
    ): Promise<void> => {
      try {
        await patchHistoryLocation(historyId, location)
        await queryClient.invalidateQueries({ queryKey: ['history'] })
      } catch (e) {
        console.error('店舗情報の更新に失敗しました', e)
      }
    },
    [queryClient],
  )

  const patchHistoryFields = useCallback(
    async (historyId: string, data: PatchHistoryBody): Promise<void> => {
      try {
        await patchHistory(historyId, data)
        await queryClient.invalidateQueries({ queryKey: ['history'] })
      } catch (e) {
        console.error('フィールド更新に失敗しました', e)
      }
    },
    [queryClient],
  )

  return { scanBarcode, scanBarcodeWithCache, fetchPresignedUrl, putS3, scanOcr, scanOcrStream, saveHistory, patchLocation, patchHistoryFields }
}
