import { GeminiClient } from './gemini.client';
import type { GeminiOcrResponse } from './types/gemini.types';

/**
 * GeminiClient.parseGeminiResponse / validateGeminiResponse のテスト。
 * `@google/generative-ai` をモックして analyzeImage の JSON パース動作を検証する。
 */

// GoogleGenerativeAI のモック
jest.mock('@google/generative-ai', () => {
  const mockGenerateContent = jest.fn();
  const mockGetGenerativeModel = jest.fn(() => ({
    generateContent: mockGenerateContent,
  }));
  return {
    GoogleGenerativeAI: jest.fn(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    })),
    __mockGenerateContent: mockGenerateContent,
  };
});

const getGenerateContentMock = (): jest.Mock => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@google/generative-ai') as { __mockGenerateContent: jest.Mock };
  return mod.__mockGenerateContent;
};

const makeResponseText = (json: unknown): jest.Mock =>
  jest.fn().mockResolvedValue({
    response: { text: () => JSON.stringify(json) },
  });

describe('GeminiClient.validateGeminiResponse', () => {
  let client: GeminiClient;

  beforeEach(() => {
    client = new GeminiClient();
    jest.clearAllMocks();
  });

  const callAnalyzeImage = (json: unknown): Promise<GeminiOcrResponse> => {
    const mock = getGenerateContentMock();
    mock.mockImplementation(makeResponseText(json));
    return client.analyzeImage('base64data', 'prompt');
  };

  it('Gemini レスポンスに product_name: "テスト商品" が含まれる場合に正しくパースされる', async () => {
    const result = await callAnalyzeImage({
      raw_text: '原材料: 卵',
      confidence: 'high',
      results: [],
      highlights: [],
      incomplete: false,
      price: null,
      price_with_tax: null,
      price_confidence: null,
      product_name: 'テスト商品',
    });

    expect(result.product_name).toBe('テスト商品');
  });

  it('Gemini レスポンスに product_name フィールドが欠如している場合に null が返る', async () => {
    const result = await callAnalyzeImage({
      raw_text: '原材料: 卵',
      confidence: 'high',
      results: [],
      highlights: [],
      incomplete: false,
      price: null,
      price_with_tax: null,
      price_confidence: null,
      // product_name を意図的に省略
    });

    expect(result.product_name).toBeNull();
  });

  it('Gemini レスポンスに product_name: 123（非文字列）が含まれる場合に null が返る', async () => {
    const result = await callAnalyzeImage({
      raw_text: '原材料: 卵',
      confidence: 'high',
      results: [],
      highlights: [],
      incomplete: false,
      price: null,
      price_with_tax: null,
      price_confidence: null,
      product_name: 123,
    });

    expect(result.product_name).toBeNull();
  });

  it('Gemini レスポンスに product_name: null が含まれる場合に null が返る', async () => {
    const result = await callAnalyzeImage({
      raw_text: '原材料: 卵',
      confidence: 'high',
      results: [],
      highlights: [],
      incomplete: false,
      price: null,
      price_with_tax: null,
      price_confidence: null,
      product_name: null,
    });

    expect(result.product_name).toBeNull();
  });
});
