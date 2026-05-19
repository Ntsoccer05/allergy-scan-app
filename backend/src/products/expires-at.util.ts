import { EXPIRES_AT_DAYS, SCAN_COUNT_THRESHOLD } from '../scan/scan.constants';

/**
 * scan_count に連動して products.expires_at の有効期間（日数）を返す。
 * マジックナンバーは scan.constants.ts に集約しているためここには書かない。
 */
export const getExpiryDays = (scanCount: number): number => {
  if (scanCount >= SCAN_COUNT_THRESHOLD.HIGH)
    return EXPIRES_AT_DAYS.HIGH_SCAN_COUNT;
  if (scanCount >= SCAN_COUNT_THRESHOLD.MID)
    return EXPIRES_AT_DAYS.MID_SCAN_COUNT;
  return EXPIRES_AT_DAYS.LOW_SCAN_COUNT;
};

/** 現在時刻から expiryDays 日後の Date を返す。 */
export const calcExpiresAt = (scanCount: number): Date => {
  const expiryDays = getExpiryDays(scanCount);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);
  return expiresAt;
};
