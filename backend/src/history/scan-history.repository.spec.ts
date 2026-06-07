import { Test } from '@nestjs/testing';
import { ScanHistoryRepository } from './scan-history.repository';
import { PrismaService } from '../prisma/prisma.service';

const makePrismaRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'rec-uuid',
  userId: 'user-1',
  productId: null,
  productName: null,
  judgment: 'ok',
  detected: [],
  location: null,
  thumbnailUrl: null,
  isPublic: false,
  scannedAt: new Date('2026-01-15T10:00:00.000Z'),
  ...overrides,
});

describe('ScanHistoryRepository.findByUser', () => {
  let repository: ScanHistoryRepository;
  let prisma: {
    scanHistory: {
      findMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      scanHistory: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        ScanHistoryRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = module.get(ScanHistoryRepository);
  });

  describe('before なし', () => {
    it('scannedAt DESC 順で limit+1 件を取得するクエリが呼ばれる', async () => {
      const records = [makePrismaRecord()];
      prisma.scanHistory.findMany.mockResolvedValue(records);

      await repository.findByUser('user-1', { limit: 20 });

      expect(prisma.scanHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          orderBy: { scannedAt: 'desc' },
          take: 21,
        }),
      );
    });

    it('返却レコードが ScanHistoryRecord 型に変換される', async () => {
      prisma.scanHistory.findMany.mockResolvedValue([makePrismaRecord()]);

      const result = await repository.findByUser('user-1', { limit: 20 });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('rec-uuid');
      expect(result[0].detected).toEqual([]);
    });
  });

  describe('before あり', () => {
    it('scannedAt < before の条件が where 句に含まれる', async () => {
      prisma.scanHistory.findMany.mockResolvedValue([]);
      const before = new Date('2026-01-10T00:00:00.000Z');

      await repository.findByUser('user-1', { before, limit: 20 });

      expect(prisma.scanHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            scannedAt: { lt: before },
          },
        }),
      );
    });
  });

  describe('judgment フィルタ', () => {
    it('judgment が "all" でないとき where 句に judgment 条件が含まれる', async () => {
      prisma.scanHistory.findMany.mockResolvedValue([]);

      await repository.findByUser('user-1', { judgment: 'ng', limit: 20 });

      expect(prisma.scanHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', judgment: 'ng' },
        }),
      );
    });

    it('judgment が "all" のとき where 句に judgment 条件が含まれない', async () => {
      prisma.scanHistory.findMany.mockResolvedValue([]);

      await repository.findByUser('user-1', { judgment: 'all', limit: 20 });

      const callArgs = prisma.scanHistory.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('judgment');
    });

    it('judgment が undefined のとき where 句に judgment 条件が含まれない', async () => {
      prisma.scanHistory.findMany.mockResolvedValue([]);

      await repository.findByUser('user-1', { limit: 20 });

      const callArgs = prisma.scanHistory.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('judgment');
    });
  });
});

describe('ScanHistoryRepository.update', () => {
  let repository: ScanHistoryRepository;
  let prisma: {
    scanHistory: {
      findMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      scanHistory: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        ScanHistoryRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = module.get(ScanHistoryRepository);
  });

  it('正常系: productName・memo を指定すると prisma.scanHistory.update が呼ばれる', async () => {
    prisma.scanHistory.update.mockResolvedValue(undefined);

    await repository.update('rec-uuid', {
      productName: '新商品名',
      memo: 'テストメモ',
    });

    expect(prisma.scanHistory.update).toHaveBeenCalledWith({
      where: { id: 'rec-uuid' },
      data: expect.objectContaining({
        productName: '新商品名',
        memo: 'テストメモ',
      }),
    });
  });
});

describe('ScanHistoryRepository.deleteById', () => {
  let repository: ScanHistoryRepository;
  let prisma: {
    scanHistory: {
      findMany: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      scanHistory: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        ScanHistoryRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = module.get(ScanHistoryRepository);
  });

  it('正常系: prisma.scanHistory.delete が { where: { id } } で呼ばれる', async () => {
    prisma.scanHistory.delete.mockResolvedValue(undefined);

    await repository.deleteById('rec-uuid');

    expect(prisma.scanHistory.delete).toHaveBeenCalledWith({
      where: { id: 'rec-uuid' },
    });
  });
});
