/**
 * 月次バッチ: 主要都市の店舗情報を Yahoo! Local Search API から取得し DB へ保存する。
 *
 * 実行:
 *   pnpm --filter backend exec ts-node --project tsconfig.json scripts/warmup-store-cache.ts
 *   pnpm --filter backend exec ts-node --project tsconfig.json scripts/warmup-store-cache.ts --start-index 20
 *
 * Lambda 15分制限対策:
 *   EventBridge で --start-index を変えながら複数回呼び出す。
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { YahooLocalSearchClient } from '../src/shared/clients/yahoo-local-search.client';
import { toGridKey } from '../src/shared/store-cache.repository';
import { STORE_CACHE_EXPIRE_DAYS, STORE_CACHE_RADIUS_KM } from '../src/shared/places/places.constants';

/** metro: 大都市（30日）/ regional: 地方都市（90日） */
type CityTier = 'metro' | 'regional';

/** backend/.env を読んで未設定の環境変数のみ反映する（dotenv 非依存） */
const loadEnv = (): void => {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  }
};

loadEnv();

const prisma = new PrismaClient();

type City = {
  name: string;
  lat: number;
  lng: number;
  tier: CityTier;
};

/**
 * 都市リスト。
 * tier='metro': 人口 100 万人超の大都市 → expires_at = 30 日（店舗入れ替わりが速い）
 * tier='regional': その他県庁所在地・主要都市 → expires_at = 90 日
 */
