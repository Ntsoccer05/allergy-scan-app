import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BackupCodeRepository } from './backup-code.repository';
import {
  BACKUP_CODE_CHARSET,
  BACKUP_CODE_BLOCK_LENGTH,
  BACKUP_CODE_BLOCK_COUNT,
  BACKUP_CODE_PREFIX,
  BACKUP_CODE_EXPIRES_DAYS,
  BACKUP_CODE_MAX_RETRIES,
} from './backup-code.constants';
import { COOKIE_NAME, COOKIE_MAX_AGE } from './users.constants';
import type { Response } from 'express';

export type IssueBackupCodeResult = {
  code: string;
  expires_at: string;
};

export type RestoreResult = {
  success: true;
};

@Injectable()
export class BackupCodeService {
  private readonly logger = new Logger(BackupCodeService.name);

  constructor(
    private readonly backupCodeRepository: BackupCodeRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * バックアップコードを生成して発行する。
   * 既存の未使用コードを失効させてから新コードを INSERT する。
   * UNIQUE 衝突時は最大 BACKUP_CODE_MAX_RETRIES 回リトライする。
   */
  async issueCode(userId: string): Promise<IssueBackupCodeResult> {
    // 既存の未使用コードをすべて失効させる
    await this.backupCodeRepository.invalidateAllByUserId(userId);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + BACKUP_CODE_EXPIRES_DAYS);

    for (let _attempt = 0; _attempt < BACKUP_CODE_MAX_RETRIES; _attempt++) {
      const code = this.generateCode();
      try {
        await this.backupCodeRepository.create(userId, code, expiresAt);
        // ⚠️ 安全設計: コード値そのものはログに出力しない（要配慮個人情報）
        this.logger.log('バックアップコードを発行しました', { userId });
        return { code, expires_at: expiresAt.toISOString() };
      } catch (err) {
        // UNIQUE 制約違反 (P2002) の場合のみリトライする
        if (this.isUniqueConstraintError(err)) {
          continue;
        }
        throw err;
      }
    }

    this.logger.error(
      'バックアップコードの生成に失敗しました（UNIQUE 衝突リトライ上限超過）',
      {
        userId,
      },
    );
    throw new InternalServerErrorException('コードの生成に失敗しました');
  }

  /**
   * バックアップコードを検証し、引き継ぎを実行する。
   * トランザクション内で新デバイスの scan_histories / backup_codes を旧 user_id に付け替え、
   * 新デバイスの users レコードを削除してから旧 user_id の Cookie を発行し直す。
   */
  async restoreFromCode(
    code: string,
    newUserId: string,
    res: Response,
  ): Promise<RestoreResult> {
    const record = await this.backupCodeRepository.findByCode(code);

    if (!record || record.isUsed || record.expiresAt < new Date()) {
      // ⚠️ 安全設計: 無効コードの詳細（存在有無等）は返さない
      throw new BadRequestException({ message: 'code_invalid' });
    }

    const oldUserId = record.userId;

    // 自分自身のコードで restore しようとした場合は早期リターン（操作不要）
    if (oldUserId === newUserId) {
      throw new BadRequestException({ message: 'code_invalid' });
    }

    // トランザクション: 旧 user_id に新デバイスのデータを付け替え → 新 users レコード削除
    await this.prisma.$transaction(async (tx) => {
      // scan_histories の user_id を旧デバイスに付け替え
      await tx.scanHistory.updateMany({
        where: { userId: newUserId },
        data: { userId: oldUserId },
      });

      // backup_codes の user_id を旧デバイスに付け替え（新デバイスが発行したコードがあれば）
      await tx.backupCode.updateMany({
        where: { userId: newUserId },
        data: { userId: oldUserId },
      });

      // 新デバイスの users レコードを削除
      await tx.user.delete({ where: { id: newUserId } });

      // コードを使用済みにする
      await tx.backupCode.update({
        where: { id: record.id },
        data: { isUsed: true, usedAt: new Date() },
      });
    });

    // 旧 user_id の Cookie を新デバイスに発行し直す
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie(COOKIE_NAME, oldUserId, {
      httpOnly: true,
      sameSite: 'strict',
      secure: isProduction,
      maxAge: COOKIE_MAX_AGE * 1000,
      path: '/',
    });

    // ⚠️ 安全設計: コード値そのものはログに出力しない（要配慮個人情報）
    this.logger.log('デバイス引き継ぎが完了しました', { oldUserId });

    return { success: true };
  }

  /** ALRG-XXXX-XXXX 形式のコードを生成する */
  private generateCode(): string {
    const blocks: string[] = [];
    for (let b = 0; b < BACKUP_CODE_BLOCK_COUNT; b++) {
      let block = '';
      for (let i = 0; i < BACKUP_CODE_BLOCK_LENGTH; i++) {
        // randomBytes で均一な乱数を生成し、バイアスを最小化する
        const randomByte = randomBytes(1)[0];
        block += BACKUP_CODE_CHARSET[randomByte % BACKUP_CODE_CHARSET.length];
      }
      blocks.push(block);
    }
    return `${BACKUP_CODE_PREFIX}-${blocks.join('-')}`;
  }

  private isUniqueConstraintError(err: unknown): boolean {
    // Prisma の UNIQUE 制約エラーコードは P2002
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    );
  }
}
