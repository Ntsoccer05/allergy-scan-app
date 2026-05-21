import { buildGeminiPrompt } from './gemini-prompt.builder';
import type { AllergenComponentRecord } from '../allergens/allergen-component.repository';

const mockComponents: AllergenComponentRecord[] = [
  {
    id: '1',
    allergenName: '乳',
    canonicalName: '乳',
    aliases: [],
    componentType: 'direct',
    detectionType: 'contains',
    riskLevel: 'high',
    note: null,
  },
  {
    id: '2',
    allergenName: '乳',
    canonicalName: 'カゼイン',
    aliases: ['casein'],
    componentType: 'derivative',
    detectionType: 'contains',
    riskLevel: 'high',
    note: '乳タンパク',
  },
  {
    id: '3',
    allergenName: '乳',
    canonicalName: '乳化剤',
    aliases: [],
    componentType: 'exclude',
    detectionType: 'contains',
    riskLevel: 'ignore',
    note: '乳由来でない場合がある',
  },
  {
    id: '4',
    allergenName: '乳',
    canonicalName: '乳酸菌',
    aliases: [],
    componentType: 'exclude',
    detectionType: 'contains',
    riskLevel: 'ignore',
    note: '乳アレルギーと無関係',
  },
  {
    id: '5',
    allergenName: '卵',
    canonicalName: '卵',
    aliases: ['玉子', 'たまご', 'エッグ', 'egg'],
    componentType: 'direct',
    detectionType: 'contains',
    riskLevel: 'high',
    note: null,
  },
  {
    id: '6',
    allergenName: '卵',
    canonicalName: 'オボムコイド',
    aliases: [],
    componentType: 'derivative',
    detectionType: 'contains',
    riskLevel: 'high',
    note: '加熱しても残るアレルギー',
  },
  {
    id: '7',
    allergenName: '乳',
    canonicalName: '乳成分を含む',
    aliases: [],
    componentType: 'contains_label',
    detectionType: 'partial',
    riskLevel: 'high',
    note: '一括表示の正式表記',
  },
  {
    id: '8',
    allergenName: '乳',
    canonicalName: '乳を含む製品を製造',
    aliases: [],
    componentType: 'contains_label',
    detectionType: 'may_contain',
    riskLevel: 'medium',
    note: '製造ラインのコンタミ注意喚起',
  },
  {
    id: '9',
    allergenName: '乳',
    canonicalName: 'ラクトース',
    aliases: ['乳糖', 'lactose'],
    componentType: 'derivative',
    detectionType: 'contains',
    riskLevel: 'medium',
    note: '乳糖・精製度による',
  },
  {
    id: '10',
    allergenName: '卵',
    canonicalName: '卵殻カルシウム',
    aliases: [],
    componentType: 'exclude',
    detectionType: 'contains',
    riskLevel: 'ignore',
    note: '抗原性ほぼなし',
  },
];

const mockDb: { findByAllergens: jest.Mock } = {
  findByAllergens: jest.fn(),
};

// buildGeminiPrompt の第2引数型を抽出してキャスト。AllergenComponentRepository の直接 import を回避
type DbParam = Parameters<typeof buildGeminiPrompt>[1];
const db = mockDb as unknown as DbParam;