const CITIES: City[] = [
  // ── metro（100万人超・30日）────────────────────────────────────────────
  { name: '東京（23区）', lat: 35.6895, lng: 139.6917, tier: 'metro' },
  { name: '横浜',         lat: 35.4437, lng: 139.6380, tier: 'metro' },
  { name: '大阪',         lat: 34.6937, lng: 135.5023, tier: 'metro' },
  { name: '名古屋',       lat: 35.1815, lng: 136.9066, tier: 'metro' },
  { name: '札幌',         lat: 43.0642, lng: 141.3469, tier: 'metro' },
  { name: '福岡',         lat: 33.5904, lng: 130.4017, tier: 'metro' },
  { name: '川崎',         lat: 35.5167, lng: 139.7004, tier: 'metro' },
  { name: '神戸',         lat: 34.6913, lng: 135.1830, tier: 'metro' },
  { name: '京都',         lat: 35.0116, lng: 135.7681, tier: 'metro' },
  { name: 'さいたま',     lat: 35.8617, lng: 139.6455, tier: 'metro' },
  { name: '広島',         lat: 34.3853, lng: 132.4553, tier: 'metro' },
  { name: '仙台',         lat: 38.2682, lng: 140.8694, tier: 'metro' },
  { name: '千葉',         lat: 35.6074, lng: 140.1065, tier: 'metro' },
  { name: '堺',           lat: 34.5733, lng: 135.4830, tier: 'metro' },
  { name: '北九州',       lat: 33.8834, lng: 130.8751, tier: 'metro' },
  { name: '新潟',         lat: 37.9026, lng: 139.0232, tier: 'metro' },
  { name: '浜松',         lat: 34.7108, lng: 137.7260, tier: 'metro' },
  { name: '静岡',         lat: 34.9769, lng: 138.3831, tier: 'metro' },
  { name: '相模原',       lat: 35.5744, lng: 139.3730, tier: 'metro' },
  { name: '熊本',         lat: 32.8031, lng: 130.7079, tier: 'metro' },

  // ── regional（その他県庁所在地・主要都市・90日）──────────────────────
  { name: '旭川',   lat: 43.7711, lng: 142.3650, tier: 'regional' },
  { name: '函館',   lat: 41.7688, lng: 140.7288, tier: 'regional' },
  { name: '盛岡',   lat: 39.7036, lng: 141.1527, tier: 'regional' },
  { name: '秋田',   lat: 39.7186, lng: 140.1023, tier: 'regional' },
  { name: '山形',   lat: 38.2404, lng: 140.3633, tier: 'regional' },
  { name: '福島',   lat: 37.7608, lng: 140.4748, tier: 'regional' },
  { name: '郡山',   lat: 37.4003, lng: 140.3633, tier: 'regional' },
  { name: 'いわき', lat: 37.0502, lng: 140.8877, tier: 'regional' },
  { name: '水戸',   lat: 36.3418, lng: 140.4468, tier: 'regional' },
  { name: '宇都宮', lat: 36.5658, lng: 139.8836, tier: 'regional' },
  { name: '前橋',   lat: 36.3895, lng: 139.0634, tier: 'regional' },
  { name: '高崎',   lat: 36.3219, lng: 139.0030, tier: 'regional' },
  { name: '川越',   lat: 35.9250, lng: 139.4860, tier: 'regional' },
  { name: '船橋',   lat: 35.6946, lng: 139.9829, tier: 'regional' },
  { name: '八王子', lat: 35.6665, lng: 139.3166, tier: 'regional' },
  { name: '町田',   lat: 35.5404, lng: 139.4468, tier: 'regional' },
  { name: '藤沢',   lat: 35.3381, lng: 139.4917, tier: 'regional' },
  { name: '甲府',   lat: 35.6642, lng: 138.5681, tier: 'regional' },
  { name: '長野',   lat: 36.6513, lng: 138.1810, tier: 'regional' },
  { name: '富山',   lat: 36.6953, lng: 137.2113, tier: 'regional' },
  { name: '金沢',   lat: 36.5944, lng: 136.6256, tier: 'regional' },
  { name: '福井',   lat: 36.0652, lng: 136.2216, tier: 'regional' },
  { name: '大津',   lat: 35.0045, lng: 135.8686, tier: 'regional' },
  { name: '奈良',   lat: 34.6851, lng: 135.8048, tier: 'regional' },
  { name: '和歌山', lat: 34.2261, lng: 135.1675, tier: 'regional' },
  { name: '豊田',   lat: 35.0854, lng: 137.1566, tier: 'regional' },
  { name: '岡崎',   lat: 34.9552, lng: 137.1749, tier: 'regional' },
  { name: '一宮',   lat: 35.3039, lng: 136.8001, tier: 'regional' },
  { name: '豊橋',   lat: 34.7693, lng: 137.3916, tier: 'regional' },
  { name: '四日市', lat: 34.9646, lng: 136.6247, tier: 'regional' },
  { name: '姫路',   lat: 34.8394, lng: 134.6939, tier: 'regional' },
  { name: '西宮',   lat: 34.7381, lng: 135.3419, tier: 'regional' },
  { name: '尼崎',   lat: 34.7326, lng: 135.4062, tier: 'regional' },
  { name: '倉敷',   lat: 34.5850, lng: 133.7714, tier: 'regional' },
  { name: '福山',   lat: 34.4858, lng: 133.3625, tier: 'regional' },
  { name: '下関',   lat: 33.9538, lng: 130.9296, tier: 'regional' },
  { name: '鳥取',   lat: 35.5011, lng: 134.2351, tier: 'regional' },
  { name: '松江',   lat: 35.4722, lng: 133.0505, tier: 'regional' },
  { name: '岡山',   lat: 34.6551, lng: 133.9195, tier: 'regional' },
  { name: '山口',   lat: 34.1860, lng: 131.4706, tier: 'regional' },
  { name: '徳島',   lat: 34.0658, lng: 134.5593, tier: 'regional' },
  { name: '高松',   lat: 34.3401, lng: 134.0434, tier: 'regional' },
  { name: '松山',   lat: 33.8392, lng: 132.7657, tier: 'regional' },
  { name: '高知',   lat: 33.5597, lng: 133.5311, tier: 'regional' },
  { name: '久留米', lat: 33.3194, lng: 130.5082, tier: 'regional' },
  { name: '佐賀',   lat: 33.2635, lng: 130.3010, tier: 'regional' },
  { name: '長崎',   lat: 32.7448, lng: 129.8737, tier: 'regional' },
  { name: '大分',   lat: 33.2382, lng: 131.6126, tier: 'regional' },
  { name: '宮崎',   lat: 31.9111, lng: 131.4239, tier: 'regional' },
  { name: '鹿児島', lat: 31.5966, lng: 130.5571, tier: 'regional' },
  { name: '那覇',   lat: 26.2124, lng: 127.6809, tier: 'regional' },
  { name: '沖縄市', lat: 26.3344, lng: 127.8056, tier: 'regional' },
];

