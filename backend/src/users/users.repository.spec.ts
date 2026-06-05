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
    it('allergies と locale を渡すと Prisma update に正しいデータが含まれる', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        allergies: mockAllergies,
        locale: 'en',
      });

      const result = await repository.update('user-1', {
        allergies: mockAllergies,
        locale: 'en',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { allergies: mockAllergies, locale: 'en' },
        select: {
          id: true,
          allergies: true,
          locale: true,
        },
      });
      expect(result.locale).toBe('en');
      expect(result.allergies).toEqual(mockAllergies);
    });

    it('allergies のみ渡した場合 locale が data に含まれない', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        allergies: mockAllergies,
        locale: 'ja',
      });

      await repository.update('user-1', { allergies: mockAllergies });

      const updateCalls = prisma.user.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      const callArg = updateCalls[0][0];
      expect(callArg.data).not.toHaveProperty('locale');
      expect(callArg.data.allergies).toEqual(mockAllergies);
    });
  });
});
