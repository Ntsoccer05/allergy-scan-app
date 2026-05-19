import type {
  BarcodeScanResponse,
  OcrScanResponse,
  PresignedUrlResponse,
} from '@/app/scan/scan.types'
import { API_BASE_URL } from '@/lib/constants'

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

export const postOcr = async (s3Key: string): Promise<OcrScanResponse> => {
  const res = await fetch(`${API_BASE_URL}/scan/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ s3_key: s3Key }),
  })
  if (!res.ok) {
    throw new Error(`ocr scan failed: ${res.status}`)
  }
  return res.json() as Promise<OcrScanResponse>
}
