/**
 * プロンプト一貫性検証スクリプト（開発用・本番コードから参照されない）
 *
 * docs/assets の食品ラベル画像を、指定ユーザーの実アレルギー設定で生成した
 * 本番同等プロンプトで各 N 回 Gemini にかけ、判定結果の一貫性を測定する。
 *
 * 実行:
 *   pnpm --filter backend exec ts-node --project tsconfig.json scripts/prompt-consistency-test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { buildGeminiPrompt } from '../src/scan/gemini-prompt.builder';
import type { AllergenComponentRepository } from '../src/allergens/allergen-component.repository';
import { GeminiClient } from '../src/shared/clients/gemini.client';
import type { GeminiOcrResponse } from '../src/shared/types/gemini.types';

const TARGET_USER_ID = '22b3bce2-fc7a-4c8a-ac55-b9a1adf1e4ea';
const RUNS_PER_IMAGE = 5;
// IMAGES_DIR 環境変数で画像ディレクトリを差し替え可能（リサイズ版の比較検証用）
const ASSETS_DIR =
  process.env.IMAGES_DIR ?? path.resolve(__dirname, '../../docs/assets');
const REPORT_PATH = path.resolve(
  __dirname,
  process.env.REPORT_NAME ?? 'prompt-consistency-report.json',
);
// Gemini 無料枠は 15 リクエスト/分。429 を避けるため呼び出し間隔を空ける（直列実行）
const THROTTLE_MS = 5_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** backend/.env を読んで未設定の環境変数のみ反映する（dotenv 非依存） */
const loadEnv = (): void => {
  const envPath = path.resolve(__dirname, '../.env');
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  }
};

type AllergySettings = Record<string, { enabled: boolean; partialAlert: boolean }>;

/** 1回の実行結果を比較可能な形に正規化する */
const normalize = (r: GeminiOcrResponse) => ({
  confidence: r.confidence,
  incomplete: r.incomplete,
  results: r.results
    .map((x) => ({
      allergen: x.allergen,
      judgment: x.judgment,
      detection_type: x.detection_type,
      detected: [...x.detected].sort(),
    }))
    .sort((a, b) => a.allergen.localeCompare(b.allergen, 'ja')),
  highlights: r.highlights.map((h) => `${h.judgment}:${h.text}`).sort(),
  rawTextHasFacilityNote: r.raw_text.includes('共通の設備') || r.raw_text.includes('製造ライン'),
  rawTextLength: r.raw_text.length,
});

/** 判定の核心部分のみのシグネチャ（アレルゲン→judgment/detection_type） */
const judgmentSignature = (n: ReturnType<typeof normalize>): string =>
  JSON.stringify(
    n.results
      .filter((x) => x.judgment !== 'なし')
      .map((x) => `${x.allergen}=${x.judgment}/${x.detection_type}`),
  );

const main = async (): Promise<void> => {
  loadEnv();
  const prisma = new PrismaClient();

  const user = await prisma.user.findUnique({
    where: { id: TARGET_USER_ID },
    select: { allergies: true },
  });
  if (!user) throw new Error(`user not found: ${TARGET_USER_ID}`);
  const allergies = user.allergies as AllergySettings;
  const enabledAllergens = Object.entries(allergies)
    .filter(([, v]) => v.enabled)
    .map(([name]) => name);
  console.log(`enabledAllergens: ${enabledAllergens.join('、')}`);

  // AllergenComponentRepository と同じクエリを PrismaClient で再現したダックタイプ
  const repo = {
    findByAllergens: async (names: string[]) => {
      const records = await prisma.allergenComponent.findMany({
        where: { allergenName: { in: names } },
        select: {
          id: true,
          allergenName: true,
          canonicalName: true,
          aliases: true,
          componentType: true,
          detectionType: true,
          riskLevel: true,
          note: true,
        },
      });
      return records.map((r) => ({
        ...r,
        aliases: Array.isArray(r.aliases)
          ? (r.aliases as unknown[]).filter((v): v is string => typeof v === 'string')
          : [],
      }));
    },
  } as unknown as AllergenComponentRepository;

  const prompt = await buildGeminiPrompt(enabledAllergens, repo);
  console.log(`prompt length: ${prompt.length} chars`);

  const gemini = new GeminiClient();
  // 引数で画像名を指定した場合はその画像のみ対象にする（再実行用）
  const onlyImages = process.argv.slice(2);
  const images = fs
    .readdirSync(ASSETS_DIR)
    .filter((f) => f.endsWith('.jpg'))
    .filter((f) => onlyImages.length === 0 || onlyImages.includes(f))
    .sort();

  const report: Record<string, unknown> = {};
  let allConsistent = true;

  for (const image of images) {
    const base64 = fs.readFileSync(path.join(ASSETS_DIR, image)).toString('base64');
    console.log(`\n=== ${image} (${RUNS_PER_IMAGE} runs) ===`);

    // 無料枠の RPM 制限を超えないよう直列 + スロットリングで実行する
    const runs: GeminiOcrResponse[] = [];
    for (let i = 0; i < RUNS_PER_IMAGE; i++) {
      runs.push(await gemini.analyzeImage(base64, prompt));
      await sleep(THROTTLE_MS);
    }
    const normalized = runs.map(normalize);

    const signatures = normalized.map(judgmentSignature);
    const distinct = [...new Set(signatures)];
    const consistent = distinct.length === 1;
    if (!consistent) allConsistent = false;

    normalized.forEach((n, i) => {
      console.log(
        `  run${i + 1}: conf=${n.confidence} incomplete=${n.incomplete} ` +
          `facilityNote=${n.rawTextHasFacilityNote} ${signatures[i]}`,
      );
    });
    console.log(`  -> 判定一貫性: ${consistent ? 'OK（5回一致）' : `NG（${distinct.length} 通りに分裂）`}`);

    report[image] = { consistent, signatures, runs: normalized };
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nレポート出力: ${REPORT_PATH}`);
  console.log(`総合: ${allConsistent ? '全画像で判定一貫' : '一貫しない画像あり'}`);

  await prisma.$disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
