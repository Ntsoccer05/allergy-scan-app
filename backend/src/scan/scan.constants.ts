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
