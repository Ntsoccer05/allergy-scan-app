import { Injectable } from '@nestjs/common'
import { createHash, randomBytes } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'

const CODE_TTL_DAYS = 30

// 紛らわしい文字（O/0/I/1）を除外したアルファベット・数字
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const generateCode = (): string => {
  const part = (len: number) =>
    Array.from({ length: len }, () => CODE_CHARS[randomBytes(1)[0] % CODE_CHARS.length]).join('')
  return `ALRG-${part(4)}-${part(4)}`
}

const hashCode = (code: string): string =>
  createHash('sha256').update(code).digest('hex')

export type IssuedBackupCode = {
  code: string
  expires_at: Date
}

@Injectable()
export class BackupCodesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async issue(userId: string): Promise<IssuedBackupCode> {
    const code = generateCode()
    const codeHash = hashCode(code)
    const expiresAt = new Date(Date.now() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000)

    // 既存の未使用コードを無効化してから新コードを作成する（競合防止のためトランザクションで実行）
    await this.prisma.$transaction(async (tx) => {
      await tx.backupCode.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      })
      await tx.backupCode.create({
        data: { userId, codeHash, expiresAt },
      })
    })

    return { code, expires_at: expiresAt }
  }

  async findValidByCode(code: string): Promise<{ id: string; userId: string } | null> {
    const codeHash = hashCode(code)
    const record = await this.prisma.backupCode.findFirst({
      where: {
        codeHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, userId: true },
    })
    return record ?? null
  }

  async countIssuedToday(userId: string): Promise<number> {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    return this.prisma.backupCode.count({
      where: {
        userId,
        createdAt: { gte: startOfDay },
      },
    })
  }

  async markUsed(id: string): Promise<void> {
    await this.prisma.backupCode.update({
      where: { id },
      data: { usedAt: new Date() },
    })
  }
}
