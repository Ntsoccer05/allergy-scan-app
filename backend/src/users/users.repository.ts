import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UserAllergies } from '../shared/types/db.types';

export type UserRecord = {
  id: string;
  allergies: UserAllergies;
};

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, allergies: true },
    });
    if (!user) return null;
    return {
      id: user.id,
      allergies: user.allergies as unknown as UserAllergies,
    };
  }

  // 重複 INSERT を防ぐため ON CONFLICT DO NOTHING 相当の skipDuplicates を使用する
  async create(userId: string): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, allergies: {} },
      update: {},
    });
  }
}
