import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UserAllergies } from '../shared/types/db.types';

export type UserRecord = {
  id: string;
  allergies: UserAllergies;
  locale: string;
};

export type UpdateUserInput = {
  allergies?: UserAllergies;
  locale?: string;
};

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, allergies: true, locale: true },
    });
    if (!user) return null;
    return {
      id: user.id,
      allergies: user.allergies as unknown as UserAllergies,
      // DEFAULT 'ja' だが null 混入防止のためフォールバックを持たせる
      locale: user.locale ?? 'ja',
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

  async deleteById(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }

  async update(userId: string, input: UpdateUserInput): Promise<UserRecord> {
    const data: Record<string, unknown> = {};
    if (input.allergies !== undefined) {
      data.allergies = input.allergies;
    }
    if (input.locale !== undefined) {
      data.locale = input.locale;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, allergies: true, locale: true },
    });
    return {
      id: user.id,
      allergies: user.allergies as unknown as UserAllergies,
      locale: user.locale ?? 'ja',
    };
  }
}
