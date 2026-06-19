import { Test } from '@nestjs/testing';
import { PlacesService } from './places.service';
import { GsiGeocoderClient } from '../shared/gsi-geocoder.client';
import { PLACES_PROVIDER_TOKEN } from '../shared/places.interface';

const LAT = 35.6762;
const LNG = 139.6503;

describe('PlacesService', () => {
  let service: PlacesService;
  let placesClient: { getStoreCandidates: jest.Mock };
  let gsiGeocoder: { reverseGeocode: jest.Mock };

  beforeEach(async () => {
    placesClient = { getStoreCandidates: jest.fn().mockResolvedValue([]) };
    gsiGeocoder = { reverseGeocode: jest.fn().mockResolvedValue(null) };

    const module = await Test.createTestingModule({
      providers: [
        PlacesService,
        { provide: PLACES_PROVIDER_TOKEN, useValue: placesClient },
        { provide: GsiGeocoderClient, useValue: gsiGeocoder },
      ],
    }).compile();

    service = module.get(PlacesService);
  });

  it('住所と施設候補を並列取得して返す', async () => {
    gsiGeocoder.reverseGeocode.mockResolvedValue('東京都渋谷区道玄坂一丁目');
    placesClient.getStoreCandidates.mockResolvedValue([
      { name: 'セブンイレブン渋谷店', placeId: 'place-1' },
    ]);

    const result = await service.getCandidates(LAT, LNG);

    expect(result).toEqual({
      address: '東京都渋谷区道玄坂一丁目',
      candidates: [{ name: 'セブンイレブン渋谷店', placeId: 'place-1' }],
    });
    expect(gsiGeocoder.reverseGeocode).toHaveBeenCalledWith(LAT, LNG);
    expect(placesClient.getStoreCandidates).toHaveBeenCalledWith(LAT, LNG);
  });

  it('両方とも取得できなかった場合は address: null / candidates: [] を返す（例外なし）', async () => {
    const result = await service.getCandidates(LAT, LNG);

    expect(result).toEqual({ address: null, candidates: [] });
  });
});
