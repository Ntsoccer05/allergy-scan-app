import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  AllergenResult,
  GeminiOcrResponse,
  HighlightItem,
} from './types/gemini.types';
import {
  GEMINI_ERROR_LOG_MAX_LENGTH,
  GEMINI_MODEL_NAME,
} from '../scan/scan.constants';

/**
 * Gemini API 呼び出し失敗時や JSON パース失敗時に返すフォールバックレスポンス。
 * ⚠️ 安全設計: 判定不能は必ず安全側に倒す（anti_patterns.md #1）。
 */
const FALLBACK_RESPONSE: GeminiOcrResponse = {
  raw_text: '',
  confidence: 'low',
  results: [],
  highlights: [],
  incomplete: false,
  price: null,
  price_with_tax: null,
  price_confidence: null,
};

@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);
  private readonly genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY ?? '';
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Gemini Flash API に画像と動的プロンプトを送信して OCR + アレルゲン判定を行う。
   * JSON パース失敗時は FALLBACK_RESPONSE（判定不能）を返す（安全側に倒す）。
   */
  async analyzeImage(
    imageBase64: string,
    prompt: string,
  ): Promise<GeminiOcrResponse> {
    try {
      const model = this.genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBase64,
          },
        },
        prompt,
      ]);
      const text = result.response.text();
      return this.parseGeminiResponse(text);
    } catch (error) {
      this.logger.error(
        'Gemini API 呼び出し失敗',
        error instanceof Error ? error.message : String(error),
      );
      return { ...FALLBACK_RESPONSE };
    }
  }

  /** Gemini のテキスト応答を GeminiOcrResponse 型にパースする。失敗時はフォールバックを返す。 */
  private parseGeminiResponse(text: string): GeminiOcrResponse {
    try {
      // Gemini がコードブロックで返す場合に備えて JSON 部分を抽出する
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.error(
          'Gemini レスポンスに JSON が見つかりません',
          text.slice(0, GEMINI_ERROR_LOG_MAX_LENGTH),
        );
        return { ...FALLBACK_RESPONSE };
      }
      const parsed: unknown = JSON.parse(jsonMatch[0]);
      return this.validateGeminiResponse(parsed);
    } catch (error) {
      this.logger.error(
        'Gemini レスポンス JSON パース失敗',
        error instanceof Error ? error.message : String(error),
      );
      return { ...FALLBACK_RESPONSE };
    }
  }

  /** パースした unknown を GeminiOcrResponse 型として検証・整形する。 */
  private validateGeminiResponse(parsed: unknown): GeminiOcrResponse {
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...FALLBACK_RESPONSE };
    }
    const obj = parsed as Record<string, unknown>;

    const confidence = this.toConfidence(obj['confidence']);
    // ⚠️ 安全設計: results が不正な値の場合は安全側フォールバック（空配列 = 判定不能扱い）
    const results = this.toAllergenResults(obj['results']);
    const highlights = this.toHighlightItems(obj['highlights']);

    return {
      raw_text: typeof obj['raw_text'] === 'string' ? obj['raw_text'] : '',
      confidence,
      results,
      highlights,
      incomplete:
        typeof obj['incomplete'] === 'boolean' ? obj['incomplete'] : false,
      price: typeof obj['price'] === 'number' ? obj['price'] : null,
      price_with_tax:
        typeof obj['price_with_tax'] === 'number'
          ? obj['price_with_tax']
          : null,
      price_confidence: this.toPriceConfidence(obj['price_confidence']),
    };
  }

  /** results フィールドを AllergenResult[] として安全にパースする。不正値は空配列を返す。 */
  private toAllergenResults(value: unknown): AllergenResult[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item: unknown) => {
      if (typeof item !== 'object' || item === null) return [];
      const el = item as Record<string, unknown>;
      const judgment = this.toJudgment(el['judgment']);
      const detection_type = this.toDetectionType(el['detection_type']);
      const risk_level = this.toRiskLevel(el['risk_level']);
      return [
        {
          allergen: typeof el['allergen'] === 'string' ? el['allergen'] : '',
          judgment,
          detection_type,
          detected: Array.isArray(el['detected'])
            ? (el['detected'] as unknown[]).filter(
                (v): v is string => typeof v === 'string',
              )
            : [],
          risk_level,
          reason: typeof el['reason'] === 'string' ? el['reason'] : '',
        },
      ];
    });
  }

  /** highlights フィールドを HighlightItem[] として安全にパースする。不正値は空配列を返す。 */
  private toHighlightItems(value: unknown): HighlightItem[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item: unknown) => {
      if (typeof item !== 'object' || item === null) return [];
      const el = item as Record<string, unknown>;
      const judgment = this.toHighlightJudgment(el['judgment']);
      if (judgment === null) return [];
      return [
        {
          text: typeof el['text'] === 'string' ? el['text'] : '',
          judgment,
        },
      ];
    });
  }

  private toConfidence(value: unknown): 'high' | 'medium' | 'low' {
    if (value === 'high' || value === 'medium' || value === 'low') return value;
    return 'low';
  }

  private toJudgment(
    value: unknown,
  ): '含む' | '一部含む' | 'なし' | '判定不能' {
    if (
      value === '含む' ||
      value === '一部含む' ||
      value === 'なし' ||
      value === '判定不能'
    ) {
      return value;
    }
    // ⚠️ 安全設計: 不明な値は必ず判定不能として安全側に倒す
    return '判定不能';
  }

  private toDetectionType(
    value: unknown,
  ): 'contains' | 'partial' | 'may_contain' {
    if (
      value === 'contains' ||
      value === 'partial' ||
      value === 'may_contain'
    ) {
      return value;
    }
    return 'contains';
  }

  private toRiskLevel(value: unknown): 'high' | 'medium' | 'low' | 'ignore' {
    if (
      value === 'high' ||
      value === 'medium' ||
      value === 'low' ||
      value === 'ignore'
    ) {
      return value;
    }
    return 'low';
  }

  private toHighlightJudgment(
    value: unknown,
  ): 'ng' | 'partial' | 'may_contain' | null {
    if (value === 'ng' || value === 'partial' || value === 'may_contain') {
      return value;
    }
    return null;
  }

  private toPriceConfidence(value: unknown): 'high' | 'low' | null {
    if (value === 'high' || value === 'low') return value;
    return null;
  }
}
