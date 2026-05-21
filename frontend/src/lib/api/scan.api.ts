import type {
  BarcodeScanResponse,
  OcrScanResponse,
  PresignedUrlResponse,
  StoreCandidate,
} from '@/app/scan/scan.types'
import { API_BASE_URL } from '@/lib/constants'

/** POST /scan/ocr のレスポンス型（storeCandidates は候補 2 件以上のときのみ含まれる）。 */
export type OcrApiResponse = OcrScanResponse & {
  storeCandidates?: StoreCandidate[]
}

/** POST /scan/ocr-stream の SSE イベント型。 */
export type OcrStreamEvent =
  | { type: 'started' }
  | { type: 'raw_text'; text: string }
  | { type: 'confidence_low'; raw_text: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'result'; data: OcrApiResponse }

export const getPresignedUrl = async (): Promise<PresignedUrlResponse> => {
  const res = await fetch(`${API_BASE_URL}/scan/presigned-url`, {
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error(`presigned-url fetch failed: ${res.status}`)
  }
  return res.json() as Promise<PresignedUrlResponse>
}

export const uploadToS3 = async (url: string, imageBlob: Blob): Promise<void> => {
  const res = await fetch(url, {
    method: 'PUT',
    body: imageBlob,
    headers: { 'Content-Type': imageBlob.type || 'image/jpeg' },
  })
  if (!res.ok) {
    throw new Error(`S3 upload failed: ${res.status}`)
  }
}

export const postBarcode = async (
  janCode: string,
): Promise<BarcodeScanResponse> => {
  const res = await fetch(`${API_BASE_URL}/scan/barcode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ jan_code: janCode }),
  })
  if (!res.ok) {
    throw new Error(`barcode scan failed: ${res.status}`)
  }
  return res.json() as Promise<BarcodeScanResponse>
}

type PostOcrParams = {
  s3Key: string
  lat?: number
  lng?: number
  allowLowConfidence?: boolean
}

export type OcrErrorBody = {
  code: string
  message: string
  raw_text?: string
}

export const postOcr = async ({
  s3Key,
  lat,
  lng,
  allowLowConfidence,
}: PostOcrParams): Promise<OcrApiResponse> => {
  const body: Record<string, unknown> = { s3_key: s3Key }
  if (lat !== undefined) body.lat = lat
  if (lng !== undefined) body.lng = lng
  if (allowLowConfidence) body.allow_low_confidence = true

  const res = await fetch(`${API_BASE_URL}/scan/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null) as OcrErrorBody | null
    const err = new Error(`ocr scan failed: ${res.status}`)
    ;(err as Error & { responseBody: OcrErrorBody | null }).responseBody = errorBody
    throw err
  }
  return res.json() as Promise<OcrApiResponse>
}

/**
 * POST /scan/ocr-stream: SSE ストリームで OCR 結果を逐次受信する。
 * raw_text イベントが届くたびに部分テキストを yield し、最後に result イベントを yield する。
 */
export async function* postOcrStream(params: PostOcrParams): AsyncGenerator<OcrStreamEvent> {
  const body: Record<string, unknown> = { s3_key: params.s3Key }
  if (params.lat !== undefined) body.lat = params.lat
  if (params.lng !== undefined) body.lng = params.lng
  if (params.allowLowConfidence) body.allow_low_confidence = true

  const res = await fetch(`${API_BASE_URL}/scan/ocr-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`ocr-stream failed: ${res.status}`)
  if (!res.body) throw new Error('ocr-stream: response body is null')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE: イベントブロックは `\n\n` で区切られる
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''

      for (const block of blocks) {
        const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
        if (!dataLine) continue
        try {
          const event = JSON.parse(dataLine.slice(6)) as OcrStreamEvent
          yield event
        } catch {
          // malformed JSON は無視
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
