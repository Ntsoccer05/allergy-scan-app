import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { randomUUID } from 'crypto';
import type { ProductAllergens } from '../shared/types/db.types';
import type { OpenFoodFactsProductFields } from '../shared/types/open-food-facts.types';
import type { GeminiOcrResponse } from '../shared/types/gemini.types';
import { ProductRepository } from '../products/product.repository';
import { AllergenComponentRepository } from '../allergens/allergen-component.repository';
import { ScanHistoryRepository } from '../history/scan-history.repository';
import { OpenFoodFactsClient } from '../shared/open-food-facts.client';
import { S3Client } from '../shared/s3.client';
import { GeminiClient } from '../shared/gemini.client';
import { UsersRepository } from '../users/users.repository';
import {
  PLACES_PROVIDER_TOKEN,
  type StoreCandidate,
  type StoreCandidateProvider,
} from '../shared/places.interface';
import { buildGeminiPrompt } from './gemini-prompt.builder';
import { buildLabelHash } from '../products/label-hash.util';
import {
  CACHE_TTL_MEMORY_SEC,
  RAW_TEXT_PREFIX_LENGTH,
  S3_KEY_PREFIX,
} from './scan.constants';

/** POST /scan/barcode のレスポンス型（openapi.yaml BarcodeScanResponse 準拠）。 */
export type BarcodeScanResult = {
  found: boolean;
  product_name?: string | null;
  allergens?: ProductAllergens | null;
  judgment?: string | null;
  detected?: string[] | null;
  risk_level?: 'high' | 'medium' | 'low' | 'ignore' | null;
  from_cache: boolean;
};

/** GET /scan/presigned-url のレスポンス型（openapi.yaml PresignedUrlResponse 準拠）。 */
export type PresignedUrlResult = {
  url: string;
  s3_key: string;
};

