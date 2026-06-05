import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// allergens 初期データ（29品目）
// display_order は database.md の display_order カラムに対応する
const ALLERGENS_SEED: Array<{
  name: string;
  display_name: string;
  category: string;
  display_order: number;
  emoji: string;
}> = [
  // 特定原材料（9品目・表示義務あり）
  { name: 'えび',          display_name: 'えび',              category: 'mandatory',   display_order: 1,  emoji: '🦐' },
  { name: 'かに',          display_name: 'かに',              category: 'mandatory',   display_order: 2,  emoji: '🦀' },
  { name: 'カシューナッツ', display_name: 'カシューナッツ',    category: 'mandatory',   display_order: 3,  emoji: '🌰' },
  { name: 'くるみ',        display_name: 'くるみ',            category: 'mandatory',   display_order: 4,  emoji: '🌰' },
  { name: '小麦',          display_name: '小麦',              category: 'mandatory',   display_order: 5,  emoji: '🌾' },
  { name: 'そば',          display_name: 'そば',              category: 'mandatory',   display_order: 6,  emoji: '🍜' },
  { name: '卵',            display_name: '卵',                category: 'mandatory',   display_order: 7,  emoji: '🥚' },
  { name: '乳',            display_name: '乳',                category: 'mandatory',   display_order: 8,  emoji: '🥛' },
  { name: '落花生',        display_name: '落花生（ピーナッツ）', category: 'mandatory', display_order: 9,  emoji: '🥜' },
  // 準ずるもの（20品目・表示推奨）
  { name: 'アーモンド',       display_name: 'アーモンド',       category: 'recommended', display_order: 10, emoji: '🌰' },
  { name: 'あわび',           display_name: 'あわび',           category: 'recommended', display_order: 11, emoji: '🐚' },
  { name: 'いか',             display_name: 'いか',             category: 'recommended', display_order: 12, emoji: '🦑' },
  { name: 'いくら',           display_name: 'いくら',           category: 'recommended', display_order: 13, emoji: '🐡' },
  { name: 'オレンジ',         display_name: 'オレンジ',         category: 'recommended', display_order: 14, emoji: '🍊' },
  { name: 'キウイフルーツ',   display_name: 'キウイフルーツ',   category: 'recommended', display_order: 15, emoji: '🥝' },
  { name: '牛肉',             display_name: '牛肉',             category: 'recommended', display_order: 16, emoji: '🐄' },
  { name: 'ごま',             display_name: 'ごま',             category: 'recommended', display_order: 17, emoji: '🌱' },
  { name: 'さけ',             display_name: 'さけ',             category: 'recommended', display_order: 18, emoji: '🍣' },
  { name: 'さば',             display_name: 'さば',             category: 'recommended', display_order: 19, emoji: '🐟' },
  { name: '大豆',             display_name: '大豆',             category: 'recommended', display_order: 20, emoji: '🫘' },
  { name: '鶏肉',             display_name: '鶏肉',             category: 'recommended', display_order: 21, emoji: '🍗' },
  { name: 'バナナ',           display_name: 'バナナ',           category: 'recommended', display_order: 22, emoji: '🍌' },
  { name: 'ピスタチオ',       display_name: 'ピスタチオ',       category: 'recommended', display_order: 23, emoji: '🌰' },
  { name: '豚肉',             display_name: '豚肉',             category: 'recommended', display_order: 24, emoji: '🐷' },
  { name: 'マカダミアナッツ', display_name: 'マカダミアナッツ', category: 'recommended', display_order: 25, emoji: '🌰' },
  { name: 'もも',             display_name: 'もも',             category: 'recommended', display_order: 26, emoji: '🍑' },
  { name: 'りんご',           display_name: 'りんご',           category: 'recommended', display_order: 27, emoji: '🍎' },
  { name: 'やまいも',         display_name: 'やまいも',         category: 'recommended', display_order: 28, emoji: '🍠' },
  { name: 'ゼラチン',         display_name: 'ゼラチン',         category: 'recommended', display_order: 29, emoji: '🫙' },
];

