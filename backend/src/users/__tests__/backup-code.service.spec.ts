import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { BackupCodeService } from '../backup-code.service';
import { BackupCodeRepository } from '../backup-code.repository';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BACKUP_CODE_PATTERN,
  BACKUP_CODE_EXPIRES_DAYS,
} from '../backup-code.constants';
import type { Response } from 'express';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const mockBackupCodeRepository = () => ({
  findActiveByUserId: jest.fn(),
  invalidateAllByUserId: jest.fn(),
  create: jest.fn(),
  findByCode: jest.fn(),
});

const mockPrismaService = () => ({
  $transaction: jest.fn(),
  scanHistory: { updateMany: jest.fn() },
  backupCode: { updateMany: jest.fn(), update: jest.fn() },
  user: { delete: jest.fn() },
});

const buildMockResponse = (): jest.Mocked<Pick<Response, 'cookie'>> => ({
  cookie: jest.fn(),
});

describe('BackupCodeService', () => {
  let service: BackupCodeService;
  let repository: ReturnType<typeof mockBackupCodeRepository>;
  let prisma: ReturnType<typeof mockPrismaService>;

  beforeEach(async () => {
    repository = mockBackupCodeRepository();
    prisma = mockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupCodeService,
        { provide: BackupCodeRepository, useValue: repository },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BackupCodeService>(BackupCodeService);
  });

  describe('issueCode', () => {
    it('発行されたコードが ALRG-XXXX-XXXX パターンにマッチする', async () => {
      repository.invalidateAllByUserId.mockResolvedValue(undefined);
      repository.create.mockImplementation((userId, code, expiresAt) =>
        Promise.resolve({
          id: 'id-1',
          userId,
          code,
          isUsed: false,
          expiresAt,
          usedAt: null,
          createdAt: new Date(),
        }),
      );

      const result = await service.issueCode('user-1');

      expect(result.code).toMatch(BACKUP_CODE_PATTERN);
      expect(result.expires_at).toBeDefined();
    });

    it('発行されたコードに O・0・I・1 が含まれない', async () => {
      repository.invalidateAllByUserId.mockResolvedValue(undefined);
      repository.create.mockImplementation((userId, code, expiresAt) =>
        Promise.resolve({
          id: 'id-1',
          userId,
          code,
          isUsed: false,
          expiresAt,
          usedAt: null,
          createdAt: new Date(),
        }),
      );

      // 100回試行して禁止文字が含まれないことを確認する
      for (let i = 0; i < 100; i++) {
        const result = await service.issueCode('user-1');
        expect(result.code).not.toMatch(/[O0I1]/);
      }
    });

    it('再発行時に invalidateAllByUserId が呼ばれる', async () => {
      repository.invalidateAllByUserId.mockResolvedValue(undefined);
      repository.create.mockImplementation((userId, code, expiresAt) =>
        Promise.resolve({
          id: 'id-1',
          userId,
          code,
          isUsed: false,
          expiresAt,
          usedAt: null,
          createdAt: new Date(),
        }),
      );

      await service.issueCode('user-1');

      expect(repository.invalidateAllByUserId).toHaveBeenCalledWith('user-1');
    });

    it('UNIQUE 衝突が3回続くと InternalServerErrorException を throw する', async () => {
      repository.invalidateAllByUserId.mockResolvedValue(undefined);
      const uniqueError = {
        code: 'P2002',
        message: 'Unique constraint failed',
      };
      repository.create.mockRejectedValue(uniqueError);

      await expect(service.issueCode('user-1')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(repository.create).toHaveBeenCalledTimes(3);
    });

    it('expires_at が発行から7日後になっている', async () => {
      repository.invalidateAllByUserId.mockResolvedValue(undefined);
      repository.create.mockImplementation((userId, code, expiresAt) =>
        Promise.resolve({
          id: 'id-1',
          userId,
          code,
          isUsed: false,
          expiresAt,
          usedAt: null,
          createdAt: new Date(),
        }),
      );

      const before = Date.now();
      const result = await service.issueCode('user-1');
      const after = Date.now();

      const expectedMs = BACKUP_CODE_EXPIRES_DAYS * 24 * 60 * 60 * 1000;
      const actualMs = new Date(result.expires_at).getTime() - before;

      expect(actualMs).toBeGreaterThanOrEqual(expectedMs - 1000);
      expect(new Date(result.expires_at).getTime() - after).toBeLessThanOrEqual(
        expectedMs + 1000,
      );
    });
  });

  describe('restoreFromCode', () => {
    it('is_used: true のコードで BadRequestException({ message: code_invalid }) を throw する', async () => {
      repository.findByCode.mockResolvedValue({
        id: 'code-id-1',
        userId: 'old-user',
        code: 'ALRG-ABCD-EFGH',
        isUsed: true,
        expiresAt: new Date(Date.now() + ONE_DAY_MS),
        usedAt: new Date(),
        createdAt: new Date(),
      });

      await expect(
        service.restoreFromCode(
          'ALRG-ABCD-EFGH',
          'new-user',
          buildMockResponse() as unknown as Response,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('expires_at が過去のコードで BadRequestException({ message: code_invalid }) を throw する', async () => {
      repository.findByCode.mockResolvedValue({
        id: 'code-id-2',
        userId: 'old-user',
        code: 'ALRG-ABCD-EFGH',
        isUsed: false,
        expiresAt: new Date(Date.now() - ONE_DAY_MS),
        usedAt: null,
        createdAt: new Date(),
      });

      await expect(
        service.restoreFromCode(
          'ALRG-ABCD-EFGH',
          'new-user',
          buildMockResponse() as unknown as Response,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('コードが存在しない場合 BadRequestException({ message: code_invalid }) を throw する', async () => {
      repository.findByCode.mockResolvedValue(null);

      await expect(
        service.restoreFromCode(
          'ALRG-XXXX-YYYY',
          'new-user',
          buildMockResponse() as unknown as Response,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('引き継ぎ成功時にトランザクションが実行され Cookie が発行される', async () => {
      const futureDate = new Date(
        Date.now() + BACKUP_CODE_EXPIRES_DAYS * ONE_DAY_MS,
      );
      repository.findByCode.mockResolvedValue({
        id: 'code-id-3',
        userId: 'old-user',
        code: 'ALRG-ABCD-EFGH',
        isUsed: false,
        expiresAt: futureDate,
        usedAt: null,
        createdAt: new Date(),
      });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const tx = {
            scanHistory: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            backupCode: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
              update: jest.fn().mockResolvedValue({}),
            },
            user: { delete: jest.fn().mockResolvedValue({}) },
          };
          await fn(tx);
        },
      );

      const mockRes = buildMockResponse();

      const result = await service.restoreFromCode(
        'ALRG-ABCD-EFGH',
        'new-user',
        mockRes as unknown as Response,
      );

      expect(result).toEqual({ success: true });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'userId',
        'old-user',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('引き継ぎ成功時にトランザクション内で is_used: true かつ used_at が設定される', async () => {
      const futureDate = new Date(
        Date.now() + BACKUP_CODE_EXPIRES_DAYS * ONE_DAY_MS,
      );
      repository.findByCode.mockResolvedValue({
        id: 'code-id-4',
        userId: 'old-user',
        code: 'ALRG-ABCD-EFGH',
        isUsed: false,
        expiresAt: futureDate,
        usedAt: null,
        createdAt: new Date(),
      });

      const txBackupCodeUpdate = jest.fn().mockResolvedValue({});
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => {
          const tx = {
            scanHistory: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            backupCode: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
              update: txBackupCodeUpdate,
            },
            user: { delete: jest.fn().mockResolvedValue({}) },
          };
          await fn(tx);
        },
      );

      await service.restoreFromCode(
        'ALRG-ABCD-EFGH',
        'new-user',
        buildMockResponse() as unknown as Response,
      );

      expect(txBackupCodeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'code-id-4' } }),
      );
      const callArgs = txBackupCodeUpdate.mock.calls[0][0] as {
        data: { isUsed: boolean; usedAt: Date };
      };
      expect(callArgs.data.isUsed).toBe(true);
      expect(callArgs.data.usedAt).toBeInstanceOf(Date);
    });
  });
});
