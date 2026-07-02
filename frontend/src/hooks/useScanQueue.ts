'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { OcrApiResponse } from '@/lib/api/scan.api'
import { getPresignedUrl, postOcrStream, uploadToS3 } from '@/lib/api/scan.api'
import { patchHistory } from '@/lib/api/history.api'
import { generateThumbnail } from '@/lib/thumbnail'
import { getPublicUrlFromPresigned } from '@/lib/s3.utils'
import { OCR_MAX_DIMENSION, OCR_JPEG_QUALITY, USE_OCR_AS_THUMBNAIL, getDeviceType } from '@/app/scan/scan.constants'

const SCAN_TODAY_KEY = 'scan:today:v1'

/** localStorage に保存する今日のスキャン1件。 */
export type TodayScanItem = {
  id: string
  capturedAt: string      // ISO8601
  judgment: 'ng' | 'partial' | 'ok'
  productName: string | null
  detected: string[]
  rawText: string | null
  storeName?: string | null   // 場所登録後に updateTodayScanItem で更新
  address?: string | null     // 同上
  thumbnailUrl?: string | null // onPatchHistory で更新
}

type TodayScanCache = {
  date: string            // 'YYYY-MM-DD'
  items: TodayScanItem[]
}

/** localStorage の今日のスキャン1件を後から更新する（場所登録・サムネイル設定後）。 */
export const updateTodayScanItem = (
  id: string,
  updates: Partial<Pick<TodayScanItem, 'storeName' | 'address' | 'thumbnailUrl' | 'productName'>>,
): void => {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(SCAN_TODAY_KEY)
    if (!raw) return
    const cache = JSON.parse(raw) as TodayScanCache
    const idx = cache.items.findIndex((item) => item.id === id)
    if (idx === -1) return
    cache.items[idx] = { ...cache.items[idx], ...updates }
    localStorage.setItem(SCAN_TODAY_KEY, JSON.stringify(cache))
    // useTodayScans が検知できるようにカスタムイベントを発火する
    window.dispatchEvent(new CustomEvent('today-scan-updated'))
  } catch {
    // localStorage がいっぱいの場合は無視する
  }
}

/**
 * blob URL から 160px 以下の JPEG data URL を生成する（localStorage 永続化用）。
 * スキャン完了直後に呼ぶ — blob URL はその時点ではまだ有効。
 */
const generateThumbnailDataUrl = (blobUrl: string): Promise<string | null> =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const MAX = 160
        const scale = Math.min(1, MAX / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
        const c = document.createElement('canvas')
        c.width = Math.round((img.naturalWidth || 1) * scale)
        c.height = Math.round((img.naturalHeight || 1) * scale)
        const ctx = c.getContext('2d')
        if (!ctx) { resolve(null); return }
        ctx.drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/jpeg', 0.5))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = blobUrl
  })

/** OCR レスポンスから今日のスキャン1件を localStorage に書き込む内部ユーティリティ。 */
const writeTodayScanItem = (
  id: string,
  capturedAt: Date,
  result: OcrApiResponse,
  thumbnailDataUrl?: string | null,
): void => {
  if (typeof window === 'undefined') return
  const today = new Date().toISOString().slice(0, 10)
  let cache: TodayScanCache
  try {
    const raw = localStorage.getItem(SCAN_TODAY_KEY)
    cache = raw ? (JSON.parse(raw) as TodayScanCache) : { date: today, items: [] }
  } catch {
    cache = { date: today, items: [] }
  }
  if (cache.date !== today) cache = { date: today, items: [] }

  const judgment: 'ng' | 'partial' | 'ok' =
    result.results.some((r) => r.detection_type === 'contains')
      ? 'ng'
      : result.results.some(
          (r) => r.detection_type === 'partial' || r.detection_type === 'may_contain',
        )
        ? 'partial'
        : 'ok'
  const detected = result.results
    .filter((r) => r.judgment !== 'なし' && r.judgment !== '判定不能')
    .map((r) => r.allergen)

  cache.items.push({
    id,
    capturedAt: capturedAt.toISOString(),
    judgment,
    productName: result.product_name ?? null,
    detected,
    rawText: result.raw_text,
    thumbnailUrl: thumbnailDataUrl ?? null,
  })
  try {
    localStorage.setItem(SCAN_TODAY_KEY, JSON.stringify(cache))
  } catch {
    // localStorage がいっぱいの場合は無視する
  }
}

