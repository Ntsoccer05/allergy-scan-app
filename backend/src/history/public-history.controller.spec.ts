import { Test } from '@nestjs/testing'
import { PublicHistoryController } from './public-history.controller'
import { HistoryService } from './history.service'

const mockService = {
  getPublicHistory: jest.fn(),
  getPublicHistoryDigest: jest.fn(),
}

describe('PublicHistoryController', () => {
  let controller: PublicHistoryController

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PublicHistoryController],
      providers: [{ provide: HistoryService, useValue: mockService }],
    }).compile()
    controller = module.get(PublicHistoryController)
  })

  afterEach(() => jest.clearAllMocks())

  describe('GET /public/history', () => {
    it('should call getPublicHistory with limit=20 when no params', async () => {
      mockService.getPublicHistory.mockResolvedValue({ items: [], next_before: null })
      const result = await controller.getPublicHistory({})
      expect(result).toEqual({ items: [], next_before: null })
      expect(mockService.getPublicHistory).toHaveBeenCalledWith(20, undefined)
    })

    it('should pass before date when provided', async () => {
      mockService.getPublicHistory.mockResolvedValue({ items: [], next_before: null })
      await controller.getPublicHistory({ before: '2024-01-01T00:00:00.000Z' })
      expect(mockService.getPublicHistory).toHaveBeenCalledWith(
        20,
        new Date('2024-01-01T00:00:00.000Z'),
      )
    })
  })

  describe('GET /public/history/digest', () => {
    it('should call getPublicHistoryDigest and return result', async () => {
      const digest = { count: 42, last_updated_at: new Date('2024-01-01') }
      mockService.getPublicHistoryDigest.mockResolvedValue(digest)
      const result = await controller.getPublicHistoryDigest()
      expect(result).toEqual(digest)
      expect(mockService.getPublicHistoryDigest).toHaveBeenCalled()
    })
  })
})