/** POST /scan/ocr のレスポンス型。GeminiOcrResponse に storeCandidates を追加。 */
export type OcrScanResult = GeminiOcrResponse & {
  storeCandidates?: StoreCandidate[];
};

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly productRepository: ProductRepository,
    private readonly offClient: OpenFoodFactsClient,
    private readonly allergenComponentRepository: AllergenComponentRepository,
    private readonly scanHistoryRepository: ScanHistoryRepository,
    private readonly s3Client: S3Client,
    private readonly geminiClient: GeminiClient,
    private readonly usersRepository: UsersRepository,
    @Inject(PLACES_PROVIDER_TOKEN) private readonly placesClient: StoreCandidateProvider,
  ) {}

  /**
   * バーコードスキャンフロー（patterns.md パターン1）:
   * 1. NestJS メモリキャッシュ確認（TTL: CACHE_TTL_MEMORY_SEC）
   * 2. DB の expires_at 確認
   * 3. Open Food Facts API 照合
   * 4. 全ミス → { found: false }
   */
  async scanBarcode(janCode: string): Promise<BarcodeScanResult> {
    const cacheKey = `jan:${janCode}`;

    // Step 1: メモリキャッシュ確認
    const cached = await this.cacheManager.get<BarcodeScanResult>(cacheKey);
    if (cached !== undefined && cached !== null) {
      this.logger.log(`Cache hit for JAN: ${janCode}`);
      return { ...cached, from_cache: true };
    }

    // Step 2: DB の expires_at 確認
    const dbProduct = await this.productRepository.findByJan(janCode);
    if (dbProduct) {
      this.logger.log(`DB hit for JAN: ${janCode}`);
      const result = this.buildResultFromDb(
        dbProduct.productName,
        dbProduct.allergens,
        false,
      );
      await this.cacheManager.set(
        cacheKey,
        result,
        CACHE_TTL_MEMORY_SEC * 1000,
      );
      return result;
    }

    // Step 3: Open Food Facts API 照合
    const offProduct = await this.offClient.fetchByJanCode(janCode);
    if (offProduct) {
      this.logger.log(`Open Food Facts hit for JAN: ${janCode}`);
      const allergens = this.buildAllergensFromOff(offProduct);
      await this.productRepository.upsertByJan(janCode, {
        productName: this.extractProductName(offProduct),
        allergens,
        rawText: offProduct.ingredients_text_ja ?? offProduct.ingredients_text,
      });
      const result = this.buildResultFromDb(
        this.extractProductName(offProduct),
        allergens,
        false,
      );
      await this.cacheManager.set(
        cacheKey,
        result,
        CACHE_TTL_MEMORY_SEC * 1000,
      );
      return result;
    }

    // Step 4: 全ミス
    this.logger.log(`No result found for JAN: ${janCode}`);
    return { found: false, from_cache: false };
  }

  /**
   * S3 Presigned PUT URL を発行する（R1）。
   * s3_key はリクエストごとに UUID ベースで一意に生成する。
   */
  async getPresignedUrl(): Promise<PresignedUrlResult> {
    const s3Key = `${S3_KEY_PREFIX}${randomUUID()}.jpg`;
    const url = await this.s3Client.generatePresignedPutUrl(s3Key);
    this.logger.log(`Presigned URL issued for key: ${s3Key}`);
    return { url, s3_key: s3Key };
  }

  /**
   * OCR スキャンフロー（patterns.md パターン2）:
   * 1. S3 から画像取得
   * 2. ユーザーの有効アレルギー取得
   * 3. allergen_components から成分リスト取得（exclude 型を除外）してプロンプト動的生成
   * 4. Gemini Flash API に送信
   * 5. incomplete: true → 400
   * 6. confidence: low → 422
   * 7. products テーブルに UPSERT（scan_count +1、expires_at 再計算）
   * 8. GPS + Places API で店舗候補取得（lat/lng が両方揃っている場合のみ）
   * 9. 候補数に応じて location を分岐し scan_histories に記録
   * 10. 候補 2 件以上のとき storeCandidates をレスポンスに含める
   */
  async processOcr(
    s3Key: string,
    userId: string | undefined,
    lat?: number,
    lng?: number,
  ): Promise<OcrScanResult> {
    // Step 1: S3 から画像取得
    const imageBase64 = await this.s3Client.getImageAsBase64(s3Key);
    if (!imageBase64) {
      throw new BadRequestException({
        message: '画像の取得に失敗しました。再度お試しください。',
        code: 'S3_FETCH_FAILED',
      });
    }

    // Step 2: ユーザーの有効アレルギー取得（未送信または未登録は空配列）
    const enabledAllergens = await this.fetchEnabledAllergens(userId);

    // Step 3: プロンプト動的生成（exclude 型除外は buildGeminiPrompt 内で行う）
    const prompt = await buildGeminiPrompt(
      enabledAllergens,
      this.allergenComponentRepository,
    );

    // Step 4: Gemini Flash API に送信
    this.logger.log(`OCR 処理開始: s3Key=${s3Key}`);
    const geminiResult = await this.geminiClient.analyzeImage(
      imageBase64,
      prompt,
    );

    // Step 5: incomplete: true → 400（anti_patterns.md #2）
    if (geminiResult.incomplete) {
      throw new BadRequestException({
        message: 'ラベル全体が映るように離してください',
        code: 'INCOMPLETE_IMAGE',
      });
    }

    // Step 6: confidence: low → 422（再スキャン誘導）
    if (geminiResult.confidence === 'low') {
      throw new UnprocessableEntityException({
        message: 'もう少し近づけて再スキャンしてください',
        code: 'LOW_CONFIDENCE',
      });
    }

    // Step 7: products テーブルに UPSERT
    const labelHash = buildLabelHash(
      geminiResult.raw_text.slice(0, RAW_TEXT_PREFIX_LENGTH),
      '',
      geminiResult.raw_text,
    );
    const allergens = this.buildAllergensFromGemini(geminiResult);
    const product = await this.productRepository.upsertByHash(labelHash, {
      productName: null,
      allergens,
      rawText: geminiResult.raw_text,
      confidence: geminiResult.confidence,
    });

    // Step 8: GPS + Places API で店舗候補取得（lat/lng 両方揃っている場合のみ）
    let storeCandidates: StoreCandidate[] = [];
    if (lat !== undefined && lng !== undefined) {
      storeCandidates = await this.placesClient.getStoreCandidates(lat, lng);
    }

    // Step 9: 候補数に応じて location を分岐し scan_histories に記録
    const overallJudgment = this.deriveOverallJudgment(geminiResult.results);
    const judgment = this.toJudgmentShort(overallJudgment);
    const allDetected = geminiResult.results.flatMap((r) => r.detected);

    let location: { store_name: string; lat: number; lng: number } | null = null;
    if (storeCandidates.length === 1 && lat !== undefined && lng !== undefined) {
      // 候補 1 件: 確定として location に保存
      location = { store_name: storeCandidates[0].name, lat, lng };
    }
    // 候補 0 件 または 2 件以上: location: null で保存（2件以上はユーザー選択後に PATCH）

    await this.scanHistoryRepository.create({
      userId: userId ?? randomUUID(),
      productId: product.id,
      productName: null,
      judgment,
      detected: allDetected,
      location,
      thumbnailUrl: null,
    });

    this.logger.log(
      `OCR 処理完了: s3Key=${s3Key}, resultCount=${geminiResult.results.length}`,
    );

    // Step 10: 候補 2 件以上のときのみ storeCandidates をレスポンスに含める
    if (storeCandidates.length >= 2) {
      return { ...geminiResult, storeCandidates };
    }
    return geminiResult;
  }

  /**
   * ユーザーの有効アレルギー名リストを取得する。
   * userId 未指定または未登録の場合は空配列を返す（Gemini へは「設定なし」として送信）。
   */
  private async fetchEnabledAllergens(
    userId: string | undefined,
  ): Promise<string[]> {
    if (!userId) return [];
    try {
      const user = await this.usersRepository.findById(userId);
      if (!user) return [];
      return Object.entries(user.allergies)
        .filter(([, v]) => v.enabled)
        .map(([name]) => name);
    } catch (error) {
      this.logger.error(
        'ユーザーアレルギー取得失敗',
        error instanceof Error ? error.message : String(error),
      );
      return [];
    }
  }

  /** Gemini レスポンスから ProductAllergens を生成する。 */
  private buildAllergensFromGemini(
    result: GeminiOcrResponse,
  ): ProductAllergens {
    const contains = result.results
      .filter((r) => r.judgment === '含む')
      .flatMap((r) => r.detected);
    const partial = result.results
      .filter((r) => r.judgment === '一部含む')
      .flatMap((r) => r.detected);
    const components = result.results.flatMap((r) => r.detected);
    return { contains, partial, components };
  }

  /**
   * results[] 配列から overall judgment を導出する。
   * 優先順位: 含む > 一部含む > 判定不能 > なし
   * results[] が空の場合は「アレルギー設定なし」と解釈して「なし」を返す（no-allergen プロンプト設計準拠）
   * ⚠️ 安全設計: 個々の results 要素が「判定不能」の場合は安全側に倒す（anti_patterns.md #1）
   */
  private deriveOverallJudgment(
    results: GeminiOcrResponse['results'],
  ): '含む' | '一部含む' | 'なし' | '判定不能' {
    if (results.length === 0) return 'なし';
    if (results.some((r) => r.judgment === '含む')) return '含む';
    if (results.some((r) => r.judgment === '一部含む')) return '一部含む';
    if (results.some((r) => r.judgment === '判定不能')) return '判定不能';
    return 'なし';
  }

  /** Gemini の judgment を JudgmentShort に変換する。 */
  private toJudgmentShort(judgment: string): 'ng' | 'partial' | 'ok' {
    if (judgment === '含む') return 'ng';
    if (judgment === '一部含む') return 'partial';
    return 'ok';
  }

  private buildResultFromDb(
    productName: string | null,
    allergens: ProductAllergens,
    fromCache: boolean,
  ): BarcodeScanResult {
    const detected = [...allergens.components];
    let judgment: string | null = null;

    if (allergens.contains.length > 0) {
      judgment = '含む';
    } else if (allergens.partial.length > 0) {
      judgment = '一部含む';
    } else {
      judgment = 'なし';
    }

    // detected の有無から risk_level を決定する（DB の products.allergens には individual risk_level が含まれないため）
    const riskLevel: 'high' | 'medium' | 'low' | 'ignore' | null =
      allergens.contains.length > 0
        ? 'high'
        : detected.length > 0
          ? 'medium'
          : null;

    return {
      found: true,
      product_name: productName,
      allergens,
      judgment,
      detected,
      risk_level: riskLevel,
      from_cache: fromCache,
    };
  }

  /** Open Food Facts のアレルギータグから ProductAllergens を生成する。 */
  private buildAllergensFromOff(
    product: OpenFoodFactsProductFields,
  ): ProductAllergens {
    const contains = (product.allergens_tags ?? []).map((tag) =>
      tag.replace(/^[a-z]{2}:/, ''),
    );
    const partial = (product.traces_tags ?? []).map((tag) =>
      tag.replace(/^[a-z]{2}:/, ''),
    );
    return { contains, partial, components: [] };
  }

  private extractProductName(
    product: OpenFoodFactsProductFields,
  ): string | null {
    return product.product_name_ja ?? product.product_name ?? null;
  }
}
