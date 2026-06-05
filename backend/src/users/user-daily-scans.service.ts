import { Injectable } from '@nestjs/common';
import { UserDailyScansRepository } from './user-daily-scans.repository';

type ScanUsageResult = {
  remaining: number;
  limit: number;
  used: number;
};

@Injectable()
export class UserDailyScansService {
  constructor(private readonly repo: UserDailyScansRepository) {}

  async canUserScan(userId: string): Promise<boolean> {
    const today = this.todayString();
    const [count, limit] = await Promise.all([
      this.repo.getTodayCount(userId, today),
      this.repo.getUserDailyScanLimit(userId),
    ]);
    return count < limit;
  }

  async incrementScanCount(userId: string): Promise<void> {
    await this.repo.upsertIncrement(userId, this.todayString());
  }

  async getRemainingScans(userId: string): Promise<ScanUsageResult> {
    const today = this.todayString();
    const [used, limit] = await Promise.all([
      this.repo.getTodayCount(userId, today),
      this.repo.getUserDailyScanLimit(userId),
    ]);
    return { remaining: Math.max(0, limit - used), limit, used };
  }

  private todayString(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
