'use client'

export type ScanState =
  | 'idle'
  | 'detecting'
  | 'stable'
  | 'processing'
  | 'result'
  | 'error'

export type ScanError =
  | 'dark'
  | 'blur'
  | 'motion'
  | 'incomplete'
  | 'confidence_low'
  | 'api_error'

export type Confidence = 'high' | 'medium' | 'low'

export type Judgment = '含む' | '一部含む' | 'なし' | '判定不能'

export type JudgmentShort = 'ng' | 'partial' | 'ok'

export type RiskLevel = 'high' | 'medium' | 'low' | 'ignore'

export type DetectionType = 'contains' | 'partial' | 'may_contain'

export type HighlightJudgment = 'ng' | 'partial' | 'may_contain'

export type AllergenResult = {
  allergen: string
  judgment: Judgment
  detection_type: DetectionType
  detected: string[]
  risk_level: RiskLevel
  reason: string
}

export type HighlightItem = {
  text: string
  judgment: HighlightJudgment
}

export type ProductAllergens = {
  contains: string[]
  partial: string[]
  components: string[]
}

export type BarcodeScanResponse = {
  found: boolean
  product_name?: string | null
  allergens?: ProductAllergens | null
  judgment?: JudgmentShort | null
  detected?: string[] | null
  risk_level?: 'high' | 'medium' | 'low' | 'ignore' | null
  from_cache: boolean
}

export type PresignedUrlResponse = {
  url: string
  s3_key: string
}

export type OcrScanResponse = {
  raw_text: string
  confidence: Confidence
  results: AllergenResult[]
  highlights: HighlightItem[]
  incomplete: boolean
  price: number | null
  price_with_tax: number | null
  price_confidence: 'high' | 'low' | null
}

/** 店舗候補の型（Places API から返される） */
export type StoreCandidate = {
  name: string
  placeId: string
}

/** バーコードスキャン結果または OCR スキャン結果 */
export type ScanResult =
  | { type: 'barcode'; data: BarcodeScanResponse }
  | { type: 'ocr'; data: OcrScanResponse; storeCandidates?: StoreCandidate[] }
  | { type: 'low_confidence'; raw_text: string }
