import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ScanService } from './scan.service';
import { ProductRepository } from '../products/product.repository';
import { OpenFoodFactsClient } from '../shared/open-food-facts.client';
import { AllergenComponentRepository } from '../allergens/allergen-component.repository';
import { ScanHistoryRepository } from '../history/scan-history.repository';
import { S3Client } from '../shared/s3.client';
import { GeminiClient } from '../shared/gemini.client';
import { UsersRepository } from '../users/users.repository';
import { UserDailyScansService } from '../users/user-daily-scans.service';
import { PLACES_PROVIDER_TOKEN } from '../shared/places.interface';
import type { ProductAllergens } from '../shared/types/db.types';
import type { GeminiOcrResponse } from '../shared/types/gemini.types';

const mockAllergens: ProductAllergens = {
  contains: ['乳'],
  partial: [],
  components: ['カゼイン'],
};

const mockProductRecord = {
  id: 'test-uuid',
  productName: 'テスト商品',
  allergens: mockAllergens,
  scanCount: 3,
  expiresAt: new Date(Date.now() + 86400000),
};

// マジックバイト検証を通過する最小 JPEG の base64（FF D8 FF で始まる）
const VALID_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDA==';

const validGeminiResponse: GeminiOcrResponse = {
  raw_text: '乳、卵、小麦',
  confidence: 'high',
  results: [
    {
      allergen: '乳',
      judgment: '含む',
      detection_type: 'contains',
      detected: ['カゼイン'],
      risk_level: 'high',
      reason: 'カゼインを検出',
    },
  ],
  highlights: [{ text: 'カゼイン', judgment: 'ng' }],
  incomplete: false,
  price: null,
  price_with_tax: null,
  price_confidence: null,
  product_name: null,
};

