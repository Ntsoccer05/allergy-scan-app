import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// allergens 初期データ（29品目）
// display_order は database.md の display_order カラムに対応する
// emoji フィールドは SVG アイコンのファイル名スラッグとして使用
// 対応ファイル: frontend/public/icons/allergens/{emoji}.svg
const ALLERGENS_SEED: Array<{
  name: string;
  display_name: string;
  category: string;
  display_order: number;
  emoji: string;
}> = [
  // 特定原材料（9品目・表示義務あり）
  { name: 'えび',          display_name: 'えび',              category: 'mandatory',   display_order: 1,  emoji: 'ebi' },
  { name: 'かに',          display_name: 'かに',              category: 'mandatory',   display_order: 2,  emoji: 'kani' },
  { name: 'カシューナッツ', display_name: 'カシューナッツ',    category: 'mandatory',   display_order: 3,  emoji: 'cashew' },
  { name: 'くるみ',        display_name: 'くるみ',            category: 'mandatory',   display_order: 4,  emoji: 'walnut' },
  { name: '小麦',          display_name: '小麦',              category: 'mandatory',   display_order: 5,  emoji: 'wheat' },
  { name: 'そば',          display_name: 'そば',              category: 'mandatory',   display_order: 6,  emoji: 'soba' },
  { name: '卵',            display_name: '卵',                category: 'mandatory',   display_order: 7,  emoji: 'egg' },
  { name: '乳',            display_name: '乳',                category: 'mandatory',   display_order: 8,  emoji: 'milk' },
  { name: '落花生',        display_name: '落花生（ピーナッツ）', category: 'mandatory', display_order: 9,  emoji: 'peanut' },
  // 準ずるもの（20品目・表示推奨）
  { name: 'アーモンド',       display_name: 'アーモンド',       category: 'recommended', display_order: 10, emoji: 'almond' },
  { name: 'あわび',           display_name: 'あわび',           category: 'recommended', display_order: 11, emoji: 'abalone' },
  { name: 'いか',             display_name: 'いか',             category: 'recommended', display_order: 12, emoji: 'squid' },
  { name: 'いくら',           display_name: 'いくら',           category: 'recommended', display_order: 13, emoji: 'salmon-roe' },
  { name: 'オレンジ',         display_name: 'オレンジ',         category: 'recommended', display_order: 14, emoji: 'orange' },
  { name: 'キウイフルーツ',   display_name: 'キウイフルーツ',   category: 'recommended', display_order: 15, emoji: 'kiwi' },
  { name: '牛肉',             display_name: '牛肉',             category: 'recommended', display_order: 16, emoji: 'beef' },
  { name: 'ごま',             display_name: 'ごま',             category: 'recommended', display_order: 17, emoji: 'sesame' },
  { name: 'さけ',             display_name: 'さけ',             category: 'recommended', display_order: 18, emoji: 'salmon' },
  { name: 'さば',             display_name: 'さば',             category: 'recommended', display_order: 19, emoji: 'mackerel' },
  { name: '大豆',             display_name: '大豆',             category: 'recommended', display_order: 20, emoji: 'soybean' },
  { name: '鶏肉',             display_name: '鶏肉',             category: 'recommended', display_order: 21, emoji: 'chicken' },
  { name: 'バナナ',           display_name: 'バナナ',           category: 'recommended', display_order: 22, emoji: 'banana' },
  { name: 'ピスタチオ',       display_name: 'ピスタチオ',       category: 'recommended', display_order: 23, emoji: 'pistachio' },
  { name: '豚肉',             display_name: '豚肉',             category: 'recommended', display_order: 24, emoji: 'pork' },
  { name: 'マカダミアナッツ', display_name: 'マカダミアナッツ', category: 'recommended', display_order: 25, emoji: 'macadamia' },
  { name: 'もも',             display_name: 'もも',             category: 'recommended', display_order: 26, emoji: 'peach' },
  { name: 'りんご',           display_name: 'りんご',           category: 'recommended', display_order: 27, emoji: 'apple' },
  { name: 'やまいも',         display_name: 'やまいも',         category: 'recommended', display_order: 28, emoji: 'yam' },
  { name: 'ゼラチン',         display_name: 'ゼラチン',         category: 'recommended', display_order: 29, emoji: 'gelatin' },
  // 依存性への配慮（addiction）
  { name: 'アルコール',       display_name: 'アルコール',       category: 'addiction',   display_order: 30, emoji: 'alcohol' },
  { name: 'カフェイン',       display_name: 'カフェイン',       category: 'addiction',   display_order: 31, emoji: 'caffeine' },
  { name: '糖質',             display_name: '糖質',             category: 'addiction',   display_order: 32, emoji: 'carbs' },
  // 肌への配慮（skin）
  { name: '食品添加物',       display_name: '食品添加物',       category: 'skin',        display_order: 33, emoji: 'additive' },
  { name: 'トランス脂肪酸',   display_name: 'トランス脂肪酸',   category: 'skin',        display_order: 34, emoji: 'trans-fat' },
  { name: '砂糖',             display_name: '砂糖',             category: 'skin',        display_order: 35, emoji: 'sugar' },
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

  // =====================
  // えび（義務 9品目）
  // =====================
  { allergen_name: 'えび', canonicalName: 'えび',              aliases: ['エビ', '海老', 'shrimp', 'prawn'], component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'えび', canonicalName: 'ロブスター',        aliases: ['いせえび', 'lobster'],             component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: 'いせえび類（ロブスター）も対象' },
  { allergen_name: 'えび', canonicalName: 'えびエキス',        aliases: ['エビエキス', 'shrimp extract'],    component_type: 'derivative',   detectionType: 'contains', riskLevel: 'medium', note: null },
  { allergen_name: 'えび', canonicalName: 'えびパウダー',      aliases: ['エビパウダー'],                    component_type: 'derivative',   detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'えび', canonicalName: 'えびを含む',        aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },
  { allergen_name: 'えび', canonicalName: 'しゃこ',            aliases: ['シャコ'],                          component_type: 'exclude',      detectionType: 'contains', riskLevel: 'ignore', note: '甲殻類だがえびの対象外（別分類）' },
  { allergen_name: 'えび', canonicalName: 'おきあみ',          aliases: [],                                  component_type: 'exclude',      detectionType: 'contains', riskLevel: 'ignore', note: '甲殻類だがえびの対象外（別分類）' },

  // =====================
  // かに（義務 9品目）
  // =====================
  { allergen_name: 'かに', canonicalName: 'かに',              aliases: ['カニ', '蟹', 'crab'],              component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'かに', canonicalName: 'たらばがに',        aliases: ['タラバガニ', 'king crab'],          component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: 'いばらがに類として対象' },
  { allergen_name: 'かに', canonicalName: 'ずわいがに',        aliases: ['ズワイガニ', 'snow crab'],          component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: 'くもがに類として対象' },
  { allergen_name: 'かに', canonicalName: 'かにエキス',        aliases: ['カニエキス', 'crab extract'],       component_type: 'derivative',   detectionType: 'contains', riskLevel: 'medium', note: null },
  { allergen_name: 'かに', canonicalName: 'かにみそ',          aliases: ['カニミソ'],                         component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'かに', canonicalName: 'かにを含む',        aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // そば（義務 9品目）
  // =====================
  { allergen_name: 'そば', canonicalName: 'そば',              aliases: ['蕎麦', 'soba', 'buckwheat'],        component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'そば', canonicalName: 'そば粉',            aliases: ['蕎麦粉', 'buckwheat flour'],        component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'そば', canonicalName: 'そばエキス',        aliases: [],                                  component_type: 'derivative',   detectionType: 'contains', riskLevel: 'high',   note: '調味料に含まれる場合あり' },
  { allergen_name: 'そば', canonicalName: 'そばを含む',        aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // 落花生（義務 9品目）
  // =====================
  { allergen_name: '落花生', canonicalName: '落花生',          aliases: ['ピーナッツ', 'peanut', 'なんきんまめ'], component_type: 'direct',    detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: '落花生', canonicalName: 'ピーナッツバター', aliases: ['peanut butter'],                   component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: '落花生', canonicalName: 'ピーナッツオイル', aliases: ['ピーナッツ油', 'peanut oil', '落花生油'], component_type: 'processed', detectionType: 'contains', riskLevel: 'low', note: '高精製品は抗原性低' },
  { allergen_name: '落花生', canonicalName: '落花生を含む',    aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // さけ（推奨 20品目）
  // =====================
  { allergen_name: 'さけ', canonicalName: 'さけ',              aliases: ['鮭', 'サケ'],                       component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'さけ', canonicalName: 'サーモン',          aliases: ['salmon'],                           component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: '代替表記として法令上認定済み' },
  { allergen_name: 'さけ', canonicalName: 'しゃけ',            aliases: ['シャケ'],                           component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: '代替表記として法令上認定済み' },
  { allergen_name: 'さけ', canonicalName: 'スモークサーモン',  aliases: ['燻鮭'],                             component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: '拡大表記として法令上認定済み' },
  { allergen_name: 'さけ', canonicalName: '鮭フレーク',        aliases: ['さけフレーク'],                     component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: '拡大表記として法令上認定済み' },
  { allergen_name: 'さけ', canonicalName: 'さけを含む',        aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // さば（推奨 20品目）
  // =====================
  { allergen_name: 'さば', canonicalName: 'さば',              aliases: ['鯖', 'サバ', 'mackerel'],           component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'さば', canonicalName: 'さば節',            aliases: ['鯖節'],                             component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: '拡大表記として法令上認定済み' },
  { allergen_name: 'さば', canonicalName: 'さばエキス',        aliases: ['鯖エキス'],                         component_type: 'derivative',   detectionType: 'contains', riskLevel: 'medium', note: null },
  { allergen_name: 'さば', canonicalName: 'さばを含む',        aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // いか（推奨 20品目）
  // =====================
  { allergen_name: 'いか', canonicalName: 'いか',              aliases: ['イカ', '烏賊', 'squid'],            component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'いか', canonicalName: 'いかフライ',        aliases: ['イカフライ'],                       component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: '拡大表記として法令上認定済み' },
  { allergen_name: 'いか', canonicalName: 'いかエキス',        aliases: ['イカエキス'],                       component_type: 'derivative',   detectionType: 'contains', riskLevel: 'medium', note: null },
  { allergen_name: 'いか', canonicalName: 'いかを含む',        aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // あわび（推奨 20品目）
  // =====================
  { allergen_name: 'あわび', canonicalName: 'あわび',          aliases: ['アワビ', '鮑', 'abalone'],          component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'あわび', canonicalName: 'あわびを含む',    aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // いくら（推奨 20品目）
  // =====================
  { allergen_name: 'いくら', canonicalName: 'いくら',          aliases: ['イクラ'],                           component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'いくら', canonicalName: 'すじこ',          aliases: ['スジコ', '筋子'],                   component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: '代替表記として法令上認定済み（未加工のいくら）' },
  { allergen_name: 'いくら', canonicalName: 'いくら醤油漬け',  aliases: [],                                  component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: '拡大表記として法令上認定済み' },
  { allergen_name: 'いくら', canonicalName: 'いくらを含む',    aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // ごま（推奨 20品目）
  // =====================
  { allergen_name: 'ごま', canonicalName: 'ごま',              aliases: ['ゴマ', '胡麻', 'sesame'],           component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'ごま', canonicalName: 'すりごま',          aliases: ['すり胡麻', '切り胡麻'],             component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: '拡大表記として法令上認定済み' },
  { allergen_name: 'ごま', canonicalName: '練りごま',          aliases: ['ゴマペースト', 'tahini', 'オリゴマ'], component_type: 'processed',  detectionType: 'contains', riskLevel: 'high',   note: '拡大表記として法令上認定済み' },
  { allergen_name: 'ごま', canonicalName: 'ごま油',            aliases: ['胡麻油', 'sesame oil'],             component_type: 'processed',    detectionType: 'contains', riskLevel: 'medium', note: '高精製品は抗原性低だが表示対象' },
  { allergen_name: 'ごま', canonicalName: 'ごまを含む',        aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // りんご（推奨 20品目）
  // =====================
  { allergen_name: 'りんご', canonicalName: 'りんご',          aliases: ['リンゴ', 'アップル', 'apple'],      component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'りんご', canonicalName: 'りんごジュース',  aliases: ['アップルジュース', 'りんご果汁', 'アップル果汁'], component_type: 'processed', detectionType: 'contains', riskLevel: 'high', note: '拡大表記として法令上認定済み' },
  { allergen_name: 'りんご', canonicalName: 'りんご酢',        aliases: ['アップルビネガー', 'リンゴ酢'],      component_type: 'processed',    detectionType: 'contains', riskLevel: 'medium', note: '拡大表記として法令上認定済み' },
  { allergen_name: 'りんご', canonicalName: 'アップルパイ',    aliases: [],                                  component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: '拡大表記として法令上認定済み' },
  { allergen_name: 'りんご', canonicalName: 'りんごを含む',    aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // オレンジ（推奨 20品目）
  // =====================
  { allergen_name: 'オレンジ', canonicalName: 'オレンジ',      aliases: ['orange'],                           component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'オレンジ', canonicalName: 'オレンジジュース', aliases: ['オレンジ果汁', 'orange juice'],  component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: '拡大表記として法令上認定済み' },
  { allergen_name: 'オレンジ', canonicalName: 'オレンジエキス', aliases: [],                                 component_type: 'derivative',   detectionType: 'contains', riskLevel: 'medium', note: null },
  { allergen_name: 'オレンジ', canonicalName: 'オレンジを含む', aliases: [],                                 component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // キウイフルーツ（推奨 20品目）
  // =====================
  { allergen_name: 'キウイフルーツ', canonicalName: 'キウイフルーツ', aliases: ['キウイ', 'キウィ', 'kiwi', 'kiwifruit', 'キーウィ'], component_type: 'direct', detectionType: 'contains', riskLevel: 'high', note: null },
  { allergen_name: 'キウイフルーツ', canonicalName: 'キウイジャム',   aliases: ['キーウィジャム'],             component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: '拡大表記として法令上認定済み' },
  { allergen_name: 'キウイフルーツ', canonicalName: 'キウイを含む',   aliases: [],                            component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // 牛肉（推奨 20品目）
  // =====================
  { allergen_name: '牛肉', canonicalName: '牛肉',              aliases: ['牛', 'ビーフ', 'beef', 'ぎゅうにく', 'ぎゅう肉'], component_type: 'direct', detectionType: 'contains', riskLevel: 'high', note: null },
  { allergen_name: '牛肉', canonicalName: '牛エキス',          aliases: ['ビーフエキス', 'beef extract', '牛骨エキス'], component_type: 'derivative', detectionType: 'contains', riskLevel: 'medium', note: null },
  { allergen_name: '牛肉', canonicalName: '牛脂',              aliases: [],                                  component_type: 'processed',    detectionType: 'contains', riskLevel: 'low',    note: '高精製品は抗原性低' },
  { allergen_name: '牛肉', canonicalName: '牛肉を含む',        aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // 鶏肉（推奨 20品目）
  // =====================
  { allergen_name: '鶏肉', canonicalName: '鶏肉',              aliases: ['とり肉', 'チキン', 'chicken', 'とりにく', '鳥肉'], component_type: 'direct', detectionType: 'contains', riskLevel: 'high', note: null },
  { allergen_name: '鶏肉', canonicalName: '鶏エキス',          aliases: ['チキンエキス', 'chicken extract', 'チキンスープ', '鶏ガラスープ'], component_type: 'derivative', detectionType: 'contains', riskLevel: 'medium', note: null },
  { allergen_name: '鶏肉', canonicalName: '鶏肉を含む',        aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // 豚肉（推奨 20品目）
  // =====================
  { allergen_name: '豚肉', canonicalName: '豚肉',              aliases: ['豚', 'ポーク', 'pork', 'ぶたにく', 'ぶた肉'], component_type: 'direct', detectionType: 'contains', riskLevel: 'high', note: null },
  { allergen_name: '豚肉', canonicalName: '豚エキス',          aliases: ['ポークエキス', 'pork extract'],      component_type: 'derivative',   detectionType: 'contains', riskLevel: 'medium', note: null },
  { allergen_name: '豚肉', canonicalName: 'ゼラチン（豚由来）', aliases: [],                                  component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: '豚由来ゼラチンはゼラチンアレルギーとも重複' },
  { allergen_name: '豚肉', canonicalName: '豚肉を含む',        aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // バナナ（推奨 20品目）
  // =====================
  { allergen_name: 'バナナ', canonicalName: 'バナナ',          aliases: ['ばなな', 'banana'],                 component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'バナナ', canonicalName: 'バナナジュース',  aliases: ['バナナ果汁'],                       component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: '拡大表記として法令上認定済み' },
  { allergen_name: 'バナナ', canonicalName: 'バナナを含む',    aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // もも（推奨 20品目）
  // =====================
  { allergen_name: 'もも', canonicalName: 'もも',              aliases: ['モモ', '桃', 'ピーチ', 'peach'],    component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'もも', canonicalName: 'もも果汁',          aliases: ['白桃', '黄桃', 'peach juice'],      component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: '拡大表記として法令上認定済み' },
  { allergen_name: 'もも', canonicalName: 'ピーチジャム',      aliases: ['もものジャム'],                     component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'もも', canonicalName: 'ももを含む',        aliases: [],                                  component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // やまいも（推奨 20品目）
  // =====================
  { allergen_name: 'やまいも', canonicalName: 'やまいも',      aliases: ['山芋', 'ヤマイモ', '山いも'],       component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'やまいも', canonicalName: '自然薯',        aliases: ['じねんじょ'],                       component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'やまいも', canonicalName: 'とろろ',        aliases: ['千切りやまいも'],                   component_type: 'processed',    detectionType: 'contains', riskLevel: 'high',   note: '拡大表記として法令上認定済み' },
  { allergen_name: 'やまいも', canonicalName: 'やまいもを含む', aliases: [],                                 component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },

  // =====================
  // ゼラチン（推奨 20品目）
  // =====================
  { allergen_name: 'ゼラチン', canonicalName: 'ゼラチン',      aliases: ['gelatin', 'gelatine'],             component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: null },
  { allergen_name: 'ゼラチン', canonicalName: '板ゼラチン',    aliases: [],                                  component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: '拡大表記として法令上認定済み' },
  { allergen_name: 'ゼラチン', canonicalName: '粉ゼラチン',    aliases: [],                                  component_type: 'direct',       detectionType: 'contains', riskLevel: 'high',   note: '拡大表記として法令上認定済み' },
  { allergen_name: 'ゼラチン', canonicalName: 'ゼラチンを含む', aliases: [],                                 component_type: 'contains_label', detectionType: 'partial', riskLevel: 'high',   note: '一括表示' },
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
