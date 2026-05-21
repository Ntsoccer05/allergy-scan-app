import * as fs from 'fs';
import * as path from 'path';
import type { AllergenComponentRepository } from '../allergens/allergen-component.repository';

const PROMPTS_DIR = path.resolve(__dirname, 'prompts');

// 本番: モジュールロード時に1回だけ読む（Lambda cold start コスト最適化）
// 開発: 毎リクエストで読み直す（プロンプト調整を即反映するため）
const IS_DEV = process.env.NODE_ENV !== 'production';

let _allergenTemplate: string | null = null;
let _noAllergenTemplate: string | null = null;

const readTemplate = (filename: string): string =>
  fs.readFileSync(path.join(PROMPTS_DIR, filename), 'utf-8');

const getAllergenTemplate = (): string => {
  if (!IS_DEV && _allergenTemplate !== null) return _allergenTemplate;
  _allergenTemplate = readTemplate('allergen-detection.md');
  return _allergenTemplate;
};

const getNoAllergenTemplate = (): string => {
  if (!IS_DEV && _noAllergenTemplate !== null) return _noAllergenTemplate;
  _noAllergenTemplate = readTemplate('no-allergen.md');
  return _noAllergenTemplate;
};

/** プレースホルダー名の定数。テンプレートファイルとの不一致を防ぐ。 */
const PLACEHOLDER_ALLERGEN_LABEL = '{{ALLERGEN_LABEL}}';
const PLACEHOLDER_DETECTION_LIST = '{{DETECTION_LIST}}';
const PLACEHOLDER_EXCLUDE_LIST = '{{EXCLUDE_LIST}}';

// アレルゲン成分リストは master data で更新頻度が低い。キャッシュキーはアレルゲン名ソート済みリスト。
const _promptCache = new Map<string, string>();

/**
 * Gemini プロンプトを動的生成する（dry_principles.md の集約点）。
 * exclude 型を検出対象から除外し、誤検出防止リストとして別途プロンプトに含める（anti_patterns.md #3）。
 */
export const buildGeminiPrompt = async (
  enabledAllergens: string[],
  db: AllergenComponentRepository,
): Promise<string> => {
  if (enabledAllergens.length === 0) {
    return getNoAllergenTemplate();
  }

  const cacheKey = [...enabledAllergens].sort().join(',');
  const cached = _promptCache.get(cacheKey);
  if (cached !== undefined) return cached;

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

  const result = getAllergenTemplate().replace(
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
  _promptCache.set(cacheKey, result);
  return result;
};

/** 正規表現のメタ文字をエスケープする。プレースホルダー置換で使用。 */
const escapeRegExp = (str: string): string =>
  str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
