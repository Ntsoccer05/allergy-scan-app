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
import type { GeminiOcrResponse } from '../shared/types/gemini.types';
import { ProductRepository } from '../products/product.repository';
import type { ProductRecord } from '../products/product.repository';
import { AllergenComponentRepository } from '../allergens/allergen-component.repository';
import { ScanHistoryRepository } from '../history/scan-history.repository';
import { S3Client } from '../shared/clients/s3.client';
import { GeminiClient } from '../shared/clients/gemini.client';
import { UsersRepository } from '../users/users.repository';
import { UserDailyScansService } from '../users/user-daily-scans.service';
import { StoreCacheRepository } from '../shared/store-cache.repository';
import { buildGeminiPrompt } from './gemini-prompt.builder';
import { buildLabelHash } from '../products/label-hash.util';
import {
  CACHE_TTL_MEMORY_SEC,
  IMAGE_MAGIC_BYTES,
  MAX_IMAGE_SIZE_BYTES,
  RAW_TEXT_PREFIX_LENGTH,
  S3_KEY_PREFIX,
  SCAN_COOLDOWN_MS,
} from './scan.constants';

/**
 * base64 エンコードされた画像のマジックバイトを検証する。
 * JPEG / PNG / WebP 以外は拒否する。
 */
function isValidImageMagicBytes(base64: string): boolean {
  // 先頭 20 バイト（= base64 で約 28 文字）で全フォーマットのシグネチャを網羅できる
  const header = Buffer.from(base64.slice(0, 28), 'base64');
  if (header.length < 4) return false;
  if (header.subarray(0, 3).equals(IMAGE_MAGIC_BYTES.JPEG)) return true;
  if (header.length >= 8 && header.subarray(0, 8).equals(IMAGE_MAGIC_BYTES.PNG)) return true;
  if (
    header.length >= 12 &&
    header.subarray(0, 4).equals(IMAGE_MAGIC_BYTES.WEBP_RIFF) &&
    header.subarray(8, 12).equals(IMAGE_MAGIC_BYTES.WEBP_BODY)
  ) return true;
  return false;
}

// Lambda 再起動でリセットされる短期クールダウン用 Map（TTL: 3秒）
const lastScanTimestamps = new Map<string, number>();

/** POST /scan/barcode のレスポンス型（openapi.yaml BarcodeScanResponse 準拠）。 */
export type BarcodeScanResult = {
  found: boolean;
  product_id?: string | null;
  product_name?: string | null;
  allergens?: ProductAllergens | null;
  judgment?: string | null;
  detected?: string[] | null;
  risk_level?: 'high' | 'medium' | 'low' | 'ignore' | null;
  from_cache: boolean;
  /** 商品の原材料テキスト（OCR 由来 JAN キャッシュ・OFF の ingredients。検証表示用） */
  raw_text?: string | null;
  /** 楽天アフィリエイト URL（楽天 DB 由来の場合のみ） */
  item_url?: string | null;
};

/** GET /scan/presigned-url のレスポンス型（openapi.yaml PresignedUrlResponse 準拠）。 */
export type PresignedUrlResult = {
  url: string;
  s3_key: string;
};

