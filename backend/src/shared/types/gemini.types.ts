/**
 * Gemini Flash API の OCR レスポンス型（coding_rules.md API レスポンス形式準拠）。
 * GeminiClient.analyzeImage の戻り値として使用する。
 */

export type RiskLevel = 'high' | 'medium' | 'low' | 'ignore';
export type DetectionType = 'contains' | 'partial' | 'may_contain';
export type JudgmentResult = '含む' | '一部含む' | 'なし' | '判定不能';
export type HighlightJudgment = 'ng' | 'partial' | 'may_contain';

export type AllergenResult = {
  allergen: string;
  judgment: JudgmentResult;
  detection_type: DetectionType;
  detected: string[];
  risk_level: RiskLevel;
  reason: string;
};

export type HighlightItem = {
  text: string;
  judgment: HighlightJudgment;
};

export type GeminiOcrResponse = {
  raw_text: string;
  confidence: 'high' | 'medium' | 'low';
  results: AllergenResult[];
  highlights: HighlightItem[];
  incomplete: boolean;
  price: number | null;
  price_with_tax: number | null;
  price_confidence: 'high' | 'low' | null;
  product_name: string | null;
};
