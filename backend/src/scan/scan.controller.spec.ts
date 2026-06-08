import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import {
  ThrottlerModule,
  ThrottlerGuard,
  ThrottlerStorage,
  ThrottlerModuleOptions,
  getStorageToken,
} from '@nestjs/throttler';
import request from 'supertest';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';
import { DailyScanLimitGuard } from './daily-scan-limit.guard';
import { UserDailyScansService } from '../users/user-daily-scans.service';
import { ThrottlerExceptionFilter } from '../shared/throttler-exception.filter';
import {
  THROTTLE_OCR_TTL,
  THROTTLE_OCR_LIMIT,
  THROTTLE_BARCODE_TTL,
  THROTTLE_BARCODE_LIMIT,
} from '../shared/throttler.constants';
import type { GeminiOcrResponse } from '../shared/types/gemini.types';

const validOcrResponse: GeminiOcrResponse = {
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

/**
 * テスト用 ThrottlerGuard: IP ではなく固定キー "test-client" でトラッキングする。
 * 同一テスト内の全リクエストが同一カウンターに集計されるようにする。
 */
class TestThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(): Promise<string> {
    return Promise.resolve('test-client');
  }
}

const buildApp = async (
  ttl: number,
  limit: number,
): Promise<{ app: INestApplication; storage: ThrottlerStorage }> => {
  const scanServiceMock = {
    processOcr: jest.fn().mockResolvedValue(validOcrResponse),
    scanBarcode: jest.fn().mockResolvedValue({
      found: true,
      product_name: '商品A',
      from_cache: false,
    }),
    getPresignedUrl: jest
      .fn()
      .mockResolvedValue({ url: 'https://s3.example.com', s3_key: 'key' }),
  };

  const throttlerOptions: ThrottlerModuleOptions = [{ ttl, limit }];

  const module: TestingModule = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot(throttlerOptions)],
    controllers: [ScanController],
    providers: [
      { provide: ScanService, useValue: scanServiceMock },
      {
        provide: UserDailyScansService,
        useValue: {
          getRemainingScans: jest.fn().mockResolvedValue({ used: 3, limit: 10, remaining: 7 }),
        },
      },
      {
        provide: APP_GUARD,
        useFactory: (
          options: ThrottlerModuleOptions,
          storage: ThrottlerStorage,
          reflector: Reflector,
        ) => new TestThrottlerGuard(options, storage, reflector),
        inject: ['THROTTLER:MODULE_OPTIONS', getStorageToken(), Reflector],
      },
      {
        provide: APP_FILTER,
        useClass: ThrottlerExceptionFilter,
      },
    ],
  })
    .overrideGuard(DailyScanLimitGuard)
    .useValue({ canActivate: jest.fn().mockReturnValue(true) })
    .compile();

  const app = module.createNestApplication();
  await app.init();
  const storage = module.get<ThrottlerStorage>(getStorageToken());
  return { app, storage };
};

