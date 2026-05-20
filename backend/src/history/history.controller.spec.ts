import cookieParser from 'cookie-parser';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import type { ScanHistoryRecord } from './scan-history.repository';
import type { HistoryListResult } from './history.service';
import { COOKIE_NAME } from '../users/users.constants';

const makeRecord = (
  overrides: Partial<ScanHistoryRecord> = {},
): ScanHistoryRecord => ({
  id: 'rec-uuid',
  userId: 'user-1',
  productId: null,
  productName: null,
  judgment: 'ok',
  detected: [],
  location: null,
  thumbnailUrl: null,
  scannedAt: new Date('2026-01-15T10:00:00.000Z'),
  ...overrides,
});

const buildApp = async (
  historyServiceMock: Partial<HistoryService>,
): Promise<INestApplication> => {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [HistoryController],
    providers: [
      {
        provide: HistoryService,
        useValue: historyServiceMock,
      },
    ],
  }).compile();

  const app = module.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }),
  );
  await app.init();
  return app;
};

describe('HistoryController', () => {
  describe('GET /history', () => {
    let app: INestApplication;
    const listResult: HistoryListResult = {
      items: [makeRecord()],
      next_before: null,
    };

    beforeEach(async () => {
      app = await buildApp({
        getHistory: jest.fn().mockResolvedValue(listResult),
        createHistory: jest.fn(),
        updateLocation: jest.fn(),
      });
    });

    afterEach(async () => {
      await app.close();
    });

    it('Cookie なしは 400 を返す', async () => {
      const res = await request(app.getHttpServer()).get('/history');
      expect(res.status).toBe(400);
    });

    it('Cookie あり → 200 と items を返す', async () => {
      const res = await request(app.getHttpServer())
        .get('/history')
        .set('Cookie', `${COOKIE_NAME}=user-1`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
    });
  });

  describe('POST /history', () => {
    let app: INestApplication;

    beforeEach(async () => {
      app = await buildApp({
        getHistory: jest.fn(),
        createHistory: jest.fn().mockResolvedValue(makeRecord({ id: 'new-uuid' })),
        updateLocation: jest.fn(),
      });
    });

    afterEach(async () => {
      await app.close();
    });

    it('Cookie なしは 400 を返す', async () => {
      const res = await request(app.getHttpServer())
        .post('/history')
        .send({ judgment: 'ok', detected: [] });
      expect(res.status).toBe(400);
    });

    it('正常系 → 201 とレコードを返す', async () => {
      const res = await request(app.getHttpServer())
        .post('/history')
        .set('Cookie', `${COOKIE_NAME}=user-1`)
        .send({ judgment: 'ok', detected: [] });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id', 'new-uuid');
    });
  });

  describe('PATCH /history/:id', () => {
    const validBody = {
      location: { store_name: 'セブンイレブン渋谷店', lat: 35.6762, lng: 139.6503 },
    };

    describe('正常系（location 更新）', () => {
      let app: INestApplication;
      let updateLocationMock: jest.Mock;

      beforeEach(async () => {
        updateLocationMock = jest.fn().mockResolvedValue(undefined);
        app = await buildApp({
          getHistory: jest.fn(),
          createHistory: jest.fn(),
          updateLocation: updateLocationMock,
        });
      });

      afterEach(async () => {
        await app.close();
      });

      it('正常系: location を更新して 200 を返す', async () => {
        const res = await request(app.getHttpServer())
          .patch('/history/rec-uuid')
          .set('Cookie', `${COOKIE_NAME}=user-1`)
          .send(validBody);

        expect(res.status).toBe(200);
        expect(updateLocationMock).toHaveBeenCalledWith(
          'rec-uuid',
          'user-1',
          validBody.location,
        );
      });
    });

    describe('Cookie なし（未認証）', () => {
      let app: INestApplication;

      beforeEach(async () => {
        app = await buildApp({
          getHistory: jest.fn(),
          createHistory: jest.fn(),
          updateLocation: jest.fn().mockResolvedValue(undefined),
        });
      });

      afterEach(async () => {
        await app.close();
      });

      it('Cookie なし → 401 を返す', async () => {
        const res = await request(app.getHttpServer())
          .patch('/history/rec-uuid')
          .send(validBody);

        expect(res.status).toBe(401);
      });
    });

    describe('他ユーザーの history（403 Forbidden）', () => {
      let app: INestApplication;

      beforeEach(async () => {
        app = await buildApp({
          getHistory: jest.fn(),
          createHistory: jest.fn(),
          updateLocation: jest
            .fn()
            .mockRejectedValue(
              new ForbiddenException({
                message: 'この履歴を更新する権限がありません',
                code: 'FORBIDDEN',
              }),
            ),
        });
      });

      afterEach(async () => {
        await app.close();
      });

      it('他ユーザーの history → 403 を返す', async () => {
        const res = await request(app.getHttpServer())
          .patch('/history/rec-uuid')
          .set('Cookie', `${COOKIE_NAME}=other-user`)
          .send(validBody);

        expect(res.status).toBe(403);
      });
    });
  });
});
