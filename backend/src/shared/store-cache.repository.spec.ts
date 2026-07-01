import { StoreCacheRepository, toGridKey } from './store-cache.repository';

describe('toGridKey', () => {
  it('座標からグリッドキーを生成する', () => {
    expect(toGridKey(35.6812, 139.7671)).toBe('3568_13976');
    expect(toGridKey(34.6937, 135.5023)).toBe('3469_13550');
  });
});

describe('StoreCacheRepository', () => {
  const mockPrisma = {
    storeCache: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    storeCacheArea: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    cacheJob: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  let repo: StoreCacheRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new StoreCacheRepository(mockPrisma as any);
  });

  describe('findNearby', () => {
    it('有効期限内のキャッシュから距離順で StoreCandidate[] を返す', async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 86400_000);

      mockPrisma.storeCache.findMany.mockResolvedValue([
        { uid: 'a', name: 'Store A', lat: 35.69, lng: 139.77, address: '東京都新宿区1', genre: 'コンビニ', expiresAt: future },
        { uid: 'b', name: 'Store B', lat: 35.68, lng: 139.76, address: '東京都新宿区2', genre: 'スーパー', expiresAt: future },
      ]);

      const results = await repo.findNearby(35.681, 139.767);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('name');
      expect(results[0]).toHaveProperty('placeId');
      expect(results[0]).toHaveProperty('distanceKm');
    });

    it('空の結果のとき空配列を返す', async () => {
      mockPrisma.storeCache.findMany.mockResolvedValue([]);
      const results = await repo.findNearby(35.681, 139.767);
      expect(results).toEqual([]);
    });
  });

  describe('findArea', () => {
    it('有効なエリア記録があれば true を返す', async () => {
      const future = new Date(Date.now() + 86400_000);
      mockPrisma.storeCacheArea.findUnique.mockResolvedValue({ expiresAt: future });
      expect(await repo.findArea('3568_13976')).toBe(true);
    });

    it('エリア記録がなければ false を返す', async () => {
      mockPrisma.storeCacheArea.findUnique.mockResolvedValue(null);
      expect(await repo.findArea('3568_13976')).toBe(false);
    });

    it('期限切れのエリア記録は false を返す', async () => {
      const past = new Date(Date.now() - 1);
      mockPrisma.storeCacheArea.findUnique.mockResolvedValue({ expiresAt: past });
      expect(await repo.findArea('3568_13976')).toBe(false);
    });
  });

  describe('enqueueJob', () => {
    it('cache_jobs にジョブを作成する', async () => {
      mockPrisma.cacheJob.create.mockResolvedValue({});
      await repo.enqueueJob(35.68, 139.77);
      expect(mockPrisma.cacheJob.create).toHaveBeenCalledWith({
        data: { lat: 35.68, lng: 139.77, status: 'pending' },
      });
    });
  });
});
