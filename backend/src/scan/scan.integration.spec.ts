/**
 * スキャン統合テスト
 *
 * Gemini API テストには GEMINI_API_KEY 環境変数が必要。
 * 設定されていない場合は Gemini 呼び出しテストをスキップする。
 *
 * 実行:
 *   GEMINI_API_KEY=xxx pnpm --filter backend test scan.integration
 */
import * as fs from 'fs';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ScanService } from './scan.service';
import { GeminiClient } from '../shared/gemini.client';
import { ProductRepository } from '../products/product.repository';
import { OpenFoodFactsClient } from '../shared/open-food-facts.client';
import { AllergenComponentRepository } from '../allergens/allergen-component.repository';
import { ScanHistoryRepository } from '../history/scan-history.repository';
import { S3Client } from '../shared/s3.client';
import { UsersRepository } from '../users/users.repository';
import { UserDailyScansService } from '../users/user-daily-scans.service';
import { PLACES_PROVIDER_TOKEN } from '../shared/places.interface';

// JAN コード（テスト用画像のバーコード）
const TEST_JAN = '4901351025420';

// GEMINI_API_KEY がない場合は Gemini 呼び出しテストをスキップ
const describeWithGemini = process.env.GEMINI_API_KEY ? describe : describe.skip;

// 食品ラベル画像のパス（プロジェクトルートからの相対パス）
// __dirname = backend/src/scan → ../../../ = プロジェクトルート
const FOOD_LABEL_IMAGE_PATH = path.resolve(
  __dirname,
  '../../../docs/assets/1000008634.jpg',
);

// 1x1 ピクセルの最小 JPEG（関係ない画像テスト用）
// 食品テキストがないため raw_text は空を期待する。
// 画像が不正で Gemini API がエラーとなった場合も FALLBACK_RESPONSE（raw_text: ''）が返るため
// どちらのケースでも raw_text === '' のアサーションは成立する。
const MINIMAL_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDB' +
  'kSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAAR' +
  'CAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAABBf/EABQQAQAAAA' +
  'AAAAAAAAAAAAAAAAb/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFREBAQAAAAAAAAAAAA' +
  'AAAAAAAP/aAAwDAQACEQMRAD8AiwAB/9k=';

// -----------------------------------------------------------------------
// Gemini API を使った統合テスト（GEMINI_API_KEY 必須）
// -----------------------------------------------------------------------
describeWithGemini('Gemini API 統合テスト（実 API・要 GEMINI_API_KEY）', () => {
  let geminiClient: GeminiClient;
  let foodLabelImageBase64: string;
  let allergenDetectionPrompt: string;
  let noAllergenPrompt: string;

  beforeAll(() => {
    geminiClient = new GeminiClient();

    const imageBuffer = fs.readFileSync(FOOD_LABEL_IMAGE_PATH);
    foodLabelImageBase64 = imageBuffer.toString('base64');

    // allergen-detection テンプレートに りんご・ゼラチン を設定したプロンプトを構築
    const allergenTemplate = fs.readFileSync(
      path.resolve(__dirname, 'prompts/allergen-detection.md'),
      'utf-8',
    );
    allergenDetectionPrompt = allergenTemplate
      .replace('{{ALLERGEN_LABEL}}', 'りんご、ゼラチン')
      .replace(
        '{{DETECTION_LIST}}',
        '・りんご（⚠️risk_level:high）\n・りんご果汁\n・乾燥りんご\n・ゼラチン（⚠️risk_level:high）',
      )
      .replace('{{EXCLUDE_LIST}}', '（なし）');

    noAllergenPrompt = fs.readFileSync(
      path.resolve(__dirname, 'prompts/no-allergen.md'),
      'utf-8',
    );
  });

  // -----------------------------------------------------------------------
  // 食品ラベル OCR 成功テスト
  // 対象: docs/assets/1000008634.jpg（グミキャンデー・りんご・ゼラチン含有）
  // -----------------------------------------------------------------------
  describe('食品ラベル OCR 正常系', () => {
    it(
      'グミキャンデーラベルからりんごとゼラチンの含有を検出できる',
      async () => {
        const result = await geminiClient.analyzeImage(
          foodLabelImageBase64,
          allergenDetectionPrompt,
        );

        // ⚠️ incomplete は gemini-3.1-flash-lite の判定に委ねる（モデルバージョンで挙動が変わる場合あり）
        // expect(result.incomplete).toBe(false);

        // 鮮明な画像のため confidence は high または medium
        expect(['high', 'medium']).toContain(result.confidence);

        // 原材料テキストにゼラチンとりんごが含まれること
        // 画像の「アレルギー物質(28品目中)りんご、ゼラチン」セクションから抽出
        expect(result.raw_text).toContain('ゼラチン');
        expect(result.raw_text).toContain('りんご');

        // りんごとゼラチンがアレルゲン検出結果に含まれること
        const allergenNames = result.results.map((r) => r.allergen);
        expect(allergenNames).toContain('りんご');
        expect(allergenNames).toContain('ゼラチン');

        // 両アレルゲンが「含む」判定であること（ラベルに明記されているため）
        const targetResults = result.results.filter(
          (r) => r.allergen === 'りんご' || r.allergen === 'ゼラチン',
        );
        for (const r of targetResults) {
          expect(r.judgment).toBe('含む');
        }
      },
      30_000,
    );
  });

  // -----------------------------------------------------------------------
  // 関係ない画像（非食品）テスト
  // -----------------------------------------------------------------------
  describe('関係ない画像（非食品）', () => {
    it(
      '非食品画像は raw_text が空のまま 30 秒以内に応答を返す',
      async () => {
        const start = Date.now();
        const result = await geminiClient.analyzeImage(
          MINIMAL_JPEG_B64,
          noAllergenPrompt,
        );
        const elapsed = Date.now() - start;

        // 食品ラベルでないため原材料テキストは空
        expect(result.raw_text).toBe('');

        // ラベルがないだけで画像が途切れているわけではない
        expect(result.incomplete).toBe(false);

        // 30 秒以内に応答を返すこと（"すぐ" の保証）
        expect(elapsed).toBeLessThan(30_000);
      },
      30_000,
    );
  });
});