/** キュー経由のスキャン完了ジョブを localStorage に永続化する（addJob から呼ぶ）。 */
const persistTodayScan = (job: ScanJob, result: OcrApiResponse, thumbnailDataUrl?: string | null): void => {
  writeTodayScanItem(job.id, job.capturedAt, result, thumbnailDataUrl)
}

/**
 * 画像ファイル選択など、キューを使わない直接スキャンパスの完了時に今日のスキャンに保存する。
 * capturedImageUrl（blob URL）からサムネイル data URL を生成して一緒に保存する。
 */
export const saveTodayScanFromDirectOcr = async (
  ocrResult: OcrApiResponse,
  capturedImageUrl: string,
): Promise<void> => {
  const thumbnailDataUrl = await generateThumbnailDataUrl(capturedImageUrl)
  writeTodayScanItem(crypto.randomUUID(), new Date(), ocrResult, thumbnailDataUrl)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('today-scan-updated'))
  }
}

export type ScanJobState = 'uploading' | 'analyzing' | 'done' | 'error'

export type ScanJob = {
  id: string
  state: ScanJobState
  progress: number            // 0〜100
  capturedImageUrl: string    // blob URL（プレビュー用）
  capturedAt: Date
  result?: OcrApiResponse
  error?: string
}

const MAX_CONCURRENT_JOBS = 5