describe('ScanService.scanBarcode', () => {
  let service: ScanService;
  let cacheManager: { get: jest.Mock; set: jest.Mock };
  let productRepository: {
    findByJan: jest.Mock;
    upsertByJan: jest.Mock;
    upsertByHash: jest.Mock;
  };
  let offClient: { fetchByJanCode: jest.Mock };
  let allergenComponentRepository: { findByAllergens: jest.Mock };
  let scanHistoryRepository: { create: jest.Mock };
  let s3Client: {
    generatePresignedPutUrl: jest.Mock;
    getImageAsBase64: jest.Mock;
  };
  let geminiClient: { analyzeImage: jest.Mock };
  let usersRepository: { findById: jest.Mock };
  let placesClient: { getStoreCandidates: jest.Mock };

  beforeEach(async () => {
    cacheManager = { get: jest.fn(), set: jest.fn() };
    productRepository = {
      findByJan: jest.fn(),
      upsertByJan: jest.fn(),
      upsertByHash: jest.fn(),
    };
    offClient = { fetchByJanCode: jest.fn() };
    allergenComponentRepository = { findByAllergens: jest.fn() };
    scanHistoryRepository = { create: jest.fn() };
    s3Client = {
      generatePresignedPutUrl: jest.fn(),
      getImageAsBase64: jest.fn(),
    };
    geminiClient = { analyzeImage: jest.fn() };
    usersRepository = { findById: jest.fn() };
    placesClient = { getStoreCandidates: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ScanService,
        { provide: CACHE_MANAGER, useValue: cacheManager },
        { provide: ProductRepository, useValue: productRepository },
        { provide: OpenFoodFactsClient, useValue: offClient },
        {
          provide: AllergenComponentRepository,
          useValue: allergenComponentRepository,
        },
        { provide: ScanHistoryRepository, useValue: scanHistoryRepository },
        { provide: S3Client, useValue: s3Client },
        { provide: GeminiClient, useValue: geminiClient },
        { provide: UsersRepository, useValue: usersRepository },
        {
          provide: UserDailyScansService,
          useValue: { canUserScan: jest.fn().mockResolvedValue(true), incrementScanCount: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: PLACES_PROVIDER_TOKEN, useValue: placesClient },
      ],
    }).compile();

    service = module.get(ScanService);
  });

  const JAN = '4901234567890';

  describe('キャッシュヒット', () => {
    it('CacheManager.get の戻り値をそのまま返す。ProductRepository は呼ばない', async () => {
      const cached = {
        found: true,
        product_name: 'キャッシュ商品',
        from_cache: true,
      };
      cacheManager.get.mockResolvedValue(cached);

      const result = await service.scanBarcode(JAN);

      expect(result.from_cache).toBe(true);
      expect(result.found).toBe(true);
      expect(productRepository.findByJan).not.toHaveBeenCalled();
      expect(offClient.fetchByJanCode).not.toHaveBeenCalled();
    });
  });

  describe('DB ヒット（期限内）', () => {
    it('ProductRepository.findByJan の戻り値を返す。OpenFoodFactsClient は呼ばない', async () => {
      cacheManager.get.mockResolvedValue(null);
      productRepository.findByJan.mockResolvedValue(mockProductRecord);

      const result = await service.scanBarcode(JAN);

      expect(result.found).toBe(true);
      expect(result.product_name).toBe('テスト商品');
      expect(offClient.fetchByJanCode).not.toHaveBeenCalled();
      expect(cacheManager.set).toHaveBeenCalled();
    });
  });

  describe('OFF API ヒット', () => {
    it('ProductRepository.upsertByJan が呼ばれ、結果を返す', async () => {
      cacheManager.get.mockResolvedValue(null);
      productRepository.findByJan.mockResolvedValue(null);
      offClient.fetchByJanCode.mockResolvedValue({
        product_name: 'OFF商品',
        allergens_tags: ['en:milk'],
        traces_tags: [],
        ingredients_text: '牛乳、砂糖',
      });
      productRepository.upsertByJan.mockResolvedValue(mockProductRecord);

      const result = await service.scanBarcode(JAN);

      expect(result.found).toBe(true);
      expect(productRepository.upsertByJan).toHaveBeenCalledWith(
        JAN,
        expect.objectContaining({ productName: 'OFF商品' }),
      );
      expect(cacheManager.set).toHaveBeenCalled();
    });
  });

  describe('OFF ヒットだがアレルゲン情報なし（安全設計）', () => {
    it('allergens_tags / traces_tags が空なら found: false を返して OCR にフォールバックさせる', async () => {
      cacheManager.get.mockResolvedValue(null);
      productRepository.findByJan.mockResolvedValue(null);
      // OFF に商品は登録されているがアレルゲン欄が未入力（日本商品で頻発）
      offClient.fetchByJanCode.mockResolvedValue({
        product_name: 'Pure Premium Grape',
        allergens_tags: [],
        traces_tags: [],
        ingredients_text: null,
      });

      const result = await service.scanBarcode(JAN);

      // ⚠️ 未入力を「アレルゲンなし」と解釈すると誤った ✅なし 表示になるため、
      // 安全側に倒して found: false（OCR フォールバック）とする
      expect(result.found).toBe(false);
      expect(productRepository.upsertByJan).not.toHaveBeenCalled();
    });

    it('DB の jan 商品もアレルゲン情報が空なら DB ヒット扱いにしない', async () => {
      cacheManager.get.mockResolvedValue(null);
      productRepository.findByJan.mockResolvedValue({
        ...mockProductRecord,
        allergens: { contains: [], partial: [], components: [] },
      });
      offClient.fetchByJanCode.mockResolvedValue(null);

      const result = await service.scanBarcode(JAN);

      expect(result.found).toBe(false);
    });
  });

  describe('OFF アレルゲンタグの日本語正規化', () => {
    it('英語タグを日本語アレルゲン名に変換し、未知タグは値をそのまま保持する', async () => {
      cacheManager.get.mockResolvedValue(null);
      productRepository.findByJan.mockResolvedValue(null);
      offClient.fetchByJanCode.mockResolvedValue({
        product_name: 'OFF商品',
        // en:crustaceans（甲殻類）は えび・かに の両方に展開する（安全側）
        allergens_tags: ['en:milk', 'en:gluten', 'en:crustaceans', 'en:some-unknown'],
        traces_tags: ['en:peanuts', 'ja:そば'],
        ingredients_text: '牛乳、小麦粉',
      });
      productRepository.upsertByJan.mockResolvedValue(mockProductRecord);

      await service.scanBarcode(JAN);

      expect(productRepository.upsertByJan).toHaveBeenCalledWith(
        JAN,
        expect.objectContaining({
          allergens: expect.objectContaining({
            contains: ['乳', '小麦', 'えび', 'かに', 'some-unknown'],
            partial: ['落花生', 'そば'],
          }),
        }),
      );
    });

    it('en:apple は りんご に正規化される', async () => {
      cacheManager.get.mockResolvedValue(null);
      productRepository.findByJan.mockResolvedValue(null);
      offClient.fetchByJanCode.mockResolvedValue({
        product_name: 'グミ',
        allergens_tags: ['en:apple'],
        traces_tags: [],
        ingredients_text: 'りんご果汁',
      });
      productRepository.upsertByJan.mockResolvedValue(mockProductRecord);

      await service.scanBarcode(JAN);

      expect(productRepository.upsertByJan).toHaveBeenCalledWith(
        JAN,
        expect.objectContaining({
          allergens: expect.objectContaining({ contains: ['りんご'] }),
        }),
      );
    });
  });

  describe('全ミス', () => {
    it('{ found: false } を返す。例外は投げない', async () => {
      cacheManager.get.mockResolvedValue(null);
      productRepository.findByJan.mockResolvedValue(null);
      offClient.fetchByJanCode.mockResolvedValue(null);

      const result = await service.scanBarcode(JAN);

      expect(result.found).toBe(false);
      expect(result.from_cache).toBe(false);
      expect(productRepository.upsertByJan).not.toHaveBeenCalled();
    });
  });
});

