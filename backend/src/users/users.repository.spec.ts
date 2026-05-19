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
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };

    const module = await Test.createTestingModule({
      providers: [
        UsersRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = module.get(UsersRepository);
  });

  describe('findById', () => {
    it('ユーザーが存在する場合、id と allergies を返す', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        allergies: mockAllergies,
      });

      const result = await repository.findById('user-1');

      expect(result).toEqual({ id: 'user-1', allergies: mockAllergies });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { id: true, allergies: true },
      });
    });

    it('ユーザーが存在しない場合、null を返す', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await repository.findById('not-exist');

      expect(result).toBeNull();
    });
  });
});