export const useScanQueue = () => {
  const [jobs, setJobs] = useState<ScanJob[]>([])
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())

  const updateJob = useCallback((id: string, updates: Partial<ScanJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...updates } : j)))
  }, [])

  const addJob = useCallback(
    async (imageSource: File | Blob, capturedImageUrl: string): Promise<void> => {
      const jobId = crypto.randomUUID()
      const job: ScanJob = {
        id: jobId,
        state: 'uploading',
        progress: 0,
        capturedImageUrl,
        capturedAt: new Date(),
      }
      // ジョブを即座に追加してローディングを表示する（File 変換前に呼ぶ）
      setJobs((prev) => [...prev, job])

      const abortController = new AbortController()
      abortControllersRef.current.set(jobId, abortController)

      try {
        // File の場合は OCR_MAX_DIMENSION にリサイズして Blob に変換
        let blob: Blob
        if (imageSource instanceof File) {
          const bitmap = await createImageBitmap(imageSource)
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
          blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
              'image/jpeg',
              OCR_JPEG_QUALITY,
            )
          })
        } else {
          blob = imageSource
        }

        // サムネイルの S3 アップロード（USE_OCR_AS_THUMBNAIL=true のときはスキップ）
        const thumbnailS3UrlPromise: Promise<string | null> = USE_OCR_AS_THUMBNAIL
          ? Promise.resolve(null)
          : (async () => {
              try {
                const thumbBlob = await generateThumbnail(capturedImageUrl)
                const { url: thumbPresigned } = await getPresignedUrl()
                await uploadToS3(thumbPresigned, thumbBlob)
                return getPublicUrlFromPresigned(thumbPresigned)
              } catch {
                return null
              }
            })()

        // Step 1: Presigned URL 取得
        const { url, s3_key } = await getPresignedUrl()
        const ocrPublicUrl = getPublicUrlFromPresigned(url)

        // Step 2: XHR で S3 アップロード（進捗取得のため fetch ではなく XHR を使う）
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('PUT', url)
          xhr.setRequestHeader('Content-Type', blob.type || 'image/jpeg')

          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 50)
              updateJob(jobId, { progress: percent })
            }
          })

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve()
            else reject(new Error(`S3 upload failed: ${xhr.status}`))
          })
          xhr.addEventListener('error', () => reject(new Error('S3 upload network error')))
          abortController.signal.addEventListener('abort', () => xhr.abort())
          xhr.send(blob)
        })

        updateJob(jobId, { state: 'analyzing', progress: 50 })

        // Step 3: postOcrStream を使って SSE 解析（progress 50→100%）
        let result: OcrApiResponse | null = null
        let analyzeProgress = 50

        for await (const event of postOcrStream({ s3Key: s3_key, allowLowConfidence: getDeviceType() === 'pc' })) {
          if (abortController.signal.aborted) break
          if (event.type === 'raw_text') {
            analyzeProgress = Math.min(90, analyzeProgress + 10)
            updateJob(jobId, { progress: analyzeProgress })
          } else if (event.type === 'result') {
            result = event.data
            updateJob(jobId, { progress: 100 })
          } else if (event.type === 'error') {
            throw new Error(event.message)
          } else if (event.type === 'confidence_low') {
            throw new Error('confidence_low')
          }
        }

        if (!result) throw new Error('No result from OCR stream')

        // サムネイル data URL を生成して localStorage に永続化（blob URL はまだ有効）
        const thumbnailDataUrl = await generateThumbnailDataUrl(capturedImageUrl)
        updateJob(jobId, { state: 'done', result, progress: 100 })
        persistTodayScan(job, result, thumbnailDataUrl)

        // history_id があればサムネイル S3 URL と OCR 画像 URL を DB に保存
        const historyId = result.history_id
        if (historyId) {
          const thumbnailS3Url = await thumbnailS3UrlPromise
          void patchHistory(historyId, {
            thumbnail_url: USE_OCR_AS_THUMBNAIL ? ocrPublicUrl : (thumbnailS3Url ?? undefined),
            ocr_image_url: ocrPublicUrl,
          })
        }
      } catch (err) {
        if (abortController.signal.aborted) return
        updateJob(jobId, {
          state: 'error',
          error: err instanceof Error ? err.message : 'unknown error',
        })
      } finally {
        abortControllersRef.current.delete(jobId)
      }
    },
    [updateJob],
  )

  const dismissJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id))
    abortControllersRef.current.get(id)?.abort()
    abortControllersRef.current.delete(id)
  }, [])

  const activeJobs = jobs.filter((j) => j.state !== 'done' && j.state !== 'error')
  const doneJobs = jobs.filter((j) => j.state === 'done' || j.state === 'error')
  const isAtCapacity = activeJobs.length >= MAX_CONCURRENT_JOBS

  return {
    jobs,
    activeJobs,
    doneJobs,
    addJob,
    dismissJob,
    isAtCapacity,
    MAX_CONCURRENT_JOBS,
  }
}

const readTodayScans = (): TodayScanItem[] => {
  if (typeof window === 'undefined') return []
  const today = new Date().toISOString().slice(0, 10)
  try {
    const raw = localStorage.getItem(SCAN_TODAY_KEY)
    if (!raw) return []
    const cache = JSON.parse(raw) as TodayScanCache
    if (cache.date !== today) return []
    return cache.items
  } catch {
    return []
  }
}

/**
 * 今日のスキャン結果を localStorage から読み込む hook。
 * - doneJobsCount 変化時（新スキャン完了）
 * - isSheetOpen が true になったとき（シート開いた瞬間）
 * - 'today-scan-updated' カスタムイベント（場所登録・サムネイル更新後）
 * の3タイミングで再読み込みする。
 */
export const useTodayScans = (doneJobsCount: number, isSheetOpen = false): TodayScanItem[] => {
  const [items, setItems] = useState<TodayScanItem[]>([])

  useEffect(() => {
    setItems(readTodayScans())
  }, [doneJobsCount, isSheetOpen])

  useEffect(() => {
    const handler = () => setItems(readTodayScans())
    window.addEventListener('today-scan-updated', handler)
    return () => window.removeEventListener('today-scan-updated', handler)
  }, [])

  return items
}