describe('ScanService.processOcr', () => {
  let service: ScanService;
  let cacheManager: { get: jest.Mock; set: jest.Mock };
  let productRepository: {
    findByJan: jest.Mock;
    upsertByJan: jest.Mock;
    upsertByHash: jest.Mock;
  };
  let offClient: { fetchByJanCode: jest.Mock };
  let allergenComponentRepository: { findByAllergens: jest.Mock };
  let scanHistoryRepository: { create: jest.Mock };
  let s3Client: {
    generatePresignedPutUrl: jest.Mock;
    getImageAsBase64: jest.Mock;
  };
  let geminiClient: { analyzeImage: jest.Mock };
  let usersRepository: { findById: jest.Mock };
  let placesClient: { getStoreCandidates: jest.Mock };

  beforeEach(async () => {
    cacheManager = { get: jest.fn(), set: jest.fn() };
    productRepository = {
      findByJan: jest.fn(),
      upsertByJan: jest.fn(),
      upsertByHash: jest.fn().mockResolvedValue(mockProductRecord),
    };
    offClient = { fetchByJanCode: jest.fn() };
    allergenComponentRepository = {
      findByAllergens: jest.fn().mockResolvedValue([]),
    };
    scanHistoryRepository = {
      create: jest.fn().mockResolvedValue({ id: 'history-uuid' }),
    };
    s3Client = {
      generatePresignedPutUrl: jest.fn(),
      getImageAsBase64: jest.fn().mockResolvedValue(VALID_JPEG_BASE64),
    };
    geminiClient = {
      analyzeImage: jest.fn().mockResolvedValue(validGeminiResponse),
    };
    usersRepository = { findById: jest.fn().mockResolvedValue(null) };
    placesClient = { getStoreCandidates: jest.fn().mockResolvedValue([]) };

    const module = await Test.createTestingModule({
      providers: [
        ScanService,
        { provide: CACHE_MANAGER, useValue: cacheManager },
        { provide: ProductRepository, useValue: productRepository },
        { provide: OpenFoodFactsClient, useValue: offClient },
        {
          provide: AllergenComponentRepository,
          useValue: allergenComponentRepository,
        },
        { provide: ScanHistoryRepository, useValue: scanHistoryRepository },
        { provide: S3Client, useValue: s3Client },
        { provide: GeminiClient, useValue: geminiClient },
        { provide: UsersRepository, useValue: usersRepository },
        {
          provide: UserDailyScansService,
          useValue: { canUserScan: jest.fn().mockResolvedValue(true), incrementScanCount: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: PLACES_PROVIDER_TOKEN, useValue: placesClient },
      ],
    }).compile();

    service = module.get(ScanService);
  });

  const S3_KEY = 'scan-images/test-uuid.jpg';

  describe('incomplete: true', () => {
    it('BadRequestException を throw する', async () => {
      geminiClient.analyzeImage.mockResolvedValue({
        ...validGeminiResponse,
        incomplete: true,
        confidence: 'high',
      });

      await expect(service.processOcr(S3_KEY, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('confidence: low', () => {
    it('UnprocessableEntityException を throw する', async () => {
      geminiClient.analyzeImage.mockResolvedValue({
        ...validGeminiResponse,
        confidence: 'low',
        incomplete: false,
      });

      await expect(service.processOcr(S3_KEY, 'user-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('S3 取得失敗', () => {
    it('BadRequestException を throw する', async () => {
      s3Client.getImageAsBase64.mockResolvedValue(null);

      await expect(service.processOcr(S3_KEY, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('正常系（confidence: high）', () => {
    it('ScanHistoryRepository.create が呼ばれ、Gemini レスポンスを返す', async () => {
      const result = await service.processOcr(S3_KEY, 'user-1');

      expect(scanHistoryRepository.create).toHaveBeenCalledTimes(1);
      // detected にはアレルゲン名を保存する（成分テキストではない）。
      // 現在のアレルギー設定との照合（履歴の設定追従）に名前一致が必要なため
      expect(scanHistoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: mockProductRecord.id,
          judgment: 'ng',
          detected: ['乳'],
        }),
      );
      expect(result.raw_text).toBe(validGeminiResponse.raw_text);
      expect(result.results[0]?.judgment).toBe(
        validGeminiResponse.results[0]?.judgment,
      );
    });

    it('ProductRepository.upsertByHash が呼ばれる', async () => {
      await service.processOcr(S3_KEY, undefined);

      expect(productRepository.upsertByHash).toHaveBeenCalledTimes(1);
    });

    it('products.allergens にアレルゲン名を保存し、may_contain は contains ではなく partial に分類する', async () => {
      geminiClient.analyzeImage.mockResolvedValue({
        ...validGeminiResponse,
        results: [
          {
            allergen: '乳',
            judgment: '含む',
            detection_type: 'contains',
            detected: ['カゼイン'],
            risk_level: 'high',
            reason: 'カゼインを検出',
          },
          {
            allergen: '小麦',
            judgment: '一部含む',
            detection_type: 'partial',
            detected: ['一部に小麦を含む'],
            risk_level: 'medium',
            reason: '一括表示',
          },
          {
            // ⚠️ 安全設計: may_contain（製造ラインコンタミ）は NG（contains）にしない
            allergen: 'えび',
            judgment: '含む',
            detection_type: 'may_contain',
            detected: ['えびを含む製品と共通の設備で製造'],
            risk_level: 'medium',
            reason: '製造ライン注意書き',
          },
          {
            allergen: 'りんご',
            judgment: 'なし',
            detection_type: 'contains',
            detected: [],
            risk_level: 'ignore',
            reason: '',
          },
        ],
      });

      await service.processOcr(S3_KEY, 'user-1');

      expect(productRepository.upsertByHash).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          allergens: {
            contains: ['乳'],
            partial: ['小麦', 'えび'],
            components: [
              'カゼイン',
              '一部に小麦を含む',
              'えびを含む製品と共通の設備で製造',
            ],
          },
        }),
      );

      // 履歴の detected もアレルゲン名（judgment: なし は含まない）
      expect(scanHistoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ detected: ['乳', '小麦', 'えび'] }),
      );
    });
  });

  describe('fetchEnabledAllergens（UsersRepository 経由）', () => {
    it('userId が指定された場合、UsersRepository.findById が 1 回呼ばれる', async () => {
      usersRepository.findById.mockResolvedValue({
        id: 'user-1',
        allergies: { 乳: { enabled: true, partialAlert: true } },
      });

      await service.processOcr(S3_KEY, 'user-1');

      expect(usersRepository.findById).toHaveBeenCalledTimes(1);
      expect(usersRepository.findById).toHaveBeenCalledWith('user-1');
    });

    it('userId が undefined の場合、UsersRepository.findById を呼ばずに空配列を返す', async () => {
      await service.processOcr(S3_KEY, undefined);

      expect(usersRepository.findById).not.toHaveBeenCalled();
    });
  });

  describe('PlacesClient 連携（店舗候補）', () => {
    const LAT = 35.6762;
    const LNG = 139.6503;

    it('lat/lng なし → getStoreCandidates が呼ばれない', async () => {
      await service.processOcr(S3_KEY, 'user-1');

      expect(placesClient.getStoreCandidates).not.toHaveBeenCalled();
      expect(scanHistoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ location: null }),
      );
    });

    it('候補 0 件 → history.create の location が null になる', async () => {
      placesClient.getStoreCandidates.mockResolvedValue([]);

      await service.processOcr(S3_KEY, 'user-1', LAT, LNG);

      expect(placesClient.getStoreCandidates).toHaveBeenCalledWith(LAT, LNG);
      expect(scanHistoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ location: null }),
      );
    });

    it('候補 1 件 → history.create の location.store_name が候補名になる', async () => {
      placesClient.getStoreCandidates.mockResolvedValue([
        { name: 'セブンイレブン渋谷店', placeId: 'place-1' },
      ]);

      await service.processOcr(S3_KEY, 'user-1', LAT, LNG);

      expect(scanHistoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          location: { store_name: 'セブンイレブン渋谷店', lat: LAT, lng: LNG },
        }),
      );
    });

    it('候補 2 件以上 → history.create の location が null、レスポンスに storeCandidates が含まれる', async () => {
      placesClient.getStoreCandidates.mockResolvedValue([
        { name: 'セブンイレブン渋谷店', placeId: 'place-1' },
        { name: 'ローソン渋谷店', placeId: 'place-2' },
      ]);

      const result = await service.processOcr(S3_KEY, 'user-1', LAT, LNG);

      expect(scanHistoryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ location: null }),
      );
      expect(result.storeCandidates).toHaveLength(2);
      expect(result.storeCandidates?.[0]?.name).toBe('セブンイレブン渋谷店');
    });
  });
});
