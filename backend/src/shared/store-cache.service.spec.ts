import { StoreCacheService } from './store-cache.service';

const makeRepo = () => ({
  findArea: jest.fn(),
  findNearby: jest.fn(),
  upsertRealtime: jest.fn(),
  upsertBatch: jest.fn(),
  enqueueJob: jest.fn(),
  dequeueJob: jest.fn(),
  completeJob: jest.fn(),
  failJob: jest.fn(),
});

const makeYahoo = () => ({
  fetchNearby: jest.fn(),
  fetchAllStores: jest.fn(),
});

describe('StoreCacheService', () => {
  let service: StoreCacheService;
  let repo: ReturnType<typeof makeRepo>;
  let yahoo: ReturnType<typeof makeYahoo>;

  beforeEach(() => {
    repo = makeRepo();
    yahoo = makeYahoo();
    service = new StoreCacheService(repo as any, yahoo as any);
    jest.clearAllMocks();
  });

  describe('getCandidates', () => {
    it('キャッシュヒット時は Yahoo API を呼ばず cacheLoading: false で返す', async () => {
      repo.findArea.mockResolvedValue(true);
      repo.findNearby.mockResolvedValue([
        { name: 'Store A', placeId: 'a', distanceKm: 0.5 },
      ]);

      const result = await service.getCandidates(35.68, 139.77);

      expect(yahoo.fetchNearby).not.toHaveBeenCalled();
      expect(repo.enqueueJob).not.toHaveBeenCalled();
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].name).toBe('Store A');
      expect(result.cacheLoading).toBe(false);
    });

    it('キャッシュミス時は Yahoo API を呼んで upsertRealtime し cacheLoading: true で返す', async () => {
      repo.findArea.mockResolvedValue(false);
      yahoo.fetchNearby.mockResolvedValue([
        { uid: 'b', name: 'Store B', lat: 35.68, lng: 139.77, address: '東京都1-1', genre: 'コンビニ' },
      ]);
      repo.upsertRealtime.mockResolvedValue(undefined);
      repo.findNearby.mockResolvedValue([
        { name: 'Store B', placeId: 'b', distanceKm: 0.2 },
      ]);
      repo.enqueueJob.mockResolvedValue(undefined);

      const result = await service.getCandidates(35.68, 139.77);

      expect(yahoo.fetchNearby).toHaveBeenCalledWith(35.68, 139.77, 20);
      expect(repo.upsertRealtime).toHaveBeenCalled();
      expect(result.candidates[0].name).toBe('Store B');
      expect(result.cacheLoading).toBe(true);
    });

    it('キャッシュミス時は常にジョブをエンキューする', async () => {
      repo.findArea.mockResolvedValue(false);
      yahoo.fetchNearby.mockResolvedValue([]);
      repo.upsertRealtime.mockResolvedValue(undefined);
      repo.findNearby.mockResolvedValue([]);
      repo.enqueueJob.mockResolvedValue(undefined);

      await service.getCandidates(35.68, 139.77);

      expect(repo.enqueueJob).toHaveBeenCalledWith(35.68, 139.77);
    });
  });

  describe('processNextJob', () => {
    it('ジョブがなければ false を返す', async () => {
      repo.dequeueJob.mockResolvedValue(null);
      expect(await service.processNextJob()).toBe(false);
    });

    it('ジョブを処理して completeJob を呼ぶ', async () => {
      repo.dequeueJob.mockResolvedValue({ id: 'job-1', lat: 35.68, lng: 139.77 });
      yahoo.fetchAllStores.mockResolvedValue([
        { uid: 'c', name: 'Store C', lat: 35.68, lng: 139.77, address: '東京都1-1', genre: 'スーパー' },
      ]);
      repo.upsertBatch.mockResolvedValue(undefined);
      repo.completeJob.mockResolvedValue(undefined);

      const result = await service.processNextJob();

      expect(result).toBe(true);
      expect(repo.completeJob).toHaveBeenCalledWith('job-1');
      expect(repo.failJob).not.toHaveBeenCalled();
    });

    it('例外が発生したとき failJob を呼んで false を返す', async () => {
      repo.dequeueJob.mockResolvedValue({ id: 'job-2', lat: 35.68, lng: 139.77 });
      yahoo.fetchAllStores.mockRejectedValue(new Error('API Error'));
      repo.failJob.mockResolvedValue(undefined);

      const result = await service.processNextJob();

      expect(result).toBe(false);
      expect(repo.failJob).toHaveBeenCalledWith('job-2');
    });
  });
});
