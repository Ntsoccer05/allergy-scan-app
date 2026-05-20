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
      upsert: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue(undefined),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue(undefined),
      },
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
    it('ユーザーが存在する場合、id・allergies・locale・onboardingDone を返す', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        allergies: mockAllergies,
        locale: 'ja',
        onboardingDone: true,
      });

      const result = await repository.findById('user-1');

      expect(result).toEqual({
        id: 'user-1',
        allergies: mockAllergies,
        locale: 'ja',
        onboardingDone: true,
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: {
          id: true,
          allergies: true,
          locale: true,
          onboardingDone: true,
        },
      });
    });

    it('ユーザーが存在しない場合、null を返す', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await repository.findById('not-exist');

      expect(result).toBeNull();
    });

    it('onboardingDone が null の場合 false にフォールバックする', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        allergies: {},
        locale: 'ja',
        onboardingDone: null,
      });

      const result = await repository.findById('user-1');

      expect(result?.onboardingDone).toBe(false);
    });
  });

  describe('update', () => {
    it('onboardingDone: true を渡すと Prisma update に onboardingDone: true が含まれる', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        allergies: {},
        locale: 'ja',
        onboardingDone: true,
      });

      const result = await repository.update('user-1', {
        onboardingDone: true,
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { onboardingDone: true },
        select: {
          id: true,
          allergies: true,
          locale: true,
          onboardingDone: true,
        },
      });
      expect(result.onboardingDone).toBe(true);
    });

    it('onboardingDone: false を渡すと Prisma update の data に onboardingDone が含まれない（無視される）', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        allergies: {},
        locale: 'ja',
        onboardingDone: false,
      });

      await repository.update('user-1', { onboardingDone: false });

      const updateCalls1 = prisma.user.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      const callArg1 = updateCalls1[0][0];
      expect(callArg1.data).not.toHaveProperty('onboardingDone');
    });

    it('allergies と locale のみ渡した場合 onboardingDone が data に含まれない', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        allergies: mockAllergies,
        locale: 'en',
        onboardingDone: false,
      });

      await repository.update('user-1', {
        allergies: mockAllergies,
        locale: 'en',
      });

      const updateCalls2 = prisma.user.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      const callArg = updateCalls2[0][0];
      expect(callArg.data).not.toHaveProperty('onboardingDone');
      expect(callArg.data.allergies).toEqual(mockAllergies);
      expect(callArg.data.locale).toBe('en');
    });
  });
});