// allergen_components 初期データ（database.md の SQL 初期データに準拠）
const ALLERGEN_COMPONENTS_SEED: Array<{
  allergen_name: string;
  canonicalName: string;
  aliases: string[];
  component_type: string;
  detectionType: string;
  riskLevel: string;
  note: string | null;
}> = [
  // =====================
  // 乳
  // =====================
  // 直接表記
  { allergen_name: '乳', canonicalName: '乳',                         aliases: [],                          component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '乳', canonicalName: '牛乳',                        aliases: ['ミルク', 'milk'],           component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '乳', canonicalName: '生乳',                        aliases: [],                          component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '乳', canonicalName: '全粉乳',                      aliases: [],                          component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '乳', canonicalName: '脱脂粉乳',                    aliases: [],                          component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '乳', canonicalName: '乳成分',                      aliases: [],                          component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: '法律上の正式表記・必須' },
  { allergen_name: '乳', canonicalName: '乳等を主要原料とする食品',    aliases: [],                          component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: '加工品の正式分類名' },
  // 派生成分
  { allergen_name: '乳', canonicalName: 'カゼイン',                    aliases: ['casein'],                  component_type: 'derivative',     detectionType: 'contains',     riskLevel: 'high',   note: '加熱で変性しない・アナフィラキシーリスク' },
  { allergen_name: '乳', canonicalName: 'ホエイ',                      aliases: ['ホエー', '乳清', 'whey'],  component_type: 'derivative',     detectionType: 'contains',     riskLevel: 'high',   note: '乳清タンパク' },
  { allergen_name: '乳', canonicalName: 'ホエイパウダー',              aliases: ['乳清パウダー'],            component_type: 'derivative',     detectionType: 'contains',     riskLevel: 'high',   note: '乳清タンパク' },
  { allergen_name: '乳', canonicalName: 'ラクトアルブミン',            aliases: [],                          component_type: 'derivative',     detectionType: 'contains',     riskLevel: 'high',   note: '乳清タンパク' },
  { allergen_name: '乳', canonicalName: 'たんぱく質濃縮ホエイパウダー', aliases: ['WPC', 'WPI'],             component_type: 'derivative',     detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '乳', canonicalName: '濃縮ホエイ',                  aliases: [],                          component_type: 'derivative',     detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '乳', canonicalName: 'ラクトース',                  aliases: ['乳糖', 'lactose'],          component_type: 'derivative',     detectionType: 'contains',     riskLevel: 'medium', note: '乳糖・精製度による' },
  // 加工品
  { allergen_name: '乳', canonicalName: 'バター',                      aliases: ['butter'],                  component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '乳', canonicalName: 'チーズ',                      aliases: ['cheese'],                  component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '乳', canonicalName: 'アイスクリーム',              aliases: [],                          component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '乳', canonicalName: '生クリーム',                  aliases: ['クリーム', 'cream'],       component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '乳', canonicalName: '練乳',                        aliases: ['加糖練乳', '濃縮乳'],      component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '乳', canonicalName: 'ヨーグルト',                  aliases: ['発酵乳'],                  component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '乳', canonicalName: 'バターオイル',                aliases: [],                          component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  // 添加物
  { allergen_name: '乳', canonicalName: 'カゼインNa',                  aliases: ['カゼインナトリウム'],      component_type: 'additive',       detectionType: 'contains',     riskLevel: 'high',   note: '添加物表記' },
  { allergen_name: '乳', canonicalName: 'カゼインCa',                  aliases: [],                          component_type: 'additive',       detectionType: 'contains',     riskLevel: 'high',   note: '添加物表記' },
  // 一括表示パターン
  { allergen_name: '乳', canonicalName: '乳成分を含む',                aliases: [],                          component_type: 'contains_label', detectionType: 'partial',      riskLevel: 'high',   note: '一括表示の正式表記' },
  { allergen_name: '乳', canonicalName: '一部に乳成分を含む',          aliases: [],                          component_type: 'contains_label', detectionType: 'partial',      riskLevel: 'high',   note: null },
  { allergen_name: '乳', canonicalName: '乳由来',                      aliases: [],                          component_type: 'contains_label', detectionType: 'partial',      riskLevel: 'high',   note: '添加物の由来表記' },
  // コンタミ（注意喚起）
  { allergen_name: '乳', canonicalName: '乳を含む製品を製造',          aliases: [],                          component_type: 'contains_label', detectionType: 'may_contain',  riskLevel: 'medium', note: '製造ラインのコンタミ注意喚起' },
  // 誤検出除外
  { allergen_name: '乳', canonicalName: '乳化剤',                      aliases: [],                          component_type: 'exclude',        detectionType: 'contains',     riskLevel: 'ignore', note: '乳由来でない場合が多い' },
  { allergen_name: '乳', canonicalName: '乳酸菌',                      aliases: [],                          component_type: 'exclude',        detectionType: 'contains',     riskLevel: 'ignore', note: '乳アレルギーと無関係' },
  { allergen_name: '乳', canonicalName: '乳酸',                        aliases: [],                          component_type: 'exclude',        detectionType: 'contains',     riskLevel: 'ignore', note: '乳アレルギーと無関係' },
  { allergen_name: '乳', canonicalName: 'カカオバター',                aliases: [],                          component_type: 'exclude',        detectionType: 'contains',     riskLevel: 'ignore', note: '乳ではない・植物性' },

  // =====================
  // 卵
  // =====================
  { allergen_name: '卵', canonicalName: '卵',                          aliases: ['玉子', 'たまご', 'エッグ', 'egg'], component_type: 'direct',    detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '卵', canonicalName: '卵黄',                        aliases: ['egg yolk'],                component_type: 'derivative',     detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '卵', canonicalName: '卵白',                        aliases: ['egg white', 'albumin'],    component_type: 'derivative',     detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '卵', canonicalName: 'オボムコイド',                aliases: [],                          component_type: 'derivative',     detectionType: 'contains',     riskLevel: 'high',   note: '加熱しても残るアレルギー・要注意' },
  { allergen_name: '卵', canonicalName: 'マヨネーズ',                  aliases: [],                          component_type: 'compound',       detectionType: 'contains',     riskLevel: 'medium', note: '複合原材料・卵を含む' },
  { allergen_name: '卵', canonicalName: 'リゾチーム',                  aliases: [],                          component_type: 'additive',       detectionType: 'contains',     riskLevel: 'high',   note: '卵白由来添加物' },
  { allergen_name: '卵', canonicalName: 'レシチン（卵由来）',          aliases: [],                          component_type: 'additive',       detectionType: 'contains',     riskLevel: 'high',   note: '大豆由来は卵ではない' },
  { allergen_name: '卵', canonicalName: '卵を含む',                    aliases: [],                          component_type: 'contains_label', detectionType: 'partial',      riskLevel: 'high',   note: '一括表示' },
  { allergen_name: '卵', canonicalName: '一部に卵を含む',              aliases: [],                          component_type: 'contains_label', detectionType: 'partial',      riskLevel: 'high',   note: null },
  { allergen_name: '卵', canonicalName: '卵殻カルシウム',              aliases: [],                          component_type: 'exclude',        detectionType: 'contains',     riskLevel: 'ignore', note: '抗原性ほぼなし' },

  // =====================
  // 小麦
  // =====================
  { allergen_name: '小麦', canonicalName: '小麦',                      aliases: ['wheat'],                   component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '小麦', canonicalName: '小麦粉',                    aliases: ['強力粉', '薄力粉', '中力粉', 'wheat flour'], component_type: 'direct', detectionType: 'contains', riskLevel: 'high', note: null },
  { allergen_name: '小麦', canonicalName: 'デュラム小麦',              aliases: ['デュラムセモリナ', 'durum'], component_type: 'direct',       detectionType: 'contains',     riskLevel: 'high',   note: 'パスタ原料' },
  { allergen_name: '小麦', canonicalName: 'グルテン',                  aliases: ['gluten'],                  component_type: 'derivative',     detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '小麦', canonicalName: '麦芽',                      aliases: ['malt'],                    component_type: 'derivative',     detectionType: 'contains',     riskLevel: 'medium', note: 'ビール・麦芽糖' },
  { allergen_name: '小麦', canonicalName: '麩',                        aliases: [],                          component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '小麦', canonicalName: 'パン粉',                    aliases: [],                          component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '小麦', canonicalName: 'しょうゆ',                  aliases: ['醤油', 'soy sauce'],       component_type: 'processed',      detectionType: 'contains',     riskLevel: 'low',    note: '抗原性低・摂取可能患者あり' },
  { allergen_name: '小麦', canonicalName: '味噌',                      aliases: [],                          component_type: 'processed',      detectionType: 'contains',     riskLevel: 'low',    note: '抗原性低' },
  { allergen_name: '小麦', canonicalName: 'うどん',                    aliases: [],                          component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '小麦', canonicalName: 'グルテン（小麦由来）',      aliases: [],                          component_type: 'additive',       detectionType: 'contains',     riskLevel: 'high',   note: '添加物表記' },
  { allergen_name: '小麦', canonicalName: 'ベーキングパウダー（小麦由来）', aliases: [],                    component_type: 'additive',       detectionType: 'contains',     riskLevel: 'medium', note: null },
  { allergen_name: '小麦', canonicalName: '小麦を含む',                aliases: [],                          component_type: 'contains_label', detectionType: 'partial',      riskLevel: 'high',   note: '一括表示' },
  { allergen_name: '小麦', canonicalName: '一部に小麦を含む',          aliases: [],                          component_type: 'contains_label', detectionType: 'partial',      riskLevel: 'high',   note: null },

  // =====================
  // 大豆
  // =====================
  { allergen_name: '大豆', canonicalName: '大豆',                      aliases: ['soy', 'soybean'],          component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '大豆', canonicalName: '大豆たんぱく',              aliases: ['植物性たん白', '植物性タンパク'], component_type: 'derivative', detectionType: 'contains',    riskLevel: 'high',   note: null },
  { allergen_name: '大豆', canonicalName: '豆腐',                      aliases: [],                          component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '大豆', canonicalName: '油揚げ',                    aliases: ['厚揚げ'],                  component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '大豆', canonicalName: '豆乳',                      aliases: [],                          component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '大豆', canonicalName: 'きなこ',                    aliases: ['黄粉'],                    component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '大豆', canonicalName: 'おから',                    aliases: [],                          component_type: 'processed',      detectionType: 'contains',     riskLevel: 'medium', note: null },
  { allergen_name: '大豆', canonicalName: '湯葉',                      aliases: [],                          component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '大豆', canonicalName: '納豆',                      aliases: [],                          component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: '大豆', canonicalName: 'みそ',                      aliases: ['味噌'],                    component_type: 'processed',      detectionType: 'contains',     riskLevel: 'low',    note: '抗原性低' },
  { allergen_name: '大豆', canonicalName: 'しょうゆ（大豆）',          aliases: [],                          component_type: 'processed',      detectionType: 'contains',     riskLevel: 'low',    note: '抗原性低・摂取可能患者あり' },
  { allergen_name: '大豆', canonicalName: '大豆油',                    aliases: [],                          component_type: 'processed',      detectionType: 'contains',     riskLevel: 'low',    note: '高精製品は抗原性低' },
  { allergen_name: '大豆', canonicalName: 'レシチン（大豆由来）',      aliases: ['大豆レシチン'],            component_type: 'additive',       detectionType: 'contains',     riskLevel: 'low',    note: '高精製品は抗原性低' },
  { allergen_name: '大豆', canonicalName: '大豆を含む',                aliases: [],                          component_type: 'contains_label', detectionType: 'partial',      riskLevel: 'high',   note: '一括表示' },

  // =====================
  // くるみ
  // =====================
  { allergen_name: 'くるみ', canonicalName: 'くるみ',                  aliases: ['ウォールナッツ', 'walnut'], component_type: 'direct',        detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: 'くるみ', canonicalName: 'ペカンナッツ',            aliases: ['pecan'],                   component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: 'くるみの近縁種・交差反応あり' },
  { allergen_name: 'くるみ', canonicalName: 'くるみを含む',            aliases: [],                          component_type: 'contains_label', detectionType: 'partial',      riskLevel: 'high',   note: null },

  // =====================
  // カシューナッツ
  // =====================
  { allergen_name: 'カシューナッツ', canonicalName: 'カシューナッツ',  aliases: ['cashew', 'カシュー'],      component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: 'カシューナッツ', canonicalName: 'カシューペースト', aliases: [],                         component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },

  // =====================
  // アーモンド
  // =====================
  { allergen_name: 'アーモンド', canonicalName: 'アーモンド',          aliases: ['almond'],                  component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: 'アーモンド', canonicalName: 'アーモンドプードル',  aliases: ['アーモンドパウダー'],      component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: 'アーモンドの粉末' },
  { allergen_name: 'アーモンド', canonicalName: 'アーモンドミルク',    aliases: [],                          component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: 'アーモンド', canonicalName: 'ヘーゼルナッツ',      aliases: ['hazelnut', '榛の実'],      component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: '輸入菓子で頻出・交差反応注意' },
  { allergen_name: 'アーモンド', canonicalName: 'ブラジルナッツ',      aliases: ['brazil nut'],              component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: '輸入品で注意' },

  // =====================
  // ピスタチオ
  // =====================
  { allergen_name: 'ピスタチオ', canonicalName: 'ピスタチオ',          aliases: ['pistachio'],               component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: null },
  { allergen_name: 'ピスタチオ', canonicalName: 'ピスタチオペースト',  aliases: [],                          component_type: 'processed',      detectionType: 'contains',     riskLevel: 'high',   note: null },

  // =====================
  // マカダミアナッツ
  // =====================
  { allergen_name: 'マカダミアナッツ', canonicalName: 'マカダミアナッツ', aliases: ['macadamia'],            component_type: 'direct',         detectionType: 'contains',     riskLevel: 'high',   note: null },
];

async function main(): Promise<void> {
  // plans を upsert（無料・プレミアムプランの初期データ）
  await prisma.plan.upsert({
    where: { name: 'free' },
    update: { dailyScanLimit: 20 },
    create: {
      name: 'free',
      displayName: '無料プラン',
      dailyScanLimit: 20,
      priceMonthlyJpy: 0,
      priceYearlyJpy: 0,
    },
  });
  await prisma.plan.upsert({
    where: { name: 'premium' },
    update: { dailyScanLimit: 50 },
    create: {
      name: 'premium',
      displayName: 'プレミアムプラン',
      dailyScanLimit: 50,
      priceMonthlyJpy: 980,
      priceYearlyJpy: 9800,
    },
  });

  // allergens を upsert（重複実行しても安全）
  for (const allergen of ALLERGENS_SEED) {
    await prisma.allergen.upsert({
      where: { name: allergen.name },
      update: {
        displayName: allergen.display_name,
        category: allergen.category,
        displayOrder: allergen.display_order,
        emoji: allergen.emoji,
      },
      create: {
        name: allergen.name,
        displayName: allergen.display_name,
        category: allergen.category,
        displayOrder: allergen.display_order,
        emoji: allergen.emoji,
      },
    });
  }

  // allergen_components を upsert（allergen_name + canonicalName で特定・冪等性を担保）
  for (const component of ALLERGEN_COMPONENTS_SEED) {
    const existing = await prisma.allergenComponent.findFirst({
      where: {
        allergenName: component.allergen_name,
        canonicalName: component.canonicalName,
      },
    });

    if (existing) {
      await prisma.allergenComponent.update({
        where: { id: existing.id },
        data: {
          aliases: component.aliases,
          componentType: component.component_type,
          detectionType: component.detectionType,
          riskLevel: component.riskLevel,
          note: component.note,
        },
      });
    } else {
      await prisma.allergenComponent.create({
        data: {
          allergenName: component.allergen_name,
          canonicalName: component.canonicalName,
          aliases: component.aliases,
          componentType: component.component_type,
          detectionType: component.detectionType,
          riskLevel: component.riskLevel,
          note: component.note,
        },
      });
    }
  }
}

main()
  .catch((e) => {
    process.stderr.write(`Seed error: ${String(e)}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
