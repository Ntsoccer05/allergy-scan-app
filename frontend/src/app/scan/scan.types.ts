'use client'

export type ScanState =
  | 'idle'        // カメラ起動・待機（撮影ボタン有効）
  | 'preview'     // 撮影プレビュー表示（撮り直し / 確定）
  | 'processing'  // API 送信中
  | 'result'      // 結果表示
  | 'error'       // エラー

export type ScanError =
  | 'quality_check_failed'
  | 'incomplete'
  | 'confidence_low'
  | 'api_error'
  | 'daily_limit_exceeded'  // 日次上限超過（429）
  | 'cooldown'              // 3秒クールダウン中

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
  /** 商品の原材料テキスト（OCR 由来 JAN キャッシュ・OFF の ingredients。検証表示用） */
  raw_text?: string | null
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
  product_name?: string | null
}

/** 店舗候補の型（GET /places/candidates から返される） */
export type StoreCandidate = {
  name: string
  placeId: string
}

/** バーコードスキャン結果または OCR スキャン結果 */
export type ScanResult =
  | { type: 'barcode'; data: BarcodeScanResponse }
  | { type: 'ocr'; data: OcrScanResponse }
  | { type: 'low_confidence'; raw_text: string }
