// TODO: remove in Task 7 — backup_codes table removed; this file is kept temporarily
// while BackupCodeController/Service are cleaned up in Task 7.
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

// Temporary delegate type until Task 7 removes this repository.
type BackupCodeDelegate = {
  findFirst: (args: {
    where: {
      userId?: string;
      isUsed?: boolean;
      expiresAt?: { gt: Date };
    };
  }) => Promise<BackupCodeRecord | null>;
  updateMany: (args: {
    where: { userId?: string; isUsed?: boolean };
    data: { isUsed?: boolean };
  }) => Promise<unknown>;
  create: (args: {
    data: { userId: string; code: string; expiresAt: Date };
  }) => Promise<BackupCodeRecord>;
  findUnique: (args: {
    where: { code: string };
  }) => Promise<BackupCodeRecord | null>;
};

@Injectable()
export class BackupCodeRepository {
  private get backupCode(): BackupCodeDelegate {
    // backup_codes table removed from schema; delegate via raw prisma reference
    // TODO: remove in Task 7
    return (this.prisma as unknown as { backupCode: BackupCodeDelegate })
      .backupCode;
  }

  constructor(private readonly prisma: PrismaService) {}

  /** user_id に紐づく未使用かつ有効期限内のコードを取得する */
  async findActiveByUserId(userId: string): Promise<BackupCodeRecord | null> {
    const record = await this.backupCode.findFirst({
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
    await this.backupCode.updateMany({
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
    return this.backupCode.create({
      data: {
        userId,
        code,
        expiresAt,
      },
    });
  }

  /** コード文字列でレコードを検索する */
  async findByCode(code: string): Promise<BackupCodeRecord | null> {
    const record = await this.backupCode.findUnique({
      where: { code },
    });
    return record ?? null;
  }
}