/** POST /scan/ocr のレスポンス型。GeminiOcrResponse に history_id を追加。 */
export type OcrScanResult = GeminiOcrResponse & {
  history_id?: string;
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
    private readonly allergenComponentRepository: AllergenComponentRepository,
    private readonly scanHistoryRepository: ScanHistoryRepository,
    private readonly s3Client: S3Client,
    private readonly geminiClient: GeminiClient,
    private readonly usersRepository: UsersRepository,
    private readonly userDailyScansService: UserDailyScansService,
    private readonly storeCacheRepository: StoreCacheRepository,
  ) {}

  /**
   * バーコードスキャンフロー（patterns.md パターン1）:
   * 1. NestJS メモリキャッシュ確認（TTL: CACHE_TTL_MEMORY_SEC）
   * 2. DB の expires_at 確認（シード済み商品は confidence='high' で即返却）
   * 3. 全ミス → { found: false }（OCR フォールバック）
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
    // ⚠️ 安全設計: アレルゲン情報が空の jan 商品はヒット扱いにしない。
    // OCR 由来・楽天由来の JAN キャッシュは confidence: high のみ配信する —
    // 共有キャッシュであり1人の不確実な読み取りが全ユーザーの判定に影響するため
    const dbProduct = await this.productRepository.findByJan(janCode);
    if (
      dbProduct &&
      !this.hasNoAllergenInfo(dbProduct.allergens) &&
      (dbProduct.confidence === null || dbProduct.confidence === 'high')
    ) {
      this.logger.log(`DB hit for JAN: ${janCode}`);
      const result = this.buildResultFromDb(
        dbProduct.id,
        dbProduct.productName,
        dbProduct.allergens,
        false,
        dbProduct.rawText,
        dbProduct.itemUrl,
      );
      await this.cacheManager.set(
        cacheKey,
        result,
        CACHE_TTL_MEMORY_SEC * 1000,
      );
      if (userId) await this.userDailyScansService.incrementScanCount(userId);
      return result;
    }

    // Step 3: 全ミス（found:false は OCR フォールバックへ。OCR 側でカウントする）
    this.logger.log(`No result found for JAN: ${janCode}`);
    return { found: false, from_cache: false };
  }

  /**
   * S3 Presigned PUT URL を発行する（R1）。
   * s3_key はリクエストごとに UUID ベースで一意に生成する。
   */
  async getPresignedUrl(_userId?: string): Promise<PresignedUrlResult> {
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
   * 8. location: null で scan_histories に記録
   *    （00320: Places API はコール課金のためスキャン時に呼ばない。
   *      場所はユーザーの「場所を登録」操作時に GET /places/candidates で取得して PATCH する）
   */
  async processOcr(
    s3Key: string,
    userId: string | undefined,
    lat?: number,
    lng?: number,
    allowLowConfidence?: boolean,
    janCode?: string,
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

    // base64 → 実バイト数を計算してサイズ上限チェック（MAX_IMAGE_SIZE_BYTES: 5MB）
    const byteCount = Math.floor((imageBase64.length * 3) / 4);
    if (byteCount > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException({
        message: '画像サイズが大きすぎます。再スキャンしてください。',
        code: 'IMAGE_TOO_LARGE',
      });
    }

    // マジックバイト検証（JPEG / PNG / WebP 以外は拒否）
    if (!isValidImageMagicBytes(imageBase64)) {
      throw new BadRequestException({
        message: '無効なファイル形式です。',
        code: 'INVALID_IMAGE_FORMAT',
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
        message: '原材料またはバーコード全体が映るように撮影してください。',
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
    // JAN が検出済みの場合は jan キーで保存し、次回以降バーコードだけで判定できるようにする（00310 JAN キャッシュ）
    const allergens = this.buildAllergensFromGemini(geminiResult);
    const upsertData = {
      productName: geminiResult.product_name ?? null,
      allergens,
      rawText: geminiResult.raw_text,
      confidence: geminiResult.confidence,
    };
    let product: ProductRecord;
    // ⚠️ 安全設計: JAN キャッシュは全ユーザー共有のため、確実に読めた結果（confidence: high）のみ保存する。
    // medium は本人の履歴用に hash キーでのみ保存し、他ユーザーの判定に影響させない
    if (janCode && geminiResult.confidence === 'high') {
      product = await this.productRepository.upsertByJan(janCode, upsertData);
      this.logger.log(`JAN キャッシュ保存: jan=${janCode}`);
    } else {
      const labelHash = buildLabelHash(
        geminiResult.raw_text.slice(0, RAW_TEXT_PREFIX_LENGTH),
        '',
        geminiResult.raw_text,
      );
      product = await this.productRepository.upsertByHash(labelHash, upsertData);
    }

    // Step 8: location: null で scan_histories に記録
    // （場所はユーザーの「場所を登録」操作時に PATCH /history/:id で更新する — 00320）
    const overallJudgment = this.deriveOverallJudgment(geminiResult.results);
    const judgment = this.toJudgmentShort(overallJudgment);
    const allDetected = this.buildDetectedAllergenNames(geminiResult.results);

    // userId が存在する場合のみ履歴を保存する（認証済みリクエストのみ）
    let historyId: string | undefined;
    if (userId) {
      const saved = await this.scanHistoryRepository.create({
        userId,
        productId: product.id,
        productName: geminiResult.product_name ?? null,
        judgment,
        detected: allDetected,
        location: null,
        thumbnailUrl: null,
        rawText: geminiResult.raw_text,
      });
      historyId = saved.id;
      await this.userDailyScansService.incrementScanCount(userId);
    }

    this.logger.log(
      `OCR 処理完了: s3Key=${s3Key}, resultCount=${geminiResult.results.length}`,
    );

    // バックグラウンドで店舗キャッシュをウォームアップする（非同期・失敗しても無視）
    if (lat !== undefined && lng !== undefined) {
      void this.storeCacheRepository.enqueueJob(lat, lng).catch((err) => {
        this.logger.warn('cache_job 投入失敗', err instanceof Error ? err.message : String(err));
      });
    }

    return { ...geminiResult, history_id: historyId };
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
    janCode?: string,
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

    const byteCount = Math.floor((imageBase64.length * 3) / 4);
    if (byteCount > MAX_IMAGE_SIZE_BYTES) {
      yield { type: 'error', code: 'IMAGE_TOO_LARGE', message: '画像サイズが大きすぎます。再スキャンしてください。' };
      return;
    }

    if (!isValidImageMagicBytes(imageBase64)) {
      yield { type: 'error', code: 'INVALID_IMAGE_FORMAT', message: '無効なファイル形式です。' };
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
      yield { type: 'error', code: 'INCOMPLETE_IMAGE', message: '原材料またはバーコード全体が映るように撮影してください。' };
      return;
    }

    if (geminiResult.confidence === 'low' && !allowLowConfidence) {
      yield { type: 'confidence_low', raw_text: geminiResult.raw_text };
      return;
    }

    // JAN が検出済みの場合は jan キーで保存し、次回以降バーコードだけで判定できるようにする（00310 JAN キャッシュ）
    const allergens = this.buildAllergensFromGemini(geminiResult);
    const upsertData = {
      productName: geminiResult.product_name ?? null,
      allergens,
      rawText: geminiResult.raw_text,
      confidence: geminiResult.confidence,
    };
    let product: ProductRecord;
    // ⚠️ 安全設計: JAN キャッシュは全ユーザー共有のため、確実に読めた結果（confidence: high）のみ保存する。
    // medium は本人の履歴用に hash キーでのみ保存し、他ユーザーの判定に影響させない
    if (janCode && geminiResult.confidence === 'high') {
      product = await this.productRepository.upsertByJan(janCode, upsertData);
      this.logger.log(`JAN キャッシュ保存: jan=${janCode}`);
    } else {
      const labelHash = buildLabelHash(
        geminiResult.raw_text.slice(0, RAW_TEXT_PREFIX_LENGTH),
        '',
        geminiResult.raw_text,
      );
      product = await this.productRepository.upsertByHash(labelHash, upsertData);
    }

    // location: null で保存する（場所登録はユーザー操作時の PATCH に分離 — 00320）
    const overallJudgment = this.deriveOverallJudgment(geminiResult.results);
    const judgment = this.toJudgmentShort(overallJudgment);
    const allDetected = this.buildDetectedAllergenNames(geminiResult.results);

    // userId が存在する場合のみ履歴を保存する（認証済みリクエストのみ）
    let historyId: string | undefined;
    if (userId) {
      const saved = await this.scanHistoryRepository.create({
        userId,
        productId: product.id,
        productName: geminiResult.product_name ?? null,
        judgment,
        detected: allDetected,
        location: null,
        thumbnailUrl: null,
        rawText: geminiResult.raw_text,
      });
      historyId = saved.id;
      await this.userDailyScansService.incrementScanCount(userId);
    }

    this.logger.log(`OCR stream 完了: s3Key=${s3Key}, resultCount=${geminiResult.results.length}`);

    // バックグラウンドで店舗キャッシュをウォームアップする（非同期・失敗しても無視）
    if (lat !== undefined && lng !== undefined) {
      void this.storeCacheRepository.enqueueJob(lat, lng).catch((err) => {
        this.logger.warn('cache_job 投入失敗', err instanceof Error ? err.message : String(err));
      });
    }

    yield { type: 'result', data: { ...geminiResult, history_id: historyId } };
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

  /**
   * Gemini レスポンスから ProductAllergens を生成する。
   * contains / partial にはアレルゲン名を保存する（成分テキストは components へ）。
   * 名前で保存しないと deriveJudgment（みんなのスキャン・履歴の設定追従）の
   * アレルゲン名照合が機能しないため。
   * ⚠️ 安全設計: may_contain（製造ラインコンタミ）は contains（NG）ではなく partial に分類する
   */
  private buildAllergensFromGemini(
    result: GeminiOcrResponse,
  ): ProductAllergens {
    const contains = result.results
      .filter(
        (r) => r.judgment === '含む' && r.detection_type !== 'may_contain',
      )
      .map((r) => r.allergen);
    const partial = result.results
      .filter(
        (r) =>
          r.judgment === '一部含む' ||
          (r.judgment === '含む' && r.detection_type === 'may_contain'),
      )
      .map((r) => r.allergen);
    const components = result.results.flatMap((r) => r.detected);
    return {
      contains: [...new Set(contains)],
      partial: [...new Set(partial)],
      components,
    };
  }

  /**
   * 履歴の detected に保存するアレルゲン名リストを生成する。
   * 成分テキストではなく名前を保存する（現在のアレルギー設定との照合に必要）。
   */
  private buildDetectedAllergenNames(
    results: GeminiOcrResponse['results'],
  ): string[] {
    return [
      ...new Set(
        results.filter((r) => r.judgment !== 'なし').map((r) => r.allergen),
      ),
    ];
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

  /** アレルゲン情報が1件もない ProductAllergens かどうか（OFF 未入力商品の安全側判定に使う）。 */
  private hasNoAllergenInfo(allergens: ProductAllergens): boolean {
    return (
      allergens.contains.length === 0 &&
      allergens.partial.length === 0 &&
      allergens.components.length === 0
    );
  }

  /** Gemini の judgment を JudgmentShort に変換する。 */
  private toJudgmentShort(judgment: string): 'ng' | 'partial' | 'ok' {
    if (judgment === '含む') return 'ng';
    if (judgment === '一部含む') return 'partial';
    return 'ok';
  }

  private buildResultFromDb(
    productId: string | null,
    productName: string | null,
    allergens: ProductAllergens,
    fromCache: boolean,
    rawText: string | null = null,
    itemUrl: string | null = null,
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
      product_id: productId,
      product_name: productName,
      allergens,
      judgment,
      detected,
      risk_level: riskLevel,
      from_cache: fromCache,
      // ⚠️ 安全設計: 他ユーザーの OCR 結果（JAN キャッシュ）を本人が検証できるよう raw_text を返す
      raw_text: rawText,
      item_url: itemUrl,
    };
  }

}
