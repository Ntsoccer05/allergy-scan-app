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
  thumbnailUrl: null,
  storeName: null,
  rawText: null,
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
    it('公開スキャンのある商品が返る（自分のスキャン済み商品も公開されていれば含む）', async () => {
      // Repository は is_public=true の履歴を持つ商品のみ返す（findOthersForUser の責務）
      const row = makeProductRecord({ id: 'prod-public' });
      productRepository.findOthersForUser.mockResolvedValue([row]);
      usersRepository.findById.mockResolvedValue({
        id: 'user-1',
        allergies: {},
      });

      const result = await service.getOthersScanned('user-1');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('prod-public');
      expect(productRepository.findOthersForUser).toHaveBeenCalledWith(
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

    it('products.allergens.contains に enabled アレルギーが含まれるとき judgment: ng を返す（R5）', async () => {
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

    it('products.allergens.partial に partialAlert: true のアレルギーが含まれるとき judgment: partial を返す（R5）', async () => {
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

    it('enabled アレルギーが allergens に含まれないとき judgment: ok を返す（R5）', async () => {
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

    it('judgment フィルタ指定時は導出後の判定で絞り込み、走査を続けてページを埋める', async () => {
      const ngRow = makeProductRecord({
        id: 'prod-ng',
        allergens: { contains: ['乳'], partial: [], components: ['乳'] },
      });
      const okRow = makeProductRecord({
        id: 'prod-ok',
        allergens: { contains: [], partial: [], components: [] },
      });
      productRepository.findOthersForUser.mockResolvedValue([ngRow, okRow]);
      usersRepository.findById.mockResolvedValue({
        id: 'user-1',
        allergies: { 乳: { enabled: true, partialAlert: true } },
      });

      const result = await service.getOthersScanned('user-1', { judgment: 'ng' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('prod-ng');
      expect(result.items[0].judgment).toBe('ng');
    });

    it('q / store が Repository に渡される', async () => {
      productRepository.findOthersForUser.mockResolvedValue([]);
      usersRepository.findById.mockResolvedValue({ id: 'user-1', allergies: {} });

      await service.getOthersScanned('user-1', { q: 'グミ', store: 'セブン' });

      expect(productRepository.findOthersForUser).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'グミ', store: 'セブン' }),
      );
    });

    it('store_name と raw_text がレスポンスに含まれる（詳細表示用）', async () => {
      const row = makeProductRecord({
        storeName: 'セブンイレブン渋谷店',
        rawText: '原材料名:水飴、砂糖',
      });
      productRepository.findOthersForUser.mockResolvedValue([row]);
      usersRepository.findById.mockResolvedValue({ id: 'user-1', allergies: {} });

      const result = await service.getOthersScanned('user-1');

      expect(result.items[0].store_name).toBe('セブンイレブン渋谷店');
      expect(result.items[0].raw_text).toBe('原材料名:水飴、砂糖');
    });

    it('Repository が返すサムネイル URL を thumbnail_url としてレスポンスに含める', async () => {
      const row = makeProductRecord({
        thumbnailUrl: 'https://s3.example.com/thumb.jpg',
      });
      productRepository.findOthersForUser.mockResolvedValue([row]);
      usersRepository.findById.mockResolvedValue({
        id: 'user-1',
        allergies: {},
      });

      const result = await service.getOthersScanned('user-1');

      expect(result.items[0].thumbnail_url).toBe('https://s3.example.com/thumb.jpg');
    });

    it('不正な cursor 文字列のとき BadRequestException を throw する', async () => {
      usersRepository.findById.mockResolvedValue({
        id: 'user-1',
        allergies: {},
      });

      await expect(
        service.getOthersScanned('user-1', { cursor: 'invalid-date' }),
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
