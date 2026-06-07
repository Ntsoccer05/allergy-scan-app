import { Test } from '@nestjs/testing';
import { UsersRepository } from './users.repository';
import { PrismaService } from '../prisma/prisma.service';
import type { UserAllergies } from '../shared/types/db.types';

const mockAllergies: UserAllergies = {
  乳: { enabled: true, partialAlert: true },
  卵: { enabled: false, partialAlert: false },
};

describe('UsersRepository', () => {
  let repository: UsersRepository;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    scanHistory: {
      deleteMany: jest.Mock;
    };
    $executeRawUnsafe: jest.Mock;
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'user-1',
          allergies: mockAllergies,
          locale: 'en',
        }),
        upsert: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      scanHistory: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn().mockResolvedValue([undefined, undefined]),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = module.get(UsersRepository);
  });

  describe('findById', () => {
    it('ユーザーが存在する場合、id・allergies・locale を返す', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        allergies: mockAllergies,
        locale: 'ja',
      });

      const result = await repository.findById('user-1');

      expect(result).toEqual({
        id: 'user-1',
        allergies: mockAllergies,
        locale: 'ja',
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: {
          id: true,
          allergies: true,
          locale: true,
        },
      });
    });

    it('ユーザーが存在しない場合、null を返す', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await repository.findById('not-exist');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('allergies と locale を渡すと $executeRawUnsafe が呼ばれ、更新後のユーザーを返す', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        allergies: mockAllergies,
        locale: 'en',
      });

      const result = await repository.update('user-1', {
        allergies: mockAllergies,
        locale: 'en',
      });

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET'),
        'user-1',
        JSON.stringify(mockAllergies),
        'en',
      );
      expect(result.locale).toBe('en');
      expect(result.allergies).toEqual(mockAllergies);
    });

    it('allergies のみ渡した場合 locale が SQL に含まれない', async () => {
      await repository.update('user-1', { allergies: mockAllergies });

      const sqlArg = prisma.$executeRawUnsafe.mock.calls[0][0] as string;
      expect(sqlArg).toContain('allergies');
      expect(sqlArg).not.toContain('locale');
    });

    it('onboardingDone を渡すと onboarding_done が SQL に含まれる', async () => {
      await repository.update('user-1', { onboardingDone: true });

      const sqlArg = prisma.$executeRawUnsafe.mock.calls[0][0] as string;
      expect(sqlArg).toContain('onboarding_done');
    });
  });

  describe('resetData', () => {
    it('resets allergies to {} and deletes scan histories in a transaction', async () => {
      await repository.resetData('user-123');

      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.anything(),  // prisma.user.update
        expect.anything(),  // prisma.scanHistory.deleteMany
      ]);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { allergies: {} },
      });
      expect(prisma.scanHistory.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
      });
    });
  });
});
