/**
 * ⚠️ 安全設計: TTL・有効期限日数・scan_count しきい値はここだけに定義する。
 * expires-at.util.ts や ScanService に直書きしない（DRY 原則）。
 */

/** NestJS メモリキャッシュの TTL（秒）。Lambda 再起動でリセットされることを前提に短期のみ。 */
export const CACHE_TTL_MEMORY_SEC = 60;

/** products テーブルの expires_at 有効期限（日数）。scan_count 連動。 */
export const EXPIRES_AT_DAYS = {
  LOW_SCAN_COUNT: 30, // scan_count 1〜5
  MID_SCAN_COUNT: 90, // scan_count 6〜20
  HIGH_SCAN_COUNT: 180, // scan_count 21〜
} as const;

/** expires_at の期限ランクを決める scan_count しきい値。 */
export const SCAN_COUNT_THRESHOLD = {
  MID: 6,
  HIGH: 21,
} as const;

/** S3 に保存するキャプチャ画像のプレフィックス。 */
export const S3_KEY_PREFIX = 'images/';

/** 使用する Gemini モデル名。 */
export const GEMINI_MODEL_NAME = 'gemini-3.1-flash-lite';

/** S3 Presigned URL の有効期限（秒）。5分固定。 */
export const PRESIGNED_URL_EXPIRES_SEC = 300;

/** label_hash 生成時に使用する raw_text の先頭文字数。 */
export const RAW_TEXT_PREFIX_LENGTH = 50;

/** Gemini エラーログに出力するテキストの最大文字数。 */
export const GEMINI_ERROR_LOG_MAX_LENGTH = 200;

/** スキャンエンドポイントのクールダウン時間（ミリ秒）。Lambda 再起動でリセットされる短期制御。 */
export const SCAN_COOLDOWN_MS = 3_000;

/** S3 からフェッチした画像の最大許容バイト数（5MB）。超過は BadRequest で即返却。 */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * 許容する画像フォーマットのマジックバイト。
 * JPEG: FF D8 FF / PNG: 89 50 4E 47 0D 0A 1A 0A / WebP: RIFF....WEBP
 */
export const IMAGE_MAGIC_BYTES = {
  JPEG: Buffer.from([0xff, 0xd8, 0xff]),
  PNG: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  WEBP_RIFF: Buffer.from([0x52, 0x49, 0x46, 0x46]),
  WEBP_BODY: Buffer.from([0x57, 0x45, 0x42, 0x50]),
} as const;
