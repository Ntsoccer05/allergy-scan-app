import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { HistoryService } from './history.service';
import { ScanHistoryRepository } from './scan-history.repository';
import { ProductRepository } from '../products/product.repository';
import { UsersRepository } from '../users/users.repository';
import { AllergenComponentRepository } from '../allergens/allergen-component.repository';
import type {
  ScanHistoryRecord,
  LocationPinRecord,
  PublicLocationPinRecord,
  HistoryGroupRecord,
  ScanRecord,
} from './scan-history.repository';

const makeRecord = (
  overrides: Partial<ScanHistoryRecord> = {},
): ScanHistoryRecord => ({
  id: 'rec-uuid',
  userId: 'user-1',
  productId: null,
  productName: null,
  judgment: 'ok',
  detected: [],
  location: null,
  thumbnailUrl: null,
  isPublic: false,
  memo: null,
  rawText: null,
  scannedAt: new Date('2026-01-15T10:00:00.000Z'),
  ...overrides,
});

const makeGroupRecord = (
  overrides: Partial<HistoryGroupRecord> = {},
): HistoryGroupRecord => ({
  productId: 'prod-1',
  productName: '商品A',
  allergens: { contains: [], partial: [], components: [] },
  thumbnailUrl: null,
  itemUrl: null,
  latestScanAt: new Date('2026-01-15T10:00:00.000Z'),
  scans: [
    {
      id: 'scan-1',
      scannedAt: new Date('2026-01-15T10:00:00.000Z'),
      location: null,
      memo: null,
      thumbnailUrl: null,
      rawText: null,
    } satisfies ScanRecord,
  ],
  ...overrides,
});

const makeLocationPin = (
  overrides: Partial<LocationPinRecord> = {},
): LocationPinRecord => ({
  id: 'pin-1',
  productName: 'テスト商品',
  judgment: 'ng',
  detected: ['卵'],
  thumbnailUrl: 'https://example.com/thumb.jpg',
  storeName: 'セブンイレブン渋谷店',
  lat: 35.6762,
  lng: 139.6503,
  scannedAt: new Date('2026-01-15T10:00:00.000Z'),
  rawText: '原材料：全卵、砂糖',
  ...overrides,
});

const makePublicLocationPin = (
  overrides: Partial<PublicLocationPinRecord> = {},
): PublicLocationPinRecord => ({
  id: 'pub-pin-1',
  productName: '公開商品',
  judgment: 'ok',
  thumbnailUrl: null,
  storeName: 'ローソン新宿店',
  lat: 35.69,
  lng: 139.7,
  scannedAt: new Date('2026-01-14T09:00:00.000Z'),
  ...overrides,
});

/** アレルギー設定なしユーザー（再評価が no-op になる） */
const makeUserNoAllergies = () => ({
  id: 'user-1',
  allergies: {},
  locale: 'ja',
});

/** 卵アレルギー有効ユーザー */
const makeUserWithEgg = () => ({
  id: 'user-1',
  allergies: { 卵: { enabled: true, partialAlert: true } },
  locale: 'ja',
});

/** 卵の allergen_component モック（canonicalName: "全卵"） */
const eggComponent = {
  id: 'comp-1',
  allergenName: '卵',
  canonicalName: '全卵',
  aliases: ['卵', '鶏卵', '卵黄'],
  componentType: 'direct',
  detectionType: 'contains',
  riskLevel: 'high',
  note: null,
};