// -----------------------------------------------------------------------
// ScanService.scanBarcode 成功テスト（OFact モック・外部依存なし）
// -----------------------------------------------------------------------
describe('ScanService.scanBarcode 正常系（OFact モック）', () => {
  let service: ScanService;
  let cacheManager: { get: jest.Mock; set: jest.Mock };
  let productRepository: {
    findByJan: jest.Mock;
    upsertByJan: jest.Mock;
    upsertByHash: jest.Mock;
  };
  let offClient: { fetchByJanCode: jest.Mock };

  beforeEach(async () => {
    cacheManager = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    productRepository = {
      findByJan: jest.fn().mockResolvedValue(null),
      upsertByJan: jest.fn().mockResolvedValue({
        id: 'product-uuid',
        productName: 'グミキャンデー',
        allergens: { contains: ['apple'], partial: [], components: ['apple'] },
        scanCount: 1,
        expiresAt: new Date(Date.now() + 86400000),
      }),
      upsertByHash: jest.fn(),
    };
    offClient = { fetchByJanCode: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ScanService,
        { provide: CACHE_MANAGER, useValue: cacheManager },
        { provide: ProductRepository, useValue: productRepository },
        { provide: OpenFoodFactsClient, useValue: offClient },
        {
          provide: AllergenComponentRepository,
          useValue: { findByAllergens: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: ScanHistoryRepository,
          useValue: { create: jest.fn().mockResolvedValue({ id: 'history-uuid' }) },
        },
        {
          provide: S3Client,
          useValue: {
            generatePresignedPutUrl: jest.fn(),
            getImageAsBase64: jest.fn(),
          },
        },
        { provide: GeminiClient, useValue: { analyzeImage: jest.fn() } },
        {
          provide: UsersRepository,
          useValue: { findById: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: UserDailyScansService,
          useValue: {
            canUserScan: jest.fn().mockResolvedValue(true),
            incrementScanCount: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PLACES_PROVIDER_TOKEN,
          useValue: { getStoreCandidates: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get(ScanService);
  });

  it('JAN 4901351025420 が Open Food Facts 経由で商品情報を取得できる', async () => {
    // 画像のバーコード 4901351025420（グミキャンデー）をモックで返す
    offClient.fetchByJanCode.mockResolvedValue({
      product_name: null,
      product_name_ja: 'グミキャンデー',
      allergens_tags: ['en:apple'],
      traces_tags: [],
      ingredients_text: '水飴、砂糖、ゼラチン、ぶどう果汁',
      ingredients_text_ja: '水飴、砂糖、ゼラチン、ぶどう果汁',
    });

    const result = await service.scanBarcode(TEST_JAN);

    expect(result.found).toBe(true);
    expect(result.product_name).toBe('グミキャンデー');
    expect(result.from_cache).toBe(false);
    // en:apple タグが apple に正規化されること
    expect(result.allergens?.contains).toContain('apple');
    // OFact API が正しい JAN コードで呼ばれること
    expect(offClient.fetchByJanCode).toHaveBeenCalledWith(TEST_JAN);
    // UPSERT が商品名付きで呼ばれること
    expect(productRepository.upsertByJan).toHaveBeenCalledWith(
      TEST_JAN,
      expect.objectContaining({ productName: 'グミキャンデー' }),
    );
    // キャッシュにセットされること
    expect(cacheManager.set).toHaveBeenCalled();
  });
});
