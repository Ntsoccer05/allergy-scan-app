import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { randomUUID } from 'crypto'; // presigned URL の s3_key 生成にのみ使用
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
import { UserDailyScansService } from '../users/user-daily-scans.service';
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
  SCAN_COOLDOWN_MS,
} from './scan.constants';

// Lambda 再起動でリセットされる短期クールダウン用 Map（TTL: 3秒）
const lastScanTimestamps = new Map<string, number>();

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

/** POST /scan/ocr-stream の SSE イベント型。 */
export type OcrStreamEvent =
  | { type: 'started' }
  | { type: 'raw_text'; text: string }
  | { type: 'confidence_low'; raw_text: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'result'; data: OcrScanResult };

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
    private readonly userDailyScansService: UserDailyScansService,
    @Inject(PLACES_PROVIDER_TOKEN) private readonly placesClient: StoreCandidateProvider,
  ) {}

  /**
   * バーコードスキャンフロー（patterns.md パターン1）:
   * 1. NestJS メモリキャッシュ確認（TTL: CACHE_TTL_MEMORY_SEC）
   * 2. DB の expires_at 確認
   * 3. Open Food Facts API 照合
   * 4. 全ミス → { found: false }
   */
  async scanBarcode(janCode: string, userId?: string): Promise<BarcodeScanResult> {
    if (userId) this.checkCooldown(userId);
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
      if (userId) await this.userDailyScansService.incrementScanCount(userId);
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
      if (userId) await this.userDailyScansService.incrementScanCount(userId);
      return result;
    }

    // Step 4: 全ミス（found:false は OCR フォールバックへ。OCR 側でカウントする）
    this.logger.log(`No result found for JAN: ${janCode}`);
    return { found: false, from_cache: false };
  }

  /**
   * S3 Presigned PUT URL を発行する（R1）。
   * s3_key はリクエストごとに UUID ベースで一意に生成する。
   */
  async getPresignedUrl(userId?: string): Promise<PresignedUrlResult> {
    if (userId) this.checkCooldown(userId);
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
    allowLowConfidence?: boolean,
  ): Promise<OcrScanResult> {
    const t0 = Date.now();

    // Step 1〜3 を最大並列化:
    //   - S3ダウンロードとアレルギー取得は完全並列
    //   - アレルギー取得完了後すぐプロンプト構築を開始し、S3完了を待つ
    const allergenPromise = this.fetchEnabledAllergens(userId).then(
      (allergens) => buildGeminiPrompt(allergens, this.allergenComponentRepository),
    );
    const [imageBase64, prompt] = await Promise.all([
      this.s3Client.getImageAsBase64(s3Key),
      allergenPromise,
    ]);
    this.logger.log(`[TIMING] S3+prompt parallel: ${Date.now() - t0}ms`);
    if (!imageBase64) {
      throw new BadRequestException({
        message: '画像の取得に失敗しました。再度お試しください。',
        code: 'S3_FETCH_FAILED',
      });
    }

    // Step 4: Gemini Flash API に送信
    this.logger.log(`OCR 処理開始: s3Key=${s3Key}`);
    const geminiResult = await this.geminiClient.analyzeImage(
      imageBase64,
      prompt,
    );
    this.logger.log(`[TIMING] Gemini API: ${Date.now() - t0}ms`);

    // Step 5: incomplete: true → 400（anti_patterns.md #2）
    if (geminiResult.incomplete) {
      throw new BadRequestException({
        message: 'ラベル全体が映るように離してください',
        code: 'INCOMPLETE_IMAGE',
      });
    }

    // Step 6: confidence: low → PC（allowLowConfidence=true）以外は 422
    if (geminiResult.confidence === 'low' && !allowLowConfidence) {
      throw new UnprocessableEntityException({
        message: 'もう少し近づけて再スキャンしてください',
        code: 'LOW_CONFIDENCE',
        raw_text: geminiResult.raw_text,
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
      productName: geminiResult.product_name ?? null,
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

    // userId が存在する場合のみ履歴を保存する（認証済みリクエストのみ）
    if (userId) {
      await this.scanHistoryRepository.create({
        userId,
        productId: product.id,
        productName: geminiResult.product_name ?? null,
        judgment,
        detected: allDetected,
        location,
        thumbnailUrl: null,
      });
      await this.userDailyScansService.incrementScanCount(userId);
    }

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
   * OCR ストリーミングフロー（POST /scan/ocr-stream 用）。
   * processOcr と同じロジックだが Gemini レスポンスを SSE で逐次 yield する。
   */
  async *processOcrStream(
    s3Key: string,
    userId: string | undefined,
    lat?: number,
    lng?: number,
    allowLowConfidence?: boolean,
  ): AsyncGenerator<OcrStreamEvent> {
    yield { type: 'started' };

    const allergenPromise = this.fetchEnabledAllergens(userId).then(
      (allergens) => buildGeminiPrompt(allergens, this.allergenComponentRepository),
    );
    const [imageBase64, prompt] = await Promise.all([
      this.s3Client.getImageAsBase64(s3Key),
      allergenPromise,
    ]);

    if (!imageBase64) {
      yield { type: 'error', code: 'S3_FETCH_FAILED', message: '画像の取得に失敗しました。再度お試しください。' };
      return;
    }

    this.logger.log(`OCR stream 開始: s3Key=${s3Key}`);
    const geminiStream = this.geminiClient.analyzeImageStream(imageBase64, prompt);

    let geminiResult: GeminiOcrResponse | null = null;
    for await (const chunk of geminiStream) {
      if (chunk.type === 'raw_text') {
        yield { type: 'raw_text', text: chunk.text };
      } else {
        geminiResult = chunk.data;
      }
    }

    if (!geminiResult) {
      yield { type: 'error', code: 'GEMINI_FAILED', message: 'OCR処理に失敗しました' };
      return;
    }

    if (geminiResult.incomplete) {
      yield { type: 'error', code: 'INCOMPLETE_IMAGE', message: 'ラベル全体が映るように離してください' };
      return;
    }

    if (geminiResult.confidence === 'low' && !allowLowConfidence) {
      yield { type: 'confidence_low', raw_text: geminiResult.raw_text };
      return;
    }

    const labelHash = buildLabelHash(
      geminiResult.raw_text.slice(0, RAW_TEXT_PREFIX_LENGTH),
      '',
      geminiResult.raw_text,
    );
    const allergens = this.buildAllergensFromGemini(geminiResult);
    const product = await this.productRepository.upsertByHash(labelHash, {
      productName: geminiResult.product_name ?? null,
      allergens,
      rawText: geminiResult.raw_text,
      confidence: geminiResult.confidence,
    });

    let storeCandidates: StoreCandidate[] = [];
    if (lat !== undefined && lng !== undefined) {
      storeCandidates = await this.placesClient.getStoreCandidates(lat, lng);
    }

    const overallJudgment = this.deriveOverallJudgment(geminiResult.results);
    const judgment = this.toJudgmentShort(overallJudgment);
    const allDetected = geminiResult.results.flatMap((r) => r.detected);

    let location: { store_name: string; lat: number; lng: number } | null = null;
    if (storeCandidates.length === 1 && lat !== undefined && lng !== undefined) {
      location = { store_name: storeCandidates[0].name, lat, lng };
    }

    // userId が存在する場合のみ履歴を保存する（認証済みリクエストのみ）
    if (userId) {
      await this.scanHistoryRepository.create({
        userId,
        productId: product.id,
        productName: geminiResult.product_name ?? null,
        judgment,
        detected: allDetected,
        location,
        thumbnailUrl: null,
      });
      await this.userDailyScansService.incrementScanCount(userId);
    }

    this.logger.log(`OCR stream 完了: s3Key=${s3Key}, resultCount=${geminiResult.results.length}`);

    if (storeCandidates.length >= 2) {
      yield { type: 'result', data: { ...geminiResult, storeCandidates } };
    } else {
      yield { type: 'result', data: geminiResult };
    }
  }

  /**
   * ユーザーの連続スキャンを 3 秒のクールダウンで制限する。
   * Lambda 再起動でリセットされるのは意図的（短期制御のみ）。
   */
  private checkCooldown(userId: string): void {
    const last = lastScanTimestamps.get(userId) ?? 0;
    const elapsed = Date.now() - last;
    if (elapsed < SCAN_COOLDOWN_MS) {
      throw new HttpException(
        { message: 'scan.error.cooldown', remaining_ms: SCAN_COOLDOWN_MS - elapsed },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    lastScanTimestamps.set(userId, Date.now());
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
