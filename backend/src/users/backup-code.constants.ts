/**
 * バックアップコード関連定数
 * ⚠️ 安全設計: O/0・I/1 を除外して視覚的な混同を防ぐ
 */

/** バックアップコードに使用する文字セット（O/0・I/1 除外・大文字英数字のみ） */
export const BACKUP_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' as const;

/** バックアップコードのブロックあたり文字数 */
export const BACKUP_CODE_BLOCK_LENGTH = 4 as const;

/** バックアップコードのブロック数 */
export const BACKUP_CODE_BLOCK_COUNT = 2 as const;

/** バックアップコードのプレフィックス */
export const BACKUP_CODE_PREFIX = 'ALRG' as const;

/** バックアップコードの有効期限（日数） */
export const BACKUP_CODE_EXPIRES_DAYS = 7 as const;

/** INSERT 失敗時のリトライ上限回数 */
export const BACKUP_CODE_MAX_RETRIES = 3 as const;

/**
 * バックアップコードのパターン（BACKUP_CODE_CHARSET と一致させること）
 * ⚠️ 安全設計: O（オー）と I（アイ）を除外して視覚的な混同を防ぐ
 * A-H, J-N, P-Z（O除外）, 2-9（0/1除外）のみ許容
 */
export const BACKUP_CODE_PATTERN = /^ALRG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
