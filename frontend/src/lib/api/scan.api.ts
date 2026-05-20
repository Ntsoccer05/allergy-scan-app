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
}

export const postOcr = async ({
  s3Key,
  lat,
  lng,
}: PostOcrParams): Promise<OcrApiResponse> => {
  const body: Record<string, unknown> = { s3_key: s3Key }
  if (lat !== undefined) body.lat = lat
  if (lng !== undefined) body.lng = lng

  const res = await fetch(`${API_BASE_URL}/scan/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`ocr scan failed: ${res.status}`)
  }
  return res.json() as Promise<OcrApiResponse>
}
