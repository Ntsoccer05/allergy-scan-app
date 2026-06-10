/**
 * Open Food Facts のアレルゲンタグ（en:milk 等）→ 日本語アレルゲン名（allergens.name）のマッピング。
 *
 * products.allergens.contains / partial にはアレルゲン名を保存する規約のため、
 * OFF タグは必ずここで日本語名に正規化してから保存する
 * （名前一致で判定する deriveProductJudgment が機能しなくなるため）。
 *
 * ⚠️ 安全設計: 総称タグ（en:crustaceans / en:nuts / en:fish / en:molluscs）は
 * 該当しうる全アレルゲンに展開する（過剰警告は許容・見逃しは不可）。
 */
const OFF_TAG_TO_ALLERGEN_NAMES: Record<string, string[]> = {
  // --- 特定原材料（表示義務） ---
  gluten: ['小麦'],
  wheat: ['小麦'],
  milk: ['乳'],
  eggs: ['卵'],
  egg: ['卵'],
  peanuts: ['落花生'],
  buckwheat: ['そば'],
  shrimp: ['えび'],
  prawns: ['えび'],
  crab: ['かに'],
  crustaceans: ['えび', 'かに'],
  walnuts: ['くるみ'],
  'walnut-nuts': ['くるみ'],
  cashews: ['カシューナッツ'],
  'cashew-nuts': ['カシューナッツ'],
  // --- 準ずるもの（表示推奨） ---
  almonds: ['アーモンド'],
  abalone: ['あわび'],
  squid: ['いか'],
  'salmon-roe': ['いくら'],
  oranges: ['オレンジ'],
  orange: ['オレンジ'],
  kiwi: ['キウイフルーツ'],
  'kiwi-fruit': ['キウイフルーツ'],
  beef: ['牛肉'],
  sesame: ['ごま'],
  'sesame-seeds': ['ごま'],
  salmon: ['さけ'],
  mackerel: ['さば'],
  soybeans: ['大豆'],
  soy: ['大豆'],
  soya: ['大豆'],
  chicken: ['鶏肉'],
  bananas: ['バナナ'],
  banana: ['バナナ'],
  pistachios: ['ピスタチオ'],
  pork: ['豚肉'],
  'macadamia-nuts': ['マカダミアナッツ'],
  macadamia: ['マカダミアナッツ'],
  peaches: ['もも'],
  peach: ['もも'],
  apples: ['りんご'],
  apple: ['りんご'],
  yam: ['やまいも'],
  gelatin: ['ゼラチン'],
  gelatine: ['ゼラチン'],
  // --- 総称タグ（安全側で全展開） ---
  nuts: ['くるみ', 'アーモンド', 'カシューナッツ', 'マカダミアナッツ', 'ピスタチオ'],
  'tree-nuts': ['くるみ', 'アーモンド', 'カシューナッツ', 'マカダミアナッツ', 'ピスタチオ'],
  fish: ['さけ', 'さば'],
  molluscs: ['いか', 'あわび'],
};

/**
 * OFF タグ（'en:milk' / 'ja:そば' 等）を日本語アレルゲン名の配列に正規化する。
 * 未知のタグは言語プレフィックスを除いた値をそのまま返す
 * （情報を捨てない。日本28品目外のタグ（celery 等）はユーザー設定と一致しないため無害）。
 */
export const normalizeOffTag = (tag: string): string[] => {
  const stripped = tag.replace(/^[a-z]{2}:/, '');
  return OFF_TAG_TO_ALLERGEN_NAMES[stripped.toLowerCase()] ?? [stripped];
};

/** タグ配列をまとめて正規化し、重複を除去する。 */
export const normalizeOffTags = (tags: string[]): string[] => [
  ...new Set(tags.flatMap(normalizeOffTag)),
];
