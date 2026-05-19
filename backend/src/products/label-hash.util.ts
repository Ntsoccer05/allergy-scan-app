import { createHash } from 'crypto';

/** label_hash 生成で使用する原材料テキストの先頭文字数。 */
const RAW_TEXT_PREFIX_LENGTH = 50;

/**
 * 惣菜・バーコードなし商品の label_hash を生成する（dry_principles.md の集約点）。
 * 「商品名 + 店舗名 + 原材料の先頭50文字」を SHA-256 でハッシュ化する。
 * 64文字の16進文字列を返す。
 */
export const buildLabelHash = (
  productName: string,
  storeName: string,
  rawText: string,
): string => {
  const rawTextPrefix = rawText.slice(0, RAW_TEXT_PREFIX_LENGTH);
  const seed = `${productName}${storeName}${rawTextPrefix}`;
  return createHash('sha256').update(seed, 'utf8').digest('hex');
};
