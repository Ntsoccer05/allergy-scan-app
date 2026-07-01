import { Test, TestingModule } from '@nestjs/testing'
import { InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { RoutingService } from './routing.service'

const mockOsrmResponse = {
  code: 'Ok',
  routes: [{
    geometry: { type: 'LineString', coordinates: [[139.7, 35.6], [139.71, 35.61]] },
    legs: [{ distance: 850, duration: 612 }],
  }],
}

const mockOrsResponse = {
  features: [{
    geometry: { type: 'LineString', coordinates: [[139.7, 35.6], [139.71, 35.61]] },
    properties: { summary: { distance: 850, duration: 612 } },
  }],
}

describe('RoutingService', () => {
  let service: RoutingService
  let originalProvider: string | undefined
  let originalOsrmUrl: string | undefined

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoutingService],
    }).compile()
    service = module.get<RoutingService>(RoutingService)
    originalProvider = process.env.ROUTING_PROVIDER
    originalOsrmUrl = process.env.ROUTING_OSRM_URL
  })

  afterEach(() => {
    process.env.ROUTING_PROVIDER = originalProvider
    process.env.ROUTING_OSRM_URL = originalOsrmUrl
    jest.restoreAllMocks()
  })

  describe('OSRM プロバイダー（デフォルト）', () => {
    it('walking モードで OSRM を呼び RouteResponse を返す', async () => {
      process.env.ROUTING_PROVIDER = 'osrm'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockOsrmResponse,
      } as Response)

      const result = await service.getRoute(35.6, 139.7, 35.61, 139.71, 'walking')

      expect(result.distance_m).toBe(850)
      expect(result.duration_sec).toBe(612)
      expect(result.geometry.type).toBe('LineString')
      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls[0][0]).toContain('/walking/')
    })

    it('cycling モードで OSRM cycling プロファイルを使う', async () => {
      process.env.ROUTING_PROVIDER = 'osrm'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockOsrmResponse,
      } as Response)

      await service.getRoute(35.6, 139.7, 35.61, 139.71, 'cycling')

      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls[0][0]).toContain('/cycling/')
    })

    it('driving モードで OSRM driving プロファイルを使う', async () => {
      process.env.ROUTING_PROVIDER = 'osrm'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockOsrmResponse,
      } as Response)

      await service.getRoute(35.6, 139.7, 35.61, 139.71, 'driving')

      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls[0][0]).toContain('/driving/')
    })

    it('OSRM がルートなしを返したとき NotFoundException を投げる', async () => {
      process.env.ROUTING_PROVIDER = 'osrm'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 'Ok', routes: [] }),
      } as Response)

      await expect(service.getRoute(35.6, 139.7, 35.61, 139.71, 'walking'))
        .rejects.toThrow(NotFoundException)
    })

    it('OSRM が 500 を返したとき InternalServerErrorException を投げる', async () => {
      process.env.ROUTING_PROVIDER = 'osrm'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false, status: 500 } as Response)

      await expect(service.getRoute(35.6, 139.7, 35.61, 139.71, 'walking'))
        .rejects.toThrow(InternalServerErrorException)
    })
  })

  describe('ORS プロバイダー', () => {
    it('walking モードで ORS foot-walking プロファイルを使う', async () => {
      process.env.ROUTING_PROVIDER = 'ors'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockOrsResponse,
      } as Response)

      const result = await service.getRoute(35.6, 139.7, 35.61, 139.71, 'walking')

      expect(result.distance_m).toBe(850)
      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls[0][0]).toContain('foot-walking')
    })

    it('cycling モードで ORS cycling-regular プロファイルを使う', async () => {
      process.env.ROUTING_PROVIDER = 'ors'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockOrsResponse,
      } as Response)

      await service.getRoute(35.6, 139.7, 35.61, 139.71, 'cycling')

      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls[0][0]).toContain('cycling-regular')
    })

    it('driving モードで ORS driving-car プロファイルを使う', async () => {
      process.env.ROUTING_PROVIDER = 'ors'
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockOrsResponse,
      } as Response)

      await service.getRoute(35.6, 139.7, 35.61, 139.71, 'driving')

      const calls = (global.fetch as jest.Mock).mock.calls
      expect(calls[0][0]).toContain('driving-car')
    })
  })
})
