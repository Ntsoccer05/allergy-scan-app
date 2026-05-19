import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ProductsService } from '../products.service';
import { ProductRepository } from '../product.repository';
import { UsersRepository } from '../../users/users.repository';
import type { OthersProductRecord } from '../product.repository';

const NOW = new Date('2026-05-19T00:00:00.000Z');
const PAST = new Date('2026-01-01T00:00:00.000Z');
const FUTURE = new Date('2026-12-31T00:00:00.000Z');

const makeProductRecord = (
  overrides: Partial<OthersProductRecord> = {},
): OthersProductRecord => ({
  id: 'prod-1',
  productName: 'テスト商品',
  allergens: { contains: [], partial: [], components: [] },
  updatedAt: new Date('2026-05-18T00:00:00.000Z'),
  expiresAt: FUTURE,
  ...overrides,
});

describe('ProductsService', () => {
  let service: ProductsService;
  let productRepository: { findOthersForUser: jest.Mock };
  let usersRepository: { findById: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);

    productRepository = { findOthersForUser: jest.fn() };
    usersRepository = { findById: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: ProductRepository, useValue: productRepository },
        { provide: UsersRepository, useValue: usersRepository },
      ],
    }).compile();

    service = module.get(ProductsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getOthersScanned', () => {
    it('自分がスキャン済みの product_id を持つ商品が結果に含まれない（Repository が除外済みで返すことを検証）', async () => {
      // Repository が self-scan を除外して返す前提（findOthersForUser の責務）
      // ここでは Repository の戻り値に除外済みデータのみが来ることを想定
      const row = makeProductRecord({ id: 'prod-others-only' });
      productRepository.findOthersForUser.mockResolvedValue([row]);
      usersRepository.findById.mockResolvedValue({
        id: 'user-1',
        allergies: {},
      });

      const result = await service.getOthersScanned('user-1');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('prod-others-only');
      // userId を渡して Repository が除外クエリを実行することを確認
      expect(productRepository.findOthersForUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ limit: 20 }),
      );
    });

    it('expires_at < NOW() の商品が結果に含まれ is_expired: true が付く（R6）', async () => {
      const expiredRow = makeProductRecord({
        id: 'prod-expired',
        expiresAt: PAST, // NOW より過去
      });
      productRepository.findOthersForUser.mockResolvedValue([expiredRow]);
      usersRepository.findById.mockResolvedValue({
        id: 'user-1',
        allergies: {},
      });

      const result = await service.getOthersScanned('user-1');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].is_expired).toBe(true);
    });

    it('expires_at >= NOW() の商品は is_expired: false になる（R6）', async () => {
      const validRow = makeProductRecord({
        id: 'prod-valid',
        expiresAt: FUTURE,
      });
      productRepository.findOthersForUser.mockResolvedValue([validRow]);
      usersRepository.findById.mockResolvedValue({
        id: 'user-1',
        allergies: {},
      });

      const result = await service.getOthersScanned('user-1');

      expect(result.items[0].is_expired).toBe(false);
    });

    it('products.allergens.contains に enabled アレルゲンが含まれるとき judgment: ng を返す（R5）', async () => {
      const row = makeProductRecord({
        allergens: { contains: ['乳'], partial: [], components: ['乳'] },
      });
      productRepository.findOthersForUser.mockResolvedValue([row]);
      usersRepository.findById.mockResolvedValue({
        id: 'user-1',
        allergies: {
          乳: { enabled: true, partialAlert: true },
          卵: { enabled: false, partialAlert: false },
        },
      });

      const result = await service.getOthersScanned('user-1');

      expect(result.items[0].judgment).toBe('ng');
      expect(result.items[0].detected).toEqual(['乳']);
    });

    it('products.allergens.partial に partialAlert: true のアレルゲンが含まれるとき judgment: partial を返す（R5）', async () => {
      const row = makeProductRecord({
        allergens: { contains: [], partial: ['そば'], components: ['そば'] },
      });
      productRepository.findOthersForUser.mockResolvedValue([row]);
      usersRepository.findById.mockResolvedValue({
        id: 'user-1',
        allergies: {
          そば: { enabled: true, partialAlert: true },
        },
      });

      const result = await service.getOthersScanned('user-1');

      expect(result.items[0].judgment).toBe('partial');
      expect(result.items[0].detected).toEqual(['そば']);
    });

    it('enabled アレルゲンが allergens に含まれないとき judgment: ok を返す（R5）', async () => {
      const row = makeProductRecord({
        allergens: { contains: ['小麦'], partial: [], components: ['小麦'] },
      });
      productRepository.findOthersForUser.mockResolvedValue([row]);
      usersRepository.findById.mockResolvedValue({
        id: 'user-1',
        allergies: {
          乳: { enabled: true, partialAlert: true },
        },
      });

      const result = await service.getOthersScanned('user-1');

      expect(result.items[0].judgment).toBe('ok');
      expect(result.items[0].detected).toEqual([]);
    });

    it('不正な cursor 文字列のとき BadRequestException を throw する', async () => {
      usersRepository.findById.mockResolvedValue({
        id: 'user-1',
        allergies: {},
      });

      await expect(
        service.getOthersScanned('user-1', 'invalid-date'),
      ).rejects.toThrow(BadRequestException);

      expect(productRepository.findOthersForUser).not.toHaveBeenCalled();
    });

    it('21件取得されたとき items が 20件になり next_cursor が付く', async () => {
      usersRepository.findById.mockResolvedValue({
        id: 'user-1',
        allergies: {},
      });
      const rows = Array.from({ length: 21 }, (_, i) =>
        makeProductRecord({
          id: `prod-${i}`,
          updatedAt: new Date(Date.now() - i * 1000),
        }),
      );
      productRepository.findOthersForUser.mockResolvedValue(rows);

      const result = await service.getOthersScanned('user-1');

      expect(result.items).toHaveLength(20);
      expect(result.next_cursor).not.toBeNull();
    });
  });
});
