/** ひらがな → カタカナ変換。ASCII や他の文字はそのまま。 */
export const toKatakana = (str: string): string =>
  str.replace(/[ぁ-ゖ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60),
  );

/** カタカナ → ひらがな変換。ASCII や他の文字はそのまま。 */
export const toHiragana = (str: string): string =>
  str.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );

/**
 * 検索クエリのひらがな・カタカナ両方のバリアントを返す。
 * ひらがな入力でカタカナ登録データ（またはその逆）にマッチさせるために使う。
 * 戻り値: [katakana 版, hiragana 版]
 */
export const kanaSearchVariants = (str: string): [string, string] => [
  toKatakana(str),
  toHiragana(str),
];
