import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type BackupCodeRecord = {
  id: string;
  userId: string;
  code: string;
  isUsed: boolean;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class BackupCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** user_id に紐づく未使用かつ有効期限内のコードを取得する */
  async findActiveByUserId(userId: string): Promise<BackupCodeRecord | null> {
    const record = await this.prisma.backupCode.findFirst({
      where: {
        userId,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
    });
    return record ?? null;
  }

  /** user_id に紐づく未使用コードをすべて is_used: true にする（再発行時の旧コード失効） */
  async invalidateAllByUserId(userId: string): Promise<void> {
    await this.prisma.backupCode.updateMany({
      where: {
        userId,
        isUsed: false,
      },
      data: { isUsed: true },
    });
  }

  /** 新しいバックアップコードを保存する。UNIQUE 衝突時は Prisma エラーをそのまま throw する */
  async create(
    userId: string,
    code: string,
    expiresAt: Date,
  ): Promise<BackupCodeRecord> {
    return this.prisma.backupCode.create({
      data: {
        userId,
        code,
        expiresAt,
      },
    });
  }

  /** コード文字列でレコードを検索する */
  async findByCode(code: string): Promise<BackupCodeRecord | null> {
    const record = await this.prisma.backupCode.findUnique({
      where: { code },
    });
    return record ?? null;
  }
}
