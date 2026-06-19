import { Test } from '@nestjs/testing'
import { BackupCodesRepository } from './backup-codes.repository'
import { PrismaService } from '../prisma/prisma.service'

describe('BackupCodesRepository', () => {
  let repository: BackupCodesRepository
  let prisma: {
    backupCode: {
      updateMany: jest.Mock
      create: jest.Mock
      findFirst: jest.Mock
      update: jest.Mock
      count: jest.Mock
    }
    $transaction: jest.Mock
  }

  beforeEach(async () => {
    prisma = {
      backupCode: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn().mockImplementation((fn) => fn(prisma)),
    }

    const module = await Test.createTestingModule({
      providers: [
        BackupCodesRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()

    repository = module.get(BackupCodesRepository)
  })

  afterEach(() => jest.clearAllMocks())

  describe('issue', () => {
    it('generates ALRG-XXXX-XXXX format code and stores hash', async () => {
      const result = await repository.issue('user-1')

      // 返却コードの形式を検証
      expect(result.code).toMatch(/^ALRG-[A-Z0-9]{4}-[A-Z0-9]{4}$/)

      // DB には平文コードではなくハッシュが保存される
      const createCall = prisma.backupCode.create.mock.calls[0][0]
      expect(createCall.data.codeHash).toBeDefined()
      expect(createCall.data.codeHash).not.toBe(result.code)

      // expires_at は約 30 日後
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
      const now = Date.now()
      expect(result.expires_at.getTime()).toBeGreaterThanOrEqual(now + thirtyDaysMs - 1000)
      expect(result.expires_at.getTime()).toBeLessThanOrEqual(now + thirtyDaysMs + 1000)
    })

    it('invalidates existing unused codes before creating new one', async () => {
      await repository.issue('user-1')

      // $transaction が呼ばれていること
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)

      // updateMany で未使用コードを無効化
      expect(prisma.backupCode.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      })

      // create が呼ばれていること（updateMany の後）
      expect(prisma.backupCode.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          codeHash: expect.any(String),
          expiresAt: expect.any(Date),
        },
      })

      // 呼び出し順を検証（updateMany → create）
      const updateOrder = prisma.backupCode.updateMany.mock.invocationCallOrder[0]
      const createOrder = prisma.backupCode.create.mock.invocationCallOrder[0]
      expect(updateOrder).toBeLessThan(createOrder)
    })
  })

  describe('findValidByCode', () => {
    it('returns null when no valid code exists (expired or used)', async () => {
      prisma.backupCode.findFirst.mockResolvedValue(null)

      const result = await repository.findValidByCode('ALRG-XXXX-YYYY')

      expect(result).toBeNull()
    })

    it('returns record for valid unexpired unused code', async () => {
      const mockRecord = { id: 'code-id-1', userId: 'user-1' }
      prisma.backupCode.findFirst.mockResolvedValue(mockRecord)

      const result = await repository.findValidByCode('ALRG-ABCD-EFGH')

      expect(result).toEqual({ id: 'code-id-1', userId: 'user-1' })

      // SHA-256 ハッシュが where 句に渡されること（平文コードではない）
      const whereClause = prisma.backupCode.findFirst.mock.calls[0][0].where
      expect(whereClause.codeHash).toBeDefined()
      expect(whereClause.codeHash).not.toBe('ALRG-ABCD-EFGH')
      expect(whereClause.usedAt).toBe(null)
      expect(whereClause.expiresAt).toEqual({ gt: expect.any(Date) })
    })
  })

  describe('countIssuedToday', () => {
    it('counts codes issued today for the given user', async () => {
      prisma.backupCode.count.mockResolvedValue(3)

      const result = await repository.countIssuedToday('user-1')

      expect(result).toBe(3)
      const whereClause = prisma.backupCode.count.mock.calls[0][0].where
      expect(whereClause.userId).toBe('user-1')
      expect(whereClause.createdAt).toEqual({ gte: expect.any(Date) })
    })

    it('returns 0 when no codes issued today', async () => {
      prisma.backupCode.count.mockResolvedValue(0)

      const result = await repository.countIssuedToday('user-2')

      expect(result).toBe(0)
    })
  })

  describe('markUsed', () => {
    it('sets usedAt on the specified record', async () => {
      await repository.markUsed('code-id-99')

      expect(prisma.backupCode.update).toHaveBeenCalledWith({
        where: { id: 'code-id-99' },
        data: { usedAt: expect.any(Date) },
      })
    })
  })
})
