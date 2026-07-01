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
import { postHistory, patchHistoryLocation, patchHistory, deleteHistory } from '@/lib/api/history.api'
import { getPlaceCandidates, type PlaceCandidatesResponse } from '@/lib/api/places.api'
import { getCached, setCached } from '@/lib/cache'

type ScanOcrParams = {
  s3Key: string
  lat?: number
  lng?: number
  allowLowConfidence?: boolean
  /** 撮影フレームから検出済みの JAN コード（JAN キャッシュ用） */
  janCode?: string
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
    location: { store_name: string; lat: number; lng: number; address?: string; place_id?: string },
  ) => Promise<void>
  patchHistoryFields: (historyId: string, data: PatchHistoryBody) => Promise<void>
  /** 場所登録用の住所・施設候補を取得する（失敗時は null）。query を指定すると Overpass テキスト検索を使用する。 */
  fetchPlaceCandidates: (lat: number, lng: number, query?: string) => Promise<PlaceCandidatesResponse | null>
  /** 商品名未入力キャンセル時に履歴エントリを削除する（失敗は無視）。 */
  deleteHistoryEntry: (historyId: string) => Promise<void>
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
      location: { store_name: string; lat: number; lng: number; address?: string; place_id?: string },
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

  const fetchPlaceCandidates = useCallback(
    async (lat: number, lng: number, query?: string): Promise<PlaceCandidatesResponse | null> => {
      try {
        return await getPlaceCandidates(lat, lng, query)
      } catch (e) {
        console.error('場所候補の取得に失敗しました', e)
        return null
      }
    },
    [],
  )

  const deleteHistoryEntry = useCallback(
    async (historyId: string): Promise<void> => {
      try {
        await deleteHistory(historyId)
        await queryClient.invalidateQueries({ queryKey: ['history'] })
      } catch (e) {
        console.error('履歴削除に失敗しました', e)
      }
    },
    [queryClient],
  )

  return { scanBarcode, scanBarcodeWithCache, fetchPresignedUrl, putS3, scanOcr, scanOcrStream, saveHistory, patchLocation, patchHistoryFields, fetchPlaceCandidates, deleteHistoryEntry }
}
