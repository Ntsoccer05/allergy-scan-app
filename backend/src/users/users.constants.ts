/** CORS 許可オリジンのデフォルト値 */
export const CORS_ORIGIN_DEFAULT = 'http://localhost:3000' as const;

/** 1日あたりの引き継ぎコード最大発行回数（Lambda 分散環境でもカウンターが共有される DB で管理） */
export const BACKUP_CODE_DAILY_LIMIT = 5;
