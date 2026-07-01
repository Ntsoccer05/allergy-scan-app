import { Test } from '@nestjs/testing';
import { GsiGeocoderClient } from './gsi-geocoder.client';

const LAT = 35.689487;
const LNG = 139.691706;

/** muni.js の実フォーマットを模した中身（GSI.MUNI_ARRAY 行の集合） */
const MUNI_JS_BODY = [
  'GSI.MUNI_ARRAY = {};',
  `GSI.MUNI_ARRAY["1100"] = '1,北海道,1100,札幌市';`,
  `GSI.MUNI_ARRAY["1101"] = '1,北海道,1101,札幌市　中央区';`,
  `GSI.MUNI_ARRAY["13104"] = '13,東京都,13104,新宿区';`,
].join('\n');

/** URL に応じて逆ジオコーダ / muni.js のレスポンスを返す fetch モックを設定する */
const mockFetchByUrl = (
  fetchSpy: jest.SpyInstance,
  geocodeBody: unknown,
  muniBody: string = MUNI_JS_BODY,
): void => {
  fetchSpy.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('mreversegeocoder.gsi.go.jp')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(geocodeBody),
      } as unknown as Response);
    }
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve(muniBody),
    } as unknown as Response);
  });
};

describe('GsiGeocoderClient', () => {
  let client: GsiGeocoderClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [GsiGeocoderClient],
    }).compile();

    client = module.get(GsiGeocoderClient);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('正常系', () => {
    it('muniCd を解決して「都道府県名+市区町村名+lv01Nm」を返す', async () => {
      mockFetchByUrl(fetchSpy, {
        results: { muniCd: '13104', lv01Nm: '西新宿二丁目' },
      });

      const result = await client.reverseGeocode(LAT, LNG);

      expect(result).toBe('東京都新宿区西新宿二丁目');
    });

    it('政令市の区（全角空白入り）は空白を除去して連結する', async () => {
      mockFetchByUrl(fetchSpy, {
        results: { muniCd: '1101', lv01Nm: '北一条西' },
      });

      const result = await client.reverseGeocode(43.06, 141.35);

      expect(result).toBe('北海道札幌市中央区北一条西');
    });

    it('先頭ゼロ付き muniCd（例: 01100）も解決できる', async () => {
      mockFetchByUrl(fetchSpy, {
        results: { muniCd: '01100', lv01Nm: '北五条西' },
      });

      const result = await client.reverseGeocode(43.06, 141.35);

      expect(result).toBe('北海道札幌市北五条西');
    });
  });

  describe('muni.js のメモリキャッシュ', () => {
    it('2 回目の呼び出しでは muni.js を再取得しない', async () => {
      mockFetchByUrl(fetchSpy, {
        results: { muniCd: '13104', lv01Nm: '西新宿二丁目' },
      });

      await client.reverseGeocode(LAT, LNG);
      await client.reverseGeocode(LAT, LNG);

      const muniCalls = fetchSpy.mock.calls.filter(([input]) =>
        String(input).includes('muni.js'),
      );
      expect(muniCalls).toHaveLength(1);
    });
  });

  describe('失敗時は null を返す（例外を投げない）', () => {
    it('逆ジオコーダ API が HTTP エラーを返す → null', async () => {
      fetchSpy.mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('mreversegeocoder.gsi.go.jp')) {
          return Promise.resolve({ ok: false, status: 500 } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(MUNI_JS_BODY),
        } as unknown as Response);
      });

      await expect(client.reverseGeocode(LAT, LNG)).resolves.toBeNull();
    });

    it('fetch がネットワークエラーを throw → null', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      await expect(client.reverseGeocode(LAT, LNG)).resolves.toBeNull();
    });

    it('muniCd が muni.js に存在しない → null', async () => {
      mockFetchByUrl(fetchSpy, {
        results: { muniCd: '99999', lv01Nm: 'どこか' },
      });

      await expect(client.reverseGeocode(LAT, LNG)).resolves.toBeNull();
    });

    it('results が空 → null', async () => {
      mockFetchByUrl(fetchSpy, {});

      await expect(client.reverseGeocode(LAT, LNG)).resolves.toBeNull();
    });

    it('muni.js の取得に失敗 → null', async () => {
      fetchSpy.mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('mreversegeocoder.gsi.go.jp')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({ results: { muniCd: '13104', lv01Nm: '西新宿' } }),
          } as unknown as Response);
        }
        return Promise.resolve({ ok: false, status: 404 } as unknown as Response);
      });

      await expect(client.reverseGeocode(LAT, LNG)).resolves.toBeNull();
    });
  });
});
