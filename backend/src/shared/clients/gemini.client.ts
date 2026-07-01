import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  AllergenResult,
  GeminiOcrResponse,
  HighlightItem,
} from '../types/gemini.types';
import {
  GEMINI_ERROR_LOG_MAX_LENGTH,
  GEMINI_MODEL_NAME,
} from '../../scan/scan.constants';

export type GeminiStreamChunk =
  | { type: 'raw_text'; text: string }
  | { type: 'result'; data: GeminiOcrResponse };

/** JSON文字列値を部分的に抽出する（ストリーム中の raw_text 取り出し用）。 */
const extractJsonStringPartial = (json: string, valueStartIdx: number): string => {
  let result = '';
  let i = valueStartIdx;
  while (i < json.length) {
    const c = json[i];
    if (c === '\\' && i + 1 < json.length) {
      const next = json[i + 1]!;
      if (next === '"') result += '"';
      else if (next === '\\') result += '\\';
      else if (next === 'n') result += '\n';
      else if (next === 't') result += '\t';
      else result += next;
      i += 2;
    } else if (c === '"') {
      break;
    } else {
      result += c;
      i++;
    }
  }
  return result;
};

// gemini-2.5-flash の thinking モードはデフォルト ON のため明示的に無効化する型を追加
// responseMimeType は v0.24.1 の型定義に含まれないため合わせて拡張する
declare module '@google/generative-ai' {
  interface GenerationConfig {
    thinkingConfig?: { thinkingBudget: number };
    responseMimeType?: string;
  }
}

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
  product_name: null,
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
   * Gemini Flash API に画像と動的プロンプトを送信して OCR + アレルギー判定を行う。
   * JSON パース失敗時は FALLBACK_RESPONSE（判定不能）を返す（安全側に倒す）。
   */
  async analyzeImage(
    imageBase64: string,
    prompt: string,
  ): Promise<GeminiOcrResponse> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: GEMINI_MODEL_NAME,
        generationConfig: {
          // gemini-2.5-flash はデフォルトで thinking モードが ON（+12〜15s）
          thinkingConfig: { thinkingBudget: 0 },
          // JSON mode: コードブロックなしで純粋な JSON を返す（regex抽出不要・確実なパース）
          responseMimeType: 'application/json',
          // temperature: 0 で決定論的出力（同じ画像・プロンプトで一貫した結果を返す）
          temperature: 0,
        },
      });
      const imageSizeKB = Math.round((imageBase64.length * 3) / 4 / 1024);
      this.logger.log(`[TIMING] Gemini 呼び出し開始: imageSize=${imageSizeKB}KB, model=${GEMINI_MODEL_NAME}, thinkingBudget=0, jsonMode=ON`);
      const t = Date.now();
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBase64,
          },
        },
        prompt,
      ]);
      this.logger.log(`[TIMING] Gemini generateContent: ${Date.now() - t}ms`);
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

  /**
   * Gemini Flash API にストリーミングで画像を送信し、raw_text を逐次返す。
   * raw_text の部分文字列が確定するたびに GeminiStreamChunk を yield する。
   * 最後に { type: 'result', data } を yield して完了する。
   */
  async *analyzeImageStream(
    imageBase64: string,
    prompt: string,
  ): AsyncGenerator<GeminiStreamChunk> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: GEMINI_MODEL_NAME,
        generationConfig: {
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
        },
      });
      const imageSizeKB = Math.round((imageBase64.length * 3) / 4 / 1024);
      this.logger.log(`[STREAM] Gemini stream 開始: imageSize=${imageSizeKB}KB`);
      const t = Date.now();

      const streamResult = await model.generateContentStream([
        { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
        prompt,
      ]);

      let accumulated = '';
      let rawTextValueStart = -1;
      let lastSentLength = 0;
      const RAW_TEXT_MARKER = '"raw_text":"';

      for await (const chunk of streamResult.stream) {
        const chunkText = chunk.text();
        accumulated += chunkText;

        if (rawTextValueStart === -1) {
          const markerIdx = accumulated.indexOf(RAW_TEXT_MARKER);
          if (markerIdx !== -1) {
            rawTextValueStart = markerIdx + RAW_TEXT_MARKER.length;
          }
        }

        if (rawTextValueStart !== -1) {
          const partial = extractJsonStringPartial(accumulated, rawTextValueStart);
          if (partial.length > lastSentLength) {
            lastSentLength = partial.length;
            yield { type: 'raw_text', text: partial };
          }
        }
      }

      this.logger.log(`[STREAM] Gemini stream 完了: ${Date.now() - t}ms`);
      const result = this.parseGeminiResponse(accumulated);
      yield { type: 'result', data: result };
    } catch (error) {
      this.logger.error(
        'Gemini stream エラー',
        error instanceof Error ? error.message : String(error),
      );
      yield { type: 'result', data: { ...FALLBACK_RESPONSE } };
    }
  }

  /** Gemini のテキスト応答を GeminiOcrResponse 型にパースする。失敗時はフォールバックを返す。 */
  private parseGeminiResponse(text: string): GeminiOcrResponse {
    try {
      // JSON mode (responseMimeType: 'application/json') により純粋な JSON が返るため直接パース
      const parsed: unknown = JSON.parse(text);
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
      product_name:
        typeof obj['product_name'] === 'string' ? obj['product_name'] : null,
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
