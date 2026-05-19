import * as fs from 'fs';
import * as path from 'path';
import type { AllergenComponentRepository } from '../allergens/allergen-component.repository';

/**
 * プロンプトテンプレートをモジュールロード時に1回だけ読み込む。
 * Lambda 再起動時もコンテナ起動時に読み込まれるため、リクエストごとの fs アクセスは発生しない。
 * ファイル不在の場合は起動時に throw してデプロイ不備を即時検出できる設計。
 */
const PROMPTS_DIR = path.resolve(__dirname, 'prompts');
const ALLERGEN_DETECTION_TEMPLATE = fs.readFileSync(
  path.join(PROMPTS_DIR, 'allergen-detection.txt'),
  'utf-8',
);
const NO_ALLERGEN_TEMPLATE = fs.readFileSync(
  path.join(PROMPTS_DIR, 'no-allergen.txt'),
  'utf-8',
);

/** プレースホルダー名の定数。テンプレートファイルとの不一致を防ぐ。 */
const PLACEHOLDER_ALLERGEN_LABEL = '{{ALLERGEN_LABEL}}';
const PLACEHOLDER_DETECTION_LIST = '{{DETECTION_LIST}}';
const PLACEHOLDER_EXCLUDE_LIST = '{{EXCLUDE_LIST}}';

/**
 * Gemini プロンプトを動的生成する（dry_principles.md の集約点）。
 * exclude 型を検出対象から除外し、誤検出防止リストとして別途プロンプトに含める（anti_patterns.md #3）。
 */
export const buildGeminiPrompt = async (
  enabledAllergens: string[],
  db: AllergenComponentRepository,
): Promise<string> => {
  if (enabledAllergens.length === 0) {
    return NO_ALLERGEN_TEMPLATE;
  }

  const components = await db.findByAllergens(enabledAllergens);

  // exclude 型を除外してから検出対象リストを生成する
  const detectionList = components
    .filter((c) => c.componentType !== 'exclude')
    .map(
      (c) =>
        `・${c.canonicalName}${c.riskLevel === 'high' ? '（⚠️risk_level:high）' : ''}`,
    )
    .join('\n');

  // exclude 型は誤検出防止リストとして別途渡す
  const excludeList = components
    .filter((c) => c.componentType === 'exclude')
    .map((c) => `・${c.canonicalName}${c.note ? `（${c.note}）` : ''}`)
    .join('\n');

  const allergenLabel = enabledAllergens.join('、');

  return ALLERGEN_DETECTION_TEMPLATE.replace(
    new RegExp(escapeRegExp(PLACEHOLDER_ALLERGEN_LABEL), 'g'),
    allergenLabel,
  )
    .replace(
      new RegExp(escapeRegExp(PLACEHOLDER_DETECTION_LIST), 'g'),
      detectionList || '（なし）',
    )
    .replace(
      new RegExp(escapeRegExp(PLACEHOLDER_EXCLUDE_LIST), 'g'),
      excludeList || '（なし）',
    );
};

/** 正規表現のメタ文字をエスケープする。プレースホルダー置換で使用。 */
const escapeRegExp = (str: string): string =>
  str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