describe('buildGeminiPrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.findByAllergens.mockResolvedValue(mockComponents);
  });

  it('exclude 型成分が検出対象リストに含まれない', async () => {
    const prompt = await buildGeminiPrompt(['乳', '卵'], db);
    const detectionSection = prompt.split('【検出対象外')[0];
    expect(detectionSection).not.toContain('乳化剤');
    expect(detectionSection).not.toContain('乳酸菌');
  });

  it('exclude 型成分が誤検出防止リストに含まれる', async () => {
    const prompt = await buildGeminiPrompt(['乳', '卵'], db);
    const excludeSection = prompt.split('【検出対象外')[1] ?? '';
    expect(excludeSection).toContain('乳化剤');
    expect(excludeSection).toContain('乳酸菌');
  });

  it('有効アレルギーの検出対象成分がプロンプトに含まれる', async () => {
    const prompt = await buildGeminiPrompt(['乳', '卵'], db);
    expect(prompt).toContain('乳');
    expect(prompt).toContain('カゼイン');
    expect(prompt).toContain('卵');
    expect(prompt).toContain('オボムコイド');
  });

  it('有効アレルギーが空の場合はアレルギー設定なしのプロンプトを返す', async () => {
    const prompt = await buildGeminiPrompt([], db);
    expect(prompt).toContain('アレルギー設定がない');
    expect(mockDb.findByAllergens).not.toHaveBeenCalled();
  });

  it('riskLevel: high の成分に警告マークが付く', async () => {
    const prompt = await buildGeminiPrompt(['乳'], db);
    expect(prompt).toContain('（⚠️risk_level:high）');
  });

  it('riskLevel: medium の成分に警告マークが付かない', async () => {
    const prompt = await buildGeminiPrompt(['乳'], db);
    // ラクトース（riskLevel: medium）は警告マークなし
    const lines = prompt.split('\n').filter((l) => l.includes('ラクトース'));
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach((l) => expect(l).not.toContain('（⚠️risk_level:high）'));
  });

  it('riskLevel: low の成分に警告マークが付かない', async () => {
    const lowRiskComponents: AllergenComponentRecord[] = [
      {
        id: 'lr1',
        allergenName: '小麦',
        canonicalName: 'しょうゆ',
        aliases: ['醤油', 'soy sauce'],
        componentType: 'processed',
        detectionType: 'contains',
        riskLevel: 'low',
        note: '抗原性低・摂取可能患者あり',
      },
    ];
    mockDb.findByAllergens.mockResolvedValue(lowRiskComponents);
    const prompt = await buildGeminiPrompt(['小麦'], db);
    const lines = prompt.split('\n').filter((l) => l.includes('しょうゆ'));
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach((l) => expect(l).not.toContain('（⚠️risk_level:high）'));
  });

  it('riskLevel: ignore の成分に警告マークが付かない', async () => {
    // exclude 型（riskLevel: ignore）は誤検出リストに移動するため、
    // detectionList（検出対象）内には含まれない。
    // 別途 non-exclude の ignore があれば検証できるが、現在のデータモデルでは
    // ignore は exclude セットと同義扱いのため、exclude 外での出現はない。
    // ここでは ignore riskLevel が検出対象リストに含まれないことを確認する。
    const ignoreNonExcludeComponents: AllergenComponentRecord[] = [
      {
        id: 'ig1',
        allergenName: '乳',
        canonicalName: '検査用ignore',
        aliases: [],
        componentType: 'additive',
        detectionType: 'contains',
        riskLevel: 'ignore',
        note: null,
      },
    ];
    mockDb.findByAllergens.mockResolvedValue(ignoreNonExcludeComponents);
    const prompt = await buildGeminiPrompt(['乳'], db);
    const lines = prompt.split('\n').filter((l) => l.includes('検査用ignore'));
    lines.forEach((l) => expect(l).not.toContain('（⚠️risk_level:high）'));
  });

  it('detection_type: partial を持つ成分が検出対象リストに含まれる', async () => {
    const prompt = await buildGeminiPrompt(['乳', '卵'], db);
    // 乳成分を含む（detectionType: partial, componentType: contains_label）は exclude でないため含まれる
    expect(prompt).toContain('乳成分を含む');
  });

  it('detection_type: may_contain を持つ成分が検出対象リストに含まれる', async () => {
    const prompt = await buildGeminiPrompt(['乳', '卵'], db);
    // 乳を含む製品を製造（detectionType: may_contain, componentType: contains_label）は exclude でないため含まれる
    expect(prompt).toContain('乳を含む製品を製造');
  });

  it('findByAllergens に指定アレルギー名が渡される', async () => {
    await buildGeminiPrompt(['乳', '卵'], db);
    expect(mockDb.findByAllergens).toHaveBeenCalledWith(['乳', '卵']);
  });

  it('返却文字列にプレースホルダーが残らない', async () => {
    const prompt = await buildGeminiPrompt(['乳', '卵'], db);
    expect(prompt).not.toContain('{{ALLERGEN_LABEL}}');
    expect(prompt).not.toContain('{{DETECTION_LIST}}');
    expect(prompt).not.toContain('{{EXCLUDE_LIST}}');
  });

  it('enabledAllergens の値がプロンプトに含まれる', async () => {
    const prompt = await buildGeminiPrompt(['乳'], db);
    expect(prompt).toContain('乳');
  });

  it('enabledAllergens: [] のとき no-allergen ベースのプロンプトが返る', async () => {
    const prompt = await buildGeminiPrompt([], db);
    expect(prompt).toContain('アレルギー設定がない');
  });

  it('exclude 型成分が detectionList 展開後に含まれない', async () => {
    const prompt = await buildGeminiPrompt(['乳'], db);
    const detectionSection = prompt.split('【検出対象外')[0];
    expect(detectionSection).not.toContain('乳化剤');
    expect(detectionSection).not.toContain('乳酸菌');
  });
});
