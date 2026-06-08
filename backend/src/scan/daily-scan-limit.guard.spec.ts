import { HttpException, HttpStatus } from '@nestjs/common'
import { DailyScanLimitGuard } from './daily-scan-limit.guard'
import { UserDailyScansService } from '../users/user-daily-scans.service'

const mockService = { canUserScan: jest.fn() }

const buildContext = (userId: string) => ({
  switchToHttp: () => ({
    getRequest: () => ({ user: { sub: userId } }),
  }),
})

describe('DailyScanLimitGuard', () => {
  let guard: DailyScanLimitGuard

  beforeEach(() => {
    guard = new DailyScanLimitGuard(mockService as unknown as UserDailyScansService)
  })

  afterEach(() => jest.clearAllMocks())

  it('should allow scan when under limit', async () => {
    mockService.canUserScan.mockResolvedValue(true)
    const result = await guard.canActivate(buildContext('user-uuid') as any)
    expect(result).toBe(true)
  })

  it('should throw 429 when over limit', async () => {
    mockService.canUserScan.mockResolvedValue(false)
    await expect(guard.canActivate(buildContext('user-uuid') as any)).rejects.toThrow(
      new HttpException({ message: 'scan.error.dailyLimitExceeded' }, HttpStatus.TOO_MANY_REQUESTS),
    )
  })
})
