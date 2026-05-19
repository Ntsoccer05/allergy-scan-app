/** JAN コードを products テーブルの id_value 形式に変換する。 */
export const buildJanIdValue = (janCode: string): string => `jan#${janCode}`;

/** label_hash を products テーブルの id_value 形式に変換する。 */
export const buildHashIdValue = (labelHash: string): string =>
  `hash#${labelHash}`;
