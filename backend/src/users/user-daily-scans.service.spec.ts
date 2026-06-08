import { Test } from '@nestjs/testing';
import { UserDailyScansService } from './user-daily-scans.service';
import { UserDailyScansRepository } from './user-daily-scans.repository';

const mockRepository = {
  getTodayCount: jest.fn(),
  upsertIncrement: jest.fn(),
  getUserDailyScanLimit: jest.fn(),
};

describe('UserDailyScansService', () => {
  let service: UserDailyScansService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UserDailyScansService,
        { provide: UserDailyScansRepository, useValue: mockRepository },
      ],
    }).compile();
    service = moduleRef.get(UserDailyScansService);
  });

  describe('canUserScan', () => {
    it('should return true when under daily limit', async () => {
      mockRepository.getTodayCount.mockResolvedValue(5);
      mockRepository.getUserDailyScanLimit.mockResolvedValue(20);
      expect(await service.canUserScan('user-uuid')).toBe(true);
    });

    it('should return false when at daily limit', async () => {
      mockRepository.getTodayCount.mockResolvedValue(20);
      mockRepository.getUserDailyScanLimit.mockResolvedValue(20);
      expect(await service.canUserScan('user-uuid')).toBe(false);
    });

    it('should return false when over daily limit', async () => {
      mockRepository.getTodayCount.mockResolvedValue(25);
      mockRepository.getUserDailyScanLimit.mockResolvedValue(20);
      expect(await service.canUserScan('user-uuid')).toBe(false);
    });
  });

  describe('incrementScanCount', () => {
    it('should call upsertIncrement with today date string (YYYY-MM-DD)', async () => {
      mockRepository.upsertIncrement.mockResolvedValue(undefined);
      await service.incrementScanCount('user-uuid');
      expect(mockRepository.upsertIncrement).toHaveBeenCalledWith(
        'user-uuid',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
    });
  });

  describe('getRemainingScans', () => {
    it('should return remaining=13, limit=20, used=7', async () => {
      mockRepository.getTodayCount.mockResolvedValue(7);
      mockRepository.getUserDailyScanLimit.mockResolvedValue(20);
      const result = await service.getRemainingScans('user-uuid');
      expect(result).toEqual({ remaining: 13, limit: 20, used: 7 });
    });

    it('should return remaining=0 when used exceeds limit', async () => {
      mockRepository.getTodayCount.mockResolvedValue(25);
      mockRepository.getUserDailyScanLimit.mockResolvedValue(20);
      const result = await service.getRemainingScans('user-uuid');
      expect(result.remaining).toBe(0);
    });
  });
});
