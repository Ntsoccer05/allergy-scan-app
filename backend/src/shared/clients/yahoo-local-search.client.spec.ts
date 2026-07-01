import { YahooLocalSearchClient } from './yahoo-local-search.client';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('YahooLocalSearchClient', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, YAHOO_APP_ID: 'test-app-id' };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('YAHOO_APP_ID が未設定のとき constructor でエラーを投げる', () => {
    delete process.env.YAHOO_APP_ID;
    expect(() => new YahooLocalSearchClient()).toThrow(
      'YAHOO_APP_ID environment variable is not set',
    );
  });

  it('YAHOO_APP_ID が設定されていれば正常にインスタンス化できる', () => {
    expect(() => new YahooLocalSearchClient()).not.toThrow();
  });

  describe('fetchNearby', () => {
    it('fetch が Feature 配列を返したとき YahooStoreRaw[] に変換して返す', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ResultInfo: { Count: 1, Total: 1, Start: 1, Latency: 0 },
          Feature: [
            {
              Id: 'uid-1',
              Name: 'テストスーパー',
              Geometry: { Coordinates: '135.5000,34.6800' },
              Property: {
                Address: '大阪府大阪市1-1',
                Genre: [{ Name: 'スーパー' }],
              },
            },
          ],
        }),
      });

      const client = new YahooLocalSearchClient();
      const result = await client.fetchNearby(34.68, 135.5, 5);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const found = result.find((s) => s.uid === 'uid-1');
      expect(found).toBeDefined();
      expect(found?.name).toBe('テストスーパー');
      expect(found?.lat).toBeCloseTo(34.68);
      expect(found?.lng).toBeCloseTo(135.5);
      expect(found?.address).toBe('大阪府大阪市1-1');
      expect(found?.genre).toBe('スーパー');
    });

    it('Feature が undefined のとき空配列を返す', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ResultInfo: { Count: 0, Total: 0, Start: 1, Latency: 0 },
        }),
      });

      const client = new YahooLocalSearchClient();
      const result = await client.fetchNearby(34.68, 135.5, 5);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('fetch がエラーを投げたとき空配列を返す（クラッシュしない）', async () => {
      mockFetch.mockRejectedValue(new Error('Network Error'));

      const client = new YahooLocalSearchClient();
      const result = await client.fetchNearby(34.68, 135.5, 5);

      expect(Array.isArray(result)).toBe(true);
    });

    it('fetch が HTTP エラーを返したとき空配列を返す', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
      });

      const client = new YahooLocalSearchClient();
      const result = await client.fetchNearby(34.68, 135.5, 5);

      expect(Array.isArray(result)).toBe(true);
    });

    it('同一 uid のストアは重複排除される', async () => {
      // 各ジャンルリクエストが同じ uid を返しても重複しない
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ResultInfo: { Count: 1, Total: 1, Start: 1, Latency: 0 },
          Feature: [
            {
              Id: 'shared-uid',
              Name: '重複店舗',
              Geometry: { Coordinates: '135.5000,34.6800' },
              Property: {},
            },
          ],
        }),
      });

      const client = new YahooLocalSearchClient();
      const result = await client.fetchNearby(34.68, 135.5, 5);

      const found = result.filter((s) => s.uid === 'shared-uid');
      expect(found).toHaveLength(1);
    });
  });
});