describe('HistoryService', () => {
  let service: HistoryService;
  let repository: {
    findGroupsByUser: jest.Mock;
    findByUser: jest.Mock;
    create: jest.Mock;
    findById: jest.Mock;
    updateLocation: jest.Mock;
    update: jest.Mock;
    deleteById: jest.Mock;
    deleteManyByIds: jest.Mock;
    findLocationPinsByUser: jest.Mock;
    findPublicLocationPins: jest.Mock;
  };
  let usersRepository: { findById: jest.Mock };
  let allergenComponentRepository: { findByAllergens: jest.Mock };
  let productRepository: {
    updateProductName: jest.Mock;
    findRawTextsByIds: jest.Mock;
    findAllergensByIds: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      findGroupsByUser: jest.fn(),
      findByUser: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      updateLocation: jest.fn(),
      update: jest.fn(),
      deleteById: jest.fn(),
      deleteManyByIds: jest.fn(),
      findLocationPinsByUser: jest.fn().mockResolvedValue([]),
      findPublicLocationPins: jest.fn().mockResolvedValue([]),
    };
    usersRepository = { findById: jest.fn().mockResolvedValue(makeUserNoAllergies()) };
    allergenComponentRepository = { findByAllergens: jest.fn().mockResolvedValue([]) };
    productRepository = {
      updateProductName: jest.fn(),
      findRawTextsByIds: jest.fn().mockResolvedValue(new Map()),
      findAllergensByIds: jest.fn().mockResolvedValue(new Map()),
    };

    const module = await Test.createTestingModule({
      providers: [
        HistoryService,
        { provide: ScanHistoryRepository, useValue: repository },
        { provide: ProductRepository, useValue: productRepository },
        { provide: UsersRepository, useValue: usersRepository },
        { provide: AllergenComponentRepository, useValue: allergenComponentRepository },
      ],
    }).compile();

    service = module.get(HistoryService);
  });

  describe('getHistory', () => {
    describe('カーソルなし・judgment=all', () => {
      it('2件のグループが返されたとき items が2件で next_before が null', async () => {
        const records = [
          makeGroupRecord({ productId: 'prod-1', latestScanAt: new Date('2026-01-15T10:00:00.000Z') }),
          makeGroupRecord({ productId: 'prod-2', latestScanAt: new Date('2026-01-14T10:00:00.000Z') }),
        ];
        repository.findGroupsByUser.mockResolvedValue(records);

        const result = await service.getHistory('user-1', {});

        expect(result.items).toHaveLength(2);
        expect(result.next_before).toBeNull();
        expect(repository.findGroupsByUser).toHaveBeenCalledWith('user-1', {
          before: undefined,
          limit: 60, // HISTORY_PAGE_LIMIT * 3 = 20 * 3
          q: undefined,
          store: undefined,
        });
      });

      it('61件返却されたとき items が20件になり next_before が ISO8601 文字列になる', async () => {
        const records = Array.from({ length: 61 }, (_, i) =>
          makeGroupRecord({
            productId: `prod-${i}`,
            latestScanAt: new Date(Date.now() - i * 1000),
          }),
        );
        repository.findGroupsByUser.mockResolvedValue(records);

        const result = await service.getHistory('user-1', {});

        expect(result.items).toHaveLength(20);
        expect(result.next_before).not.toBeNull();
        expect(new Date(result.next_before!).toISOString()).toBe(result.next_before);
      });
    });

    describe('カーソルあり', () => {
      it('before を Date に変換して findGroupsByUser に渡す', async () => {
        repository.findGroupsByUser.mockResolvedValue([]);
        const beforeStr = '2026-01-10T00:00:00.000Z';

        await service.getHistory('user-1', { before: beforeStr });

        expect(repository.findGroupsByUser).toHaveBeenCalledWith('user-1', {
          before: new Date(beforeStr),
          limit: 60,
          q: undefined,
          store: undefined,
        });
      });
    });

    describe('judgment=ng フィルタ', () => {
      it('allergens.contains に 卵 がある商品は ng として返る', async () => {
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        const records = [
          makeGroupRecord({
            productId: 'prod-1',
            allergens: { contains: ['卵'], partial: [], components: ['全卵'] },
          }),
        ];
        repository.findGroupsByUser.mockResolvedValue(records);

        const result = await service.getHistory('user-1', { judgment: 'ng' });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].judgment).toBe('ng');
      });

      it('アレルギーなし商品は judgment=ng フィルタで除外される', async () => {
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        const records = [
          makeGroupRecord({ allergens: { contains: [], partial: [], components: [] } }),
        ];
        repository.findGroupsByUser.mockResolvedValue(records);

        const result = await service.getHistory('user-1', { judgment: 'ng' });

        expect(result.items).toHaveLength(0);
      });
    });

    describe('q / store 検索パラメータ', () => {
      it('q と store が findGroupsByUser に渡される', async () => {
        repository.findGroupsByUser.mockResolvedValue([]);

        await service.getHistory('user-1', { q: 'グミ', store: 'セブン' });

        expect(repository.findGroupsByUser).toHaveBeenCalledWith('user-1', {
          before: undefined,
          limit: 60,
          q: 'グミ',
          store: 'セブン',
        });
      });
    });

    describe('不正な before', () => {
      it('NaN になる before 文字列のとき BadRequestException を throw する', async () => {
        await expect(
          service.getHistory('user-1', { before: 'invalid-date' }),
        ).rejects.toThrow(BadRequestException);
        expect(repository.findGroupsByUser).not.toHaveBeenCalled();
      });
    });

    describe('allergens × allergies による judgment 再導出', () => {
      it('卵アレルギー有効・allergens.contains に 卵 があれば ng になる', async () => {
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        repository.findGroupsByUser.mockResolvedValue([
          makeGroupRecord({
            allergens: { contains: ['卵'], partial: [], components: ['全卵'] },
          }),
        ]);

        const result = await service.getHistory('user-1', {});

        expect(result.items[0].judgment).toBe('ng');
        expect(result.items[0].detected).toContain('卵');
      });

      it('アレルギー設定なしのとき ok で返る', async () => {
        usersRepository.findById.mockResolvedValue(makeUserNoAllergies());
        repository.findGroupsByUser.mockResolvedValue([
          makeGroupRecord({
            allergens: { contains: ['卵'], partial: [], components: ['全卵'] },
          }),
        ]);

        const result = await service.getHistory('user-1', {});

        expect(result.items[0].judgment).toBe('ok');
      });

      it('allergens.partial に 卵 があり partialAlert=true のとき partial になる', async () => {
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        repository.findGroupsByUser.mockResolvedValue([
          makeGroupRecord({
            allergens: { contains: [], partial: ['卵'], components: ['一部に卵'] },
          }),
        ]);

        const result = await service.getHistory('user-1', {});

        expect(result.items[0].judgment).toBe('partial');
        expect(result.items[0].detected).toContain('卵');
      });

      it('itemUrl が HistoryGroupItem.product.itemUrl として返る', async () => {
        usersRepository.findById.mockResolvedValue(makeUserNoAllergies());
        repository.findGroupsByUser.mockResolvedValue([
          makeGroupRecord({ itemUrl: 'https://item.rakuten.co.jp/shop/item1/' }),
        ]);

        const result = await service.getHistory('user-1', {});

        expect(result.items[0].product.itemUrl).toBe('https://item.rakuten.co.jp/shop/item1/');
      });
    });
  });

  describe('getMapLocations', () => {
    it('自分のピンと公開ピンを最新500件ずつ取得する', async () => {
      repository.findLocationPinsByUser.mockResolvedValue([]);
      repository.findPublicLocationPins.mockResolvedValue([]);

      const result = await service.getMapLocations('user-1');

      expect(repository.findLocationPinsByUser).toHaveBeenCalledWith('user-1', 500);
      expect(repository.findPublicLocationPins).toHaveBeenCalledWith(500);
      expect(result).toEqual({ mine: [], public: [] });
    });

    it('mine ピンは raw_text・detected を含む snake_case の MapPin に変換される', async () => {
      repository.findLocationPinsByUser.mockResolvedValue([makeLocationPin()]);

      const result = await service.getMapLocations('user-1');

      expect(result.mine).toEqual([
        {
          id: 'pin-1',
          product_name: 'テスト商品',
          judgment: 'ng',
          detected: ['卵'],
          thumbnail_url: 'https://example.com/thumb.jpg',
          store_name: 'セブンイレブン渋谷店',
          lat: 35.6762,
          lng: 139.6503,
          scanned_at: '2026-01-15T10:00:00.000Z',
          raw_text: '原材料：全卵、砂糖',
        },
      ]);
    });

    it('public ピンは raw_text・detected を含まない（userId・memo も含まない）', async () => {
      repository.findPublicLocationPins.mockResolvedValue([makePublicLocationPin()]);

      const result = await service.getMapLocations('user-1');

      expect(result.public).toEqual([
        {
          id: 'pub-pin-1',
          product_name: '公開商品',
          judgment: 'ok',
          thumbnail_url: null,
          store_name: 'ローソン新宿店',
          lat: 35.69,
          lng: 139.7,
          scanned_at: '2026-01-14T09:00:00.000Z',
        },
      ]);
      // ⚠️ プライバシー: 公開ピンに raw_text / detected / userId / memo を含めない
      expect(result.public[0]).not.toHaveProperty('raw_text');
      expect(result.public[0]).not.toHaveProperty('detected');
      expect(result.public[0]).not.toHaveProperty('userId');
      expect(result.public[0]).not.toHaveProperty('memo');
    });
  });

  describe('createHistory', () => {
    it('ScanHistoryRepository.create が1回呼ばれ、作成されたレコードを返す', async () => {
      const created = makeRecord({
        id: 'new-uuid',
        judgment: 'ng',
        detected: ['乳'],
      });
      repository.create.mockResolvedValue(created);

      const result = await service.createHistory('user-1', {
        judgment: 'ng',
        detected: ['乳'],
      });

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          judgment: 'ng',
          detected: ['乳'],
        }),
      );
      expect(result.id).toBe('new-uuid');
    });

    it('product_id / product_name / location / thumbnail_url を正しくマッピングして create に渡す', async () => {
      repository.create.mockResolvedValue(makeRecord());

      await service.createHistory('user-1', {
        judgment: 'ok',
        detected: [],
        product_id: 'prod-1',
        product_name: 'テスト商品',
        location: { store_name: 'セブン', lat: 35.6, lng: 139.7 },
        thumbnail_url: 'https://example.com/thumb.jpg',
      });

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        productId: 'prod-1',
        productName: 'テスト商品',
        judgment: 'ok',
        detected: [],
        location: { store_name: 'セブン', lat: 35.6, lng: 139.7 },
        thumbnailUrl: 'https://example.com/thumb.jpg',
        rawText: null,
      });
    });
  });

  describe('updateLocation', () => {
    const location = { store_name: 'セブンイレブン渋谷店', lat: 35.6762, lng: 139.6503 };

    it('正常系: findById → updateLocation を呼ぶ', async () => {
      repository.findById.mockResolvedValue(makeRecord({ userId: 'user-1' }));
      repository.updateLocation.mockResolvedValue(undefined);

      await service.updateLocation('rec-uuid', 'user-1', location);

      expect(repository.findById).toHaveBeenCalledWith('rec-uuid');
      expect(repository.updateLocation).toHaveBeenCalledWith('rec-uuid', location);
    });

    it('履歴が存在しない場合 NotFoundException を throw する', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.updateLocation('nonexistent', 'user-1', location),
      ).rejects.toThrow(NotFoundException);
      expect(repository.updateLocation).not.toHaveBeenCalled();
    });

    it('他ユーザーの履歴は ForbiddenException を throw する', async () => {
      repository.findById.mockResolvedValue(makeRecord({ userId: 'other-user' }));

      await expect(
        service.updateLocation('rec-uuid', 'user-1', location),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.updateLocation).not.toHaveBeenCalled();
    });
  });

  describe('updateHistory', () => {
    it('正常系: findById → repository.update が呼ばれる', async () => {
      repository.findById.mockResolvedValue(makeRecord({ userId: 'user-1' }));
      repository.update.mockResolvedValue(undefined);

      await service.updateHistory('rec-uuid', 'user-1', {
        product_name: '新商品名',
        store_name: null,
        memo: 'テストメモ',
      });

      expect(repository.findById).toHaveBeenCalledWith('rec-uuid');
      expect(repository.update).toHaveBeenCalledWith('rec-uuid', {
        productName: '新商品名',
        storeName: null,
        memo: 'テストメモ',
        isPublic: undefined,
        thumbnailUrl: undefined,
      });
    });

    it('履歴が存在しない場合 NotFoundException を throw する', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.updateHistory('nonexistent', 'user-1', { product_name: '商品名' }),
      ).rejects.toThrow(NotFoundException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('is_public: true と thumbnail_url が repository.update に正しくマッピングされる', async () => {
      repository.findById.mockResolvedValue(makeRecord({ userId: 'user-1' }));
      repository.update.mockResolvedValue(undefined);

      await service.updateHistory('rec-uuid', 'user-1', {
        is_public: true,
        thumbnail_url: 'https://s3.example.com/thumb.jpg',
      });

      expect(repository.update).toHaveBeenCalledWith('rec-uuid', {
        productName: undefined,
        storeName: undefined,
        memo: undefined,
        isPublic: true,
        thumbnailUrl: 'https://s3.example.com/thumb.jpg',
      });
    });

    it('他ユーザーの履歴は ForbiddenException を throw する', async () => {
      repository.findById.mockResolvedValue(makeRecord({ userId: 'other-user' }));

      await expect(
        service.updateHistory('rec-uuid', 'user-1', { product_name: '商品名' }),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('bulkDeleteHistory', () => {
    it('正常系: deleteManyByIds を呼ぶ', async () => {
      const mockDeleteMany = jest.fn().mockResolvedValue(undefined);
      repository['deleteManyByIds'] = mockDeleteMany;

      await service.bulkDeleteHistory('user-1', { ids: ['id-1', 'id-2'] });

      expect(mockDeleteMany).toHaveBeenCalledWith('user-1', ['id-1', 'id-2']);
    });

    it('ids が空配列のとき deleteManyByIds を呼ばずに正常終了する', async () => {
      const mockDeleteMany = jest.fn().mockResolvedValue(undefined);
      repository['deleteManyByIds'] = mockDeleteMany;

      await expect(
        service.bulkDeleteHistory('user-1', { ids: [] }),
      ).resolves.toBeUndefined();
      expect(mockDeleteMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteHistory', () => {
    it('正常系: findById → repository.deleteById が呼ばれる', async () => {
      repository.findById.mockResolvedValue(makeRecord({ userId: 'user-1' }));
      repository.deleteById.mockResolvedValue(undefined);

      await service.deleteHistory('rec-uuid', 'user-1');

      expect(repository.findById).toHaveBeenCalledWith('rec-uuid');
      expect(repository.deleteById).toHaveBeenCalledWith('rec-uuid');
    });

    it('履歴が存在しない場合 NotFoundException を throw する', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.deleteHistory('nonexistent', 'user-1'),
      ).rejects.toThrow(NotFoundException);
      expect(repository.deleteById).not.toHaveBeenCalled();
    });

    it('他ユーザーの履歴は ForbiddenException を throw する', async () => {
      repository.findById.mockResolvedValue(makeRecord({ userId: 'other-user' }));

      await expect(
        service.deleteHistory('rec-uuid', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.deleteById).not.toHaveBeenCalled();
    });
  });
});
