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
    // JST（Asia/Tokyo）基準で今日の日付を YYYY-MM-DD 形式で返す
    return new Date().toLocaleDateString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).replace(/\//g, '-');
  }
}