async function warmup(startIndex: number): Promise<void> {
  const yahoo = new YahooLocalSearchClient();
  let totalStores = 0;
  const batchStartedAt = new Date();
  const targets = CITIES.slice(startIndex);

  console.log(`バッチ開始: ${startIndex} 番目から / 全 ${CITIES.length} 都市`);

  for (let i = 0; i < targets.length; i++) {
    const city = targets[i];
    const globalIndex = startIndex + i;
    const gridKey = toGridKey(city.lat, city.lng);
    // tier.toUpperCase() は string になるため、条件分岐で安全にキーを選択する
    const expireDays =
      city.tier === 'metro' ? STORE_CACHE_EXPIRE_DAYS.METRO : STORE_CACHE_EXPIRE_DAYS.REGIONAL;

    console.log(`[${globalIndex + 1}/${CITIES.length}] ${city.name} (${city.tier}, ${expireDays}日) を取得中...`);

    const stores = await yahoo.fetchAllStores(city.lat, city.lng, STORE_CACHE_RADIUS_KM);

    if (stores.length > 0) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expireDays);

      // Step 1: 新データを UPSERT（ダウンタイムなし・100件ずつトランザクション）
      const CHUNK_SIZE = 100;
      for (let j = 0; j < stores.length; j += CHUNK_SIZE) {
        const chunk = stores.slice(j, j + CHUNK_SIZE);
        await prisma.$transaction(
          chunk.map((s) =>
            prisma.storeCache.upsert({
              where: { uid: s.uid },
              create: {
                uid: s.uid,
                name: s.name,
                address: s.address,
                genre: s.genre,
                lat: s.lat,
                lng: s.lng,
                source: 'batch',
                expiresAt,
              },
              update: {
                name: s.name,
                address: s.address,
                genre: s.genre,
                lat: s.lat,
                lng: s.lng,
                source: 'batch',
                expiresAt,
              },
            }),
          ),
        );
      }

      // Step 2: 旧バッチデータを物理削除（UPSERT 完了後）
      // gridKey から緯度・経度スナップ値を復元し、半径分の bbox でスコープを絞る
      const degreeMargin = STORE_CACHE_RADIUS_KM / 111;
      const [latSnapStr, lngSnapStr] = gridKey.split('_');
      const latSnap = Number(latSnapStr) / 100;
      const lngSnap = Number(lngSnapStr) / 100;
      const deleted = await prisma.storeCache.deleteMany({
        where: {
          source: 'batch',
          updatedAt: { lt: batchStartedAt },
          lat: { gte: latSnap - degreeMargin, lte: latSnap + degreeMargin },
          lng: { gte: lngSnap - degreeMargin, lte: lngSnap + degreeMargin },
        },
      });

      totalStores += stores.length;
      console.log(`  → ${stores.length} 件取得 / 旧データ ${deleted.count} 件削除 / 累計 ${totalStores} 件`);
    } else {
      console.log(`  → 0 件（スキップ）`);
    }

    // エリアカバー記録を更新
    const areaExpiresAt = new Date();
    areaExpiresAt.setDate(areaExpiresAt.getDate() + expireDays);
    await prisma.storeCacheArea.upsert({
      where: { gridKey },
      create: {
        gridKey,
        radiusKm: STORE_CACHE_RADIUS_KM,
        tier: city.tier,
        expiresAt: areaExpiresAt,
      },
      update: {
        fetchedAt: new Date(),
        tier: city.tier,
        expiresAt: areaExpiresAt,
      },
    });

    // Yahoo API レート制限対策（都市間で 1 秒待機）
    await new Promise((r) => setTimeout(r, 1_000));
  }

  console.log(`\nバッチ完了: ${targets.length} 都市 / ${totalStores} 件`);
  await prisma.$disconnect();
}

// --start-index N 引数を解析する
const args = process.argv.slice(2);
const startIndexArg = args.indexOf('--start-index');
const startIndex = startIndexArg >= 0 ? Number(args[startIndexArg + 1]) : 0;

void warmup(startIndex);
