import { Test } from '@nestjs/testing';
import { OverpassPlacesClient } from './overpass-places.client';

const LAT = 35.6762;
const LNG = 139.6503;

describe('OverpassPlacesClient', () => {
  let client: OverpassPlacesClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [OverpassPlacesClient],
    }).compile();

    client = module.get(OverpassPlacesClient);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('正常レスポンス（elements に tags.name あり）', () => {
    it('StoreCandidate[] を返す', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            elements: [
              { id: 12345, tags: { name: 'セブンイレブン渋谷店', shop: 'convenience' } },
              { id: 67890, tags: { name: 'ローソン渋谷店', shop: 'convenience' } },
            ],
          }),
      } as unknown as Response);

      const result = await client.getStoreCandidates(LAT, LNG);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: 'セブンイレブン渋谷店', placeId: '12345' });
      expect(result[1]).toEqual({ name: 'ローソン渋谷店', placeId: '67890' });
    });
  });

  describe('elements が空配列', () => {
    it('[] を返す', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      } as unknown as Response);

      const result = await client.getStoreCandidates(LAT, LNG);

      expect(result).toEqual([]);
    });
  });

  describe('HTTP エラー（500）', () => {
    it('[] を返す（例外なし）', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
      } as unknown as Response);

      const result = await client.getStoreCandidates(LAT, LNG);

      expect(result).toEqual([]);
    });
  });

  describe('fetch がネットワークエラーを throw', () => {
    it('[] を返す（例外なし）', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await client.getStoreCandidates(LAT, LNG);

      expect(result).toEqual([]);
    });
  });

  describe('tags.name がない要素が含まれる', () => {
    it('name ありの要素のみを返す', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            elements: [
              { id: 11111, tags: { name: 'セブンイレブン渋谷店', shop: 'convenience' } },
              { id: 22222, tags: { shop: 'supermarket' } }, // name なし
              { id: 33333, tags: {} }, // tags.name なし
            ],
          }),
      } as unknown as Response);

      const result = await client.getStoreCandidates(LAT, LNG);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ name: 'セブンイレブン渋谷店', placeId: '11111' });
    });
  });
});
