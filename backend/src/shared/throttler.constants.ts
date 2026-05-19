/**
 * NestJS Throttler 用レート制限定数
 *
 * ⚠️ Lambda メモリストア制限:
 * ThrottlerModule のデフォルトストレージはインプロセスのメモリキャッシュです。
 * AWS Lambda はリクエストごとにインスタンスが異なる場合があり、
 * インスタンス間でスロットリングカウンターが共有されません。
 * そのため NestJS Throttler は「1インスタンスあたりのレート制限」として機能します。
 * アプリ外の第1防衛ラインとして API Gateway のグローバルスロットリング（Layer 1）を
 * 必ず併用してください。
 *
 * TTL 単位: @nestjs/throttler v6 はミリ秒単位で TTL を指定します。
 */

const SEC_TO_MS = 1000;

/** グローバルデフォルト: 60秒間に100リクエスト */
export const THROTTLE_DEFAULT_TTL_MS = 60 * SEC_TO_MS;
export const THROTTLE_DEFAULT_LIMIT = 100;

/** POST /scan/ocr: Gemini API コスト保護のため厳しく制限（60秒に5回） */
export const THROTTLE_OCR_TTL = 60 * SEC_TO_MS;
export const THROTTLE_OCR_LIMIT = 5;

/** POST /scan/barcode: DB flooding 防止（60秒に30回） */
export const THROTTLE_BARCODE_TTL = 60 * SEC_TO_MS;
export const THROTTLE_BARCODE_LIMIT = 30;

/** POST /users/init: DB flooding 防止（3600秒に3回） */
export const THROTTLE_USERS_INIT_TTL = 3600 * SEC_TO_MS;
export const THROTTLE_USERS_INIT_LIMIT = 3;

/** GET /history: 過剰ポーリング防止（60秒に60回） */
export const THROTTLE_HISTORY_TTL = 60 * SEC_TO_MS;
export const THROTTLE_HISTORY_LIMIT = 60;

/** POST /users/restore: バックアップコードのブルートフォース防止（60秒に5回） */
export const THROTTLE_RESTORE_TTL = 60 * SEC_TO_MS;
export const THROTTLE_RESTORE_LIMIT = 5;
