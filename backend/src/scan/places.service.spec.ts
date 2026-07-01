import { Test } from '@nestjs/testing';
import { PlacesService } from './places.service';
import { GsiGeocoderClient } from '../shared/clients/gsi-geocoder.client';
import { StoreCacheService } from '../shared/store-cache.service';

const LAT = 35.6762;
const LNG = 139.6503;

const MOCK_CANDIDATES = [
  { name: 'セブン-イレブン渋谷道玄坂店', placeId: 'uid-001', address: '東京都渋谷区道玄坂1-1', distanceKm: 0.1 },
];

describe('PlacesService', () => {
  let service: PlacesService;
  let gsiGeocoder: { reverseGeocode: jest.Mock };
  let storeCacheService: { getCandidates: jest.Mock };

  beforeEach(async () => {
    gsiGeocoder = { reverseGeocode: jest.fn().mockResolvedValue(null) };
    storeCacheService = { getCandidates: jest.fn().mockResolvedValue([]) };

    const module = await Test.createTestingModule({
      providers: [
        PlacesService,
        { provide: GsiGeocoderClient, useValue: gsiGeocoder },
        { provide: StoreCacheService, useValue: storeCacheService },
      ],
    }).compile();

    service = module.get(PlacesService);
  });

  it('住所と店舗候補を並列取得して返す', async () => {
    gsiGeocoder.reverseGeocode.mockResolvedValue('東京都渋谷区道玄坂一丁目');
    storeCacheService.getCandidates.mockResolvedValue(MOCK_CANDIDATES);

    const result = await service.getCandidates(LAT, LNG);

    expect(result).toEqual({
      address: '東京都渋谷区道玄坂一丁目',
      candidates: MOCK_CANDIDATES,
    });
    expect(gsiGeocoder.reverseGeocode).toHaveBeenCalledWith(LAT, LNG);
    expect(storeCacheService.getCandidates).toHaveBeenCalledWith(LAT, LNG);
  });

  it('住所取得に失敗した場合は address: null を返し、candidates は StoreCacheService の結果を返す', async () => {
    storeCacheService.getCandidates.mockResolvedValue(MOCK_CANDIDATES);

    const result = await service.getCandidates(LAT, LNG);

    expect(result).toEqual({ address: null, candidates: MOCK_CANDIDATES });
  });

  it('StoreCacheService がキャッシュミスの場合は candidates: [] を返す', async () => {
    gsiGeocoder.reverseGeocode.mockResolvedValue('東京都渋谷区道玄坂一丁目');

    const result = await service.getCandidates(LAT, LNG);

    expect(result).toEqual({ address: '東京都渋谷区道玄坂一丁目', candidates: [] });
  });
});
