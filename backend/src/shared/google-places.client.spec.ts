import { Test } from '@nestjs/testing';
import { GooglePlacesClient } from './google-places.client';

const LAT = 35.6762;
const LNG = 139.6503;

describe('GooglePlacesClient', () => {
  let client: GooglePlacesClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [GooglePlacesClient],
    }).compile();

    client = module.get(GooglePlacesClient);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.GOOGLE_PLACES_API_KEY;
  });

  describe('GOOGLE_PLACES_API_KEY 未設定', () => {
    it('空配列を返す', async () => {
      delete process.env.GOOGLE_PLACES_API_KEY;

      const result = await client.getStoreCandidates(LAT, LNG);

      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('API が正常レスポンス', () => {
    it('StoreCandidate[] を返す', async () => {
      process.env.GOOGLE_PLACES_API_KEY = 'test-key';
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            places: [
              { id: 'place-1', displayName: { text: 'セブンイレブン渋谷店' } },
              { id: 'place-2', displayName: { text: 'ローソン渋谷店' } },
            ],
          }),
      } as unknown as Response);

      const result = await client.getStoreCandidates(LAT, LNG);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: 'セブンイレブン渋谷店', placeId: 'place-1' });
      expect(result[1]).toEqual({ name: 'ローソン渋谷店', placeId: 'place-2' });
    });
  });

  describe('API が HTTP エラー', () => {
    it('空配列を返す（例外なし）', async () => {
      process.env.GOOGLE_PLACES_API_KEY = 'test-key';
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
      } as unknown as Response);

      const result = await client.getStoreCandidates(LAT, LNG);

      expect(result).toEqual([]);
    });
  });

  describe('fetch がネットワークエラーを throw', () => {
    it('空配列を返す（例外なし）', async () => {
      process.env.GOOGLE_PLACES_API_KEY = 'test-key';
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await client.getStoreCandidates(LAT, LNG);

      expect(result).toEqual([]);
    });
  });
});
