import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { HistoryService } from './history.service';
import { ScanHistoryRepository } from './scan-history.repository';
import { ProductRepository } from '../products/product.repository';
import { UsersRepository } from '../users/users.repository';
import { AllergenComponentRepository } from '../allergens/allergen-component.repository';
import type { ScanHistoryRecord } from './scan-history.repository';

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
    findByUser: jest.Mock;
    create: jest.Mock;
    findById: jest.Mock;
    updateLocation: jest.Mock;
    update: jest.Mock;
    deleteById: jest.Mock;
    deleteManyByIds: jest.Mock;
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
      findByUser: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      updateLocation: jest.fn(),
      update: jest.fn(),
      deleteById: jest.fn(),
      deleteManyByIds: jest.fn(),
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
      it('20件以下なら items をそのまま返し next_before が null になる', async () => {
        const records = [
          makeRecord(),
          makeRecord({
            id: 'rec-2',
            scannedAt: new Date('2026-01-14T10:00:00.000Z'),
          }),
        ];
        repository.findByUser.mockResolvedValue(records);

        const result = await service.getHistory('user-1', {});

        expect(result.items).toHaveLength(2);
        expect(result.next_before).toBeNull();
        expect(repository.findByUser).toHaveBeenCalledWith('user-1', {
          before: undefined,
          judgment: 'all',
          limit: 20,
        });
      });

      it('21件返却されたとき items が20件になり next_before が ISO8601 文字列になる', async () => {
        const records = Array.from({ length: 21 }, (_, i) =>
          makeRecord({
            id: `rec-${i}`,
            scannedAt: new Date(Date.now() - i * 1000),
          }),
        );
        repository.findByUser.mockResolvedValue(records);

        const result = await service.getHistory('user-1', {});

        expect(result.items).toHaveLength(20);
        expect(result.next_before).not.toBeNull();
        // next_before は ISO8601 形式
        expect(new Date(result.next_before!).toISOString()).toBe(
          result.next_before,
        );
      });
    });

    describe('カーソルあり', () => {
      it('before を Date に変換して findByUser に渡す', async () => {
        repository.findByUser.mockResolvedValue([]);
        const beforeStr = '2026-01-10T00:00:00.000Z';

        await service.getHistory('user-1', { before: beforeStr });

        expect(repository.findByUser).toHaveBeenCalledWith('user-1', {
          before: new Date(beforeStr),
          judgment: 'all',
          limit: 20,
        });
      });
    });

    describe('judgment=ng フィルタ', () => {
      it('judgment=ng として findByUser を呼び、ng レコードのみ返す', async () => {
        const ngRecord = makeRecord({ judgment: 'ng' });
        repository.findByUser.mockResolvedValue([ngRecord]);

        const result = await service.getHistory('user-1', { judgment: 'ng' });

        expect(result.items).toHaveLength(1);
        expect(result.items[0].judgment).toBe('ng');
        expect(repository.findByUser).toHaveBeenCalledWith('user-1', {
          before: undefined,
          judgment: 'ng',
          limit: 20,
        });
      });
    });

    describe('q / store 検索パラメータ', () => {
      it('q（商品名）と store（店舗名）が findByUser に渡される', async () => {
        repository.findByUser.mockResolvedValue([]);

        await service.getHistory('user-1', { q: 'グミ', store: 'セブン' });

        expect(repository.findByUser).toHaveBeenCalledWith('user-1', {
          before: undefined,
          judgment: 'all',
          limit: 20,
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
        expect(repository.findByUser).not.toHaveBeenCalled();
      });
    });

    describe('アレルギー設定追加後の再評価（安全設計）', () => {
      it('rawText に卵成分が含まれる ok 履歴は ng に上書きされる', async () => {
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        allergenComponentRepository.findByAllergens.mockResolvedValue([eggComponent]);
        const record = makeRecord({
          judgment: 'ok',
          detected: [],
          rawText: '原材料：全卵、小麦粉、砂糖',
        });
        repository.findByUser.mockResolvedValue([record]);

        const result = await service.getHistory('user-1', {});

        expect(result.items[0].judgment).toBe('ng');
        expect(result.items[0].detected).toContain('卵');
      });

      it('rawText にエイリアス（卵黄）が含まれる場合も ng に上書きされる', async () => {
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        allergenComponentRepository.findByAllergens.mockResolvedValue([eggComponent]);
        const record = makeRecord({
          judgment: 'ok',
          detected: [],
          rawText: '原材料：卵黄、砂糖、バター',
        });
        repository.findByUser.mockResolvedValue([record]);

        const result = await service.getHistory('user-1', {});

        expect(result.items[0].judgment).toBe('ng');
        expect(result.items[0].detected).toContain('卵');
      });

      it('すでに卵成分が detected に含まれる場合は重複追加しない', async () => {
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        allergenComponentRepository.findByAllergens.mockResolvedValue([eggComponent]);
        const record = makeRecord({
          judgment: 'ng',
          detected: ['全卵'],
          rawText: '原材料：全卵、小麦粉',
        });
        repository.findByUser.mockResolvedValue([record]);

        const result = await service.getHistory('user-1', {});

        // 'ng' のまま・'卵' は追加されない（全卵がすでに detected に含まれているため）
        expect(result.items[0].judgment).toBe('ng');
        expect(result.items[0].detected).toEqual(['全卵']);
      });

      it('rawText が null のレコードは変更しない', async () => {
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        allergenComponentRepository.findByAllergens.mockResolvedValue([eggComponent]);
        productRepository.findRawTextsByIds.mockResolvedValue(new Map());
        const record = makeRecord({ judgment: 'ok', detected: [], rawText: null, productId: null });
        repository.findByUser.mockResolvedValue([record]);

        const result = await service.getHistory('user-1', {});

        expect(result.items[0].judgment).toBe('ok');
        expect(result.items[0].detected).toEqual([]);
      });

      it('rawText が null でも productId がある場合は products.rawText を使用する', async () => {
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        allergenComponentRepository.findByAllergens.mockResolvedValue([eggComponent]);
        productRepository.findRawTextsByIds.mockResolvedValue(
          new Map([['prod-1', '原材料：全卵、砂糖']]),
        );
        const record = makeRecord({
          judgment: 'ok',
          detected: [],
          rawText: null,
          productId: 'prod-1',
        });
        repository.findByUser.mockResolvedValue([record]);

        const result = await service.getHistory('user-1', {});

        expect(result.items[0].judgment).toBe('ng');
        expect(result.items[0].detected).toContain('卵');
      });

      it('アレルギー設定がない場合は再評価をスキップする', async () => {
        usersRepository.findById.mockResolvedValue(makeUserNoAllergies());
        const record = makeRecord({ judgment: 'ok', detected: [], rawText: '原材料：全卵' });
        repository.findByUser.mockResolvedValue([record]);

        const result = await service.getHistory('user-1', {});

        expect(result.items[0].judgment).toBe('ok');
        expect(allergenComponentRepository.findByAllergens).not.toHaveBeenCalled();
      });

      it('アレルゲンが detected 済み・partial 判定のとき raw_text に成分があれば ng に升格する', async () => {
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        allergenComponentRepository.findByAllergens.mockResolvedValue([eggComponent]);
        const record = makeRecord({
          judgment: 'partial',
          detected: ['卵'],
          rawText: '原材料：全卵、小麦粉、砂糖',
        });
        repository.findByUser.mockResolvedValue([record]);

        const result = await service.getHistory('user-1', {});

        // partial → ng に升格し、detected は重複追加しない
        expect(result.items[0].judgment).toBe('ng');
        expect(result.items[0].detected).toEqual(['卵']);
      });

      it('アレルゲンが detected 済み・ok 判定のとき raw_text に成分があれば ng に升格する', async () => {
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        allergenComponentRepository.findByAllergens.mockResolvedValue([eggComponent]);
        const record = makeRecord({
          judgment: 'ok',
          detected: ['全卵'],
          rawText: '原材料：全卵、砂糖',
        });
        repository.findByUser.mockResolvedValue([record]);

        const result = await service.getHistory('user-1', {});

        expect(result.items[0].judgment).toBe('ng');
        expect(result.items[0].detected).toEqual(['全卵']);
      });

      it('OFF にしたアレルギーは detected から消え judgment も追従する（products.allergens 照合）', async () => {
        // 卵のみ有効（りんごは設定なし = 無効）のユーザー
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        allergenComponentRepository.findByAllergens.mockResolvedValue([eggComponent]);
        // スキャン時点では りんご 有効だったため snapshot は ng / ['りんご']
        const record = makeRecord({
          judgment: 'ng',
          detected: ['りんご'],
          productId: 'prod-1',
          rawText: '原材料：りんご、砂糖',
        });
        repository.findByUser.mockResolvedValue([record]);
        productRepository.findAllergensByIds.mockResolvedValue(
          new Map([
            ['prod-1', { contains: ['りんご'], partial: [], components: ['りんご'] }],
          ]),
        );

        const result = await service.getHistory('user-1', {});

        // りんごが無効になったので detected から消え、judgment は ok に追従する
        expect(result.items[0].judgment).toBe('ok');
        expect(result.items[0].detected).toEqual([]);
      });

      it('ON にしたアレルギーは products.allergens 照合で detected に現れる', async () => {
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        allergenComponentRepository.findByAllergens.mockResolvedValue([eggComponent]);
        // スキャン時点では 卵 無効だったため snapshot は ok / []
        const record = makeRecord({
          judgment: 'ok',
          detected: [],
          productId: 'prod-1',
          rawText: null,
        });
        repository.findByUser.mockResolvedValue([record]);
        productRepository.findAllergensByIds.mockResolvedValue(
          new Map([
            ['prod-1', { contains: ['卵'], partial: [], components: ['全卵'] }],
          ]),
        );

        const result = await service.getHistory('user-1', {});

        expect(result.items[0].judgment).toBe('ng');
        expect(result.items[0].detected).toEqual(['卵']);
      });

      it('partial は partialAlert が有効な場合のみ partial 判定として detected に現れる', async () => {
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        allergenComponentRepository.findByAllergens.mockResolvedValue([eggComponent]);
        const record = makeRecord({
          judgment: 'ok',
          detected: [],
          productId: 'prod-1',
          rawText: null,
        });
        repository.findByUser.mockResolvedValue([record]);
        productRepository.findAllergensByIds.mockResolvedValue(
          new Map([
            ['prod-1', { contains: [], partial: ['卵'], components: ['一部に卵を含む'] }],
          ]),
        );

        const result = await service.getHistory('user-1', {});

        expect(result.items[0].judgment).toBe('partial');
        expect(result.items[0].detected).toEqual(['卵']);
      });

      it('旧形式（成分テキスト入り products.allergens）でも rawText 照合の安全網で ng を維持する', async () => {
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        allergenComponentRepository.findByAllergens.mockResolvedValue([eggComponent]);
        // 旧データ: products.allergens.contains に成分テキストが入っており名前一致しない
        const record = makeRecord({
          judgment: 'ng',
          detected: ['マヨネーズ(全卵を含む)'],
          productId: 'prod-1',
          rawText: '原材料：マヨネーズ(全卵を含む)、砂糖',
        });
        repository.findByUser.mockResolvedValue([record]);
        productRepository.findAllergensByIds.mockResolvedValue(
          new Map([
            [
              'prod-1',
              {
                contains: ['マヨネーズ(全卵を含む)'],
                partial: [],
                components: ['マヨネーズ(全卵を含む)'],
              },
            ],
          ]),
        );

        const result = await service.getHistory('user-1', {});

        // 名前一致では ok になるが、rawText 安全網が全卵を検出して ng に戻す
        expect(result.items[0].judgment).toBe('ng');
        expect(result.items[0].detected).toContain('卵');
      });

      it('exclude 型の成分はマッチ対象に含めない', async () => {
        usersRepository.findById.mockResolvedValue(makeUserWithEgg());
        const excludeComponent = { ...eggComponent, componentType: 'exclude', canonicalName: '乳酸菌' };
        allergenComponentRepository.findByAllergens.mockResolvedValue([excludeComponent]);
        const record = makeRecord({
          judgment: 'ok',
          detected: [],
          rawText: '原材料：乳酸菌、砂糖',
        });
        repository.findByUser.mockResolvedValue([record]);

        const result = await service.getHistory('user-1', {});

        // exclude 型なので ng に上書きされない
        expect(result.items[0].judgment).toBe('ok');
      });
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
