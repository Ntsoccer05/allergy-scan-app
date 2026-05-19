import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { HistoryService } from './history.service';
import { ScanHistoryRepository } from './scan-history.repository';
import type { ScanHistoryRecord } from './scan-history.repository';

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

describe('HistoryService', () => {
  let service: HistoryService;
  let repository: { findByUser: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    repository = {
      findByUser: jest.fn(),
      create: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        HistoryService,
        { provide: ScanHistoryRepository, useValue: repository },
      ],
    }).compile();

    service = module.get(HistoryService);
  });

  describe('getHistory', () => {
    describe('カーソルなし・judgment=all', () => {
      it('20件以下なら items をそのまま返し next_before が null になる', async () => {
        const records = [
          makeRecord(),
          makeRecord({
            id: 'rec-2',
            scannedAt: new Date('2026-01-14T10:00:00.000Z'),
          }),
        ];
        repository.findByUser.mockResolvedValue(records);

        const result = await service.getHistory('user-1', {});

        expect(result.items).toHaveLength(2);
        expect(result.next_before).toBeNull();
        expect(repository.findByUser).toHaveBeenCalledWith('user-1', {
          before: undefined,
          judgment: 'all',
          limit: 20,
        });
      });

      it('21件返却されたとき items が20件になり next_before が ISO8601 文字列になる', async () => {
        const records = Array.from({ length: 21 }, (_, i) =>
          makeRecord({
            id: `rec-${i}`,
            scannedAt: new Date(Date.now() - i * 1000),
          }),
        );
        repository.findByUser.mockResolvedValue(records);

        const result = await service.getHistory('user-1', {});

        expect(result.items).toHaveLength(20);
        expect(result.next_before).not.toBeNull();
        // next_before は ISO8601 形式
        expect(new Date(result.next_before!).toISOString()).toBe(
          result.next_before,
        );
      });
    });

    describe('カーソルあり', () => {
      it('before を Date に変換して findByUser に渡す', async () => {
        repository.findByUser.mockResolvedValue([]);
        const beforeStr = '2026-01-10T00:00:00.000Z';

        await service.getHistory('user-1', { before: beforeStr });

        expect(repository.findByUser).toHaveBeenCalledWith('user-1', {
          before: new Date(beforeStr),
          judgment: 'all',
          limit: 20,
        });
      });
    });

    describe('judgment=ng フィルタ', () => {
      it('judgment=ng として findByUser を呼び、ng レコードのみ返す', async () => {
        const ngRecord = makeRecord({ judgment: 'ng' });
        repository.findByUser.mockResolvedValue([ngRecord]);

        const result = await service.getHistory('user-1', { judgment: 'ng' });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].judgment).toBe('ng');
        expect(repository.findByUser).toHaveBeenCalledWith('user-1', {
          before: undefined,
          judgment: 'ng',
          limit: 20,
        });
      });
    });

    describe('不正な before', () => {
      it('NaN になる before 文字列のとき BadRequestException を throw する', async () => {
        await expect(
          service.getHistory('user-1', { before: 'invalid-date' }),
        ).rejects.toThrow(BadRequestException);
        expect(repository.findByUser).not.toHaveBeenCalled();
      });
    });
  });

  describe('createHistory', () => {
    it('ScanHistoryRepository.create が1回呼ばれ、作成されたレコードを返す', async () => {
      const created = makeRecord({
        id: 'new-uuid',
        judgment: 'ng',
        detected: ['乳'],
      });
      repository.create.mockResolvedValue(created);

      const result = await service.createHistory('user-1', {
        judgment: 'ng',
        detected: ['乳'],
      });

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          judgment: 'ng',
          detected: ['乳'],
        }),
      );
      expect(result.id).toBe('new-uuid');
    });

    it('product_id / product_name / location / thumbnail_url を正しくマッピングして create に渡す', async () => {
      repository.create.mockResolvedValue(makeRecord());

      await service.createHistory('user-1', {
        judgment: 'ok',
        detected: [],
        product_id: 'prod-1',
        product_name: 'テスト商品',
        location: { store_name: 'セブン', lat: 35.6, lng: 139.7 },
        thumbnail_url: 'https://example.com/thumb.jpg',
      });

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        productId: 'prod-1',
        productName: 'テスト商品',
        judgment: 'ok',
        detected: [],
        location: { store_name: 'セブン', lat: 35.6, lng: 139.7 },
        thumbnailUrl: 'https://example.com/thumb.jpg',
      });
    });
  });
});
