import { Test } from '@nestjs/testing'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'

const mockService = {
  getUsers: jest.fn().mockResolvedValue({ items: [], next_cursor: null }),
  getStats: jest.fn().mockResolvedValue({ total_users: 0, total_scans: 0, scans_today: 0, active_premium: 0 }),
  updateUserPlan: jest.fn().mockResolvedValue(undefined),
}

describe('AdminController', () => {
  let controller: AdminController

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: mockService }],
    }).compile()
    controller = moduleRef.get(AdminController)
  })

  it('should return users list', async () => {
    const result = await controller.getUsers({} as any, {})
    expect(result.items).toEqual([])
  })

  it('should return stats', async () => {
    const result = await controller.getStats()
    expect(result.total_users).toBe(0)
  })
})