describe('ScanController スロットリング', () => {
  describe('POST /scan/ocr — Gemini API コスト保護（重点）', () => {
    let app: INestApplication;
    let storage: ThrottlerStorage;

    beforeEach(async () => {
      ({ app, storage } = await buildApp(THROTTLE_OCR_TTL, THROTTLE_OCR_LIMIT));
    });

    afterEach(async () => {
      await app.close();
    });

    it('シナリオ1: 制限内（5回目）のリクエストは HTTP 200 を返す', async () => {
      for (let i = 0; i < THROTTLE_OCR_LIMIT - 1; i++) {
        await request(app.getHttpServer())
          .post('/scan/ocr')
          .send({ s3_key: 'test.jpg' });
      }
      const res = await request(app.getHttpServer())
        .post('/scan/ocr')
        .send({ s3_key: 'test.jpg' });

      expect(res.status).toBe(200);
    });

    it('シナリオ2: 制限超過（6回目）のリクエストは HTTP 429 を返す', async () => {
      for (let i = 0; i < THROTTLE_OCR_LIMIT; i++) {
        await request(app.getHttpServer())
          .post('/scan/ocr')
          .send({ s3_key: 'test.jpg' });
      }
      const res = await request(app.getHttpServer())
        .post('/scan/ocr')
        .send({ s3_key: 'test.jpg' });

      expect(res.status).toBe(429);
    });

    it('シナリオ3: 429 レスポンスボディに code: "TOO_MANY_REQUESTS" が含まれる', async () => {
      for (let i = 0; i < THROTTLE_OCR_LIMIT; i++) {
        await request(app.getHttpServer())
          .post('/scan/ocr')
          .send({ s3_key: 'test.jpg' });
      }
      const res = await request(app.getHttpServer())
        .post('/scan/ocr')
        .send({ s3_key: 'test.jpg' });

      expect(res.body).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    });

    it('シナリオ4: 429 レスポンスボディのメッセージが日本語である', async () => {
      for (let i = 0; i < THROTTLE_OCR_LIMIT; i++) {
        await request(app.getHttpServer())
          .post('/scan/ocr')
          .send({ s3_key: 'test.jpg' });
      }
      const res = await request(app.getHttpServer())
        .post('/scan/ocr')
        .send({ s3_key: 'test.jpg' });

      const body = res.body as { message: string };
      expect(body.message).toBe(
        'リクエストが多すぎます。しばらく待ってから再試行してください',
      );
    });

    it('シナリオ5: TTL リセット後は再びリクエストが通る', async () => {
      for (let i = 0; i < THROTTLE_OCR_LIMIT; i++) {
        await request(app.getHttpServer())
          .post('/scan/ocr')
          .send({ s3_key: 'test.jpg' });
      }

      // ThrottlerStorageService の内部 Map をクリアして TTL リセットを再現する
      const storageAsService = storage as unknown as {
        _storage: Map<string, unknown>;
      };
      storageAsService._storage.clear();

      const res = await request(app.getHttpServer())
        .post('/scan/ocr')
        .send({ s3_key: 'test.jpg' });

      expect(res.status).toBe(200);
    });

    it('シナリオ6: 連続バースト（10回）で 6回目以降は全て 429 になる', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 10; i++) {
        const res = await request(app.getHttpServer())
          .post('/scan/ocr')
          .send({ s3_key: 'test.jpg' });
        statuses.push(res.status);
      }

      for (let i = 0; i < THROTTLE_OCR_LIMIT; i++) {
        expect(statuses[i]).toBe(200);
      }
      for (let i = THROTTLE_OCR_LIMIT; i < 10; i++) {
        expect(statuses[i]).toBe(429);
      }
    });
  });

  describe('POST /scan/ocr vs POST /scan/barcode — カウンター独立性', () => {
    let app: INestApplication;

    beforeEach(async () => {
      // barcode 制限（30回）内で ocr カウンターが影響を受けないことを確認するために
      // barcode 用 TTL/Limit でモジュールを構築する
      ({ app } = await buildApp(THROTTLE_BARCODE_TTL, THROTTLE_BARCODE_LIMIT));
    });

    afterEach(async () => {
      await app.close();
    });

    it('シナリオ7: barcode を30回叩いても ocr は制限を超えない（ocr カウントは barcode と独立）', async () => {
      for (let i = 0; i < THROTTLE_BARCODE_LIMIT; i++) {
        await request(app.getHttpServer())
          .post('/scan/barcode')
          .send({ jan_code: '4901234567890' });
      }

      // ocr は別エンドポイント・別カウンターなので barcode のカウントに影響されない
      for (let i = 0; i < THROTTLE_OCR_LIMIT - 1; i++) {
        await request(app.getHttpServer())
          .post('/scan/ocr')
          .send({ s3_key: 'test.jpg' });
      }

      const res = await request(app.getHttpServer())
        .post('/scan/ocr')
        .send({ s3_key: 'test.jpg' });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /scan/barcode', () => {
    let app: INestApplication;

    beforeEach(async () => {
      ({ app } = await buildApp(THROTTLE_BARCODE_TTL, THROTTLE_BARCODE_LIMIT));
    });

    afterEach(async () => {
      await app.close();
    });

    it('シナリオ8: 制限内（30回目）のリクエストは HTTP 200 を返す', async () => {
      for (let i = 0; i < THROTTLE_BARCODE_LIMIT - 1; i++) {
        await request(app.getHttpServer())
          .post('/scan/barcode')
          .send({ jan_code: '4901234567890' });
      }
      const res = await request(app.getHttpServer())
        .post('/scan/barcode')
        .send({ jan_code: '4901234567890' });

      expect(res.status).toBe(200);
    });

    it('シナリオ9: 制限超過（31回目）は HTTP 429 と code: "TOO_MANY_REQUESTS" を返す', async () => {
      for (let i = 0; i < THROTTLE_BARCODE_LIMIT; i++) {
        await request(app.getHttpServer())
          .post('/scan/barcode')
          .send({ jan_code: '4901234567890' });
      }
      const res = await request(app.getHttpServer())
        .post('/scan/barcode')
        .send({ jan_code: '4901234567890' });

      expect(res.status).toBe(429);
      expect(res.body).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    });
  });

  describe('429 レスポンス形式（共通）', () => {
    let app: INestApplication;

    beforeEach(async () => {
      ({ app } = await buildApp(THROTTLE_OCR_TTL, THROTTLE_OCR_LIMIT));
    });

    afterEach(async () => {
      await app.close();
    });

    it('シナリオ10: 429 レスポンスの Content-Type が application/json である', async () => {
      for (let i = 0; i < THROTTLE_OCR_LIMIT; i++) {
        await request(app.getHttpServer())
          .post('/scan/ocr')
          .send({ s3_key: 'test.jpg' });
      }
      const res = await request(app.getHttpServer())
        .post('/scan/ocr')
        .send({ s3_key: 'test.jpg' });

      expect(res.status).toBe(429);
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });
  });
});
