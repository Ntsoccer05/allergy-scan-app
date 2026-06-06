import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import type { ScanHistoryRecord } from './scan-history.repository';
import type { HistoryListResult } from './history.service';
import type { SupabaseJwtPayload } from '../auth/types/supabase-jwt.types';

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
  memo: null,
  scannedAt: new Date('2026-01-15T10:00:00.000Z'),
  ...overrides,
});

type AuthRequest = Request & { user?: SupabaseJwtPayload };

/** テスト用ミドルウェア: X-Test-User-Id ヘッダーを req.user.sub にマップする。 */
const testAuthMiddleware = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const userId = req.headers['x-test-user-id'] as string | undefined;
  if (userId) {
    req.user = {
      sub: userId,
      email: 'test@example.com',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      iat: 0,
      exp: 0,
    } as SupabaseJwtPayload;
  }
  next();
};

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
  app.use(testAuthMiddleware);
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
        updateHistory: jest.fn(),
        deleteHistory: jest.fn(),
      });
    });

    afterEach(async () => {
      await app.close();
    });

    it('認証ヘッダーあり → 200 と items を返す', async () => {
      const res = await request(app.getHttpServer())
        .get('/history')
        .set('X-Test-User-Id', 'user-1');
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
        updateHistory: jest.fn(),
        deleteHistory: jest.fn(),
      });
    });

    afterEach(async () => {
      await app.close();
    });

    it('正常系 → 201 とレコードを返す', async () => {
      const res = await request(app.getHttpServer())
        .post('/history')
        .set('X-Test-User-Id', 'user-1')
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
      let updateHistoryMock: jest.Mock;

      beforeEach(async () => {
        updateHistoryMock = jest.fn().mockResolvedValue(undefined);
        app = await buildApp({
          getHistory: jest.fn(),
          createHistory: jest.fn(),
          updateHistory: updateHistoryMock,
          deleteHistory: jest.fn(),
        });
      });

      afterEach(async () => {
        await app.close();
      });

      it('正常系: location を更新して 200 を返す', async () => {
        const res = await request(app.getHttpServer())
          .patch('/history/rec-uuid')
          .set('X-Test-User-Id', 'user-1')
          .send(validBody);

        expect(res.status).toBe(200);
        expect(updateHistoryMock).toHaveBeenCalledWith(
          'rec-uuid',
          'user-1',
          expect.objectContaining({ location: validBody.location }),
        );
      });
    });

    describe('他ユーザーの history（403 Forbidden）', () => {
      let app: INestApplication;

      beforeEach(async () => {
        app = await buildApp({
          getHistory: jest.fn(),
          createHistory: jest.fn(),
          updateHistory: jest
            .fn()
            .mockRejectedValue(
              new ForbiddenException({
                message: 'この履歴を更新する権限がありません',
                code: 'FORBIDDEN',
              }),
            ),
          deleteHistory: jest.fn(),
        });
      });

      afterEach(async () => {
        await app.close();
      });

      it('他ユーザーの history → 403 を返す', async () => {
        const res = await request(app.getHttpServer())
          .patch('/history/rec-uuid')
          .set('X-Test-User-Id', 'other-user')
          .send(validBody);

        expect(res.status).toBe(403);
      });
    });
  });

  describe('DELETE /history/:id', () => {
    describe('正常系', () => {
      let app: INestApplication;
      let deleteHistoryMock: jest.Mock;

      beforeEach(async () => {
        deleteHistoryMock = jest.fn().mockResolvedValue(undefined);
        app = await buildApp({
          getHistory: jest.fn(),
          createHistory: jest.fn(),
          updateHistory: jest.fn(),
          deleteHistory: deleteHistoryMock,
        });
      });

      afterEach(async () => {
        await app.close();
      });

      it('正常系: 削除して 204 を返す', async () => {
        const res = await request(app.getHttpServer())
          .delete('/history/rec-uuid')
          .set('X-Test-User-Id', 'user-1');

        expect(res.status).toBe(204);
        expect(deleteHistoryMock).toHaveBeenCalledWith('rec-uuid', 'user-1');
      });
    });
  });
});
