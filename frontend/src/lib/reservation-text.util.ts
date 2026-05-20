/**
 * お店予約用テキストの生成ロジック。
 * フォーマット文字列は呼び出し元が i18n キー経由で取得して渡す（ハードコード禁止）。
 * - `prefix`: 品目列挙の前の文字列
 * - `suffix`: 品目列挙の後の文字列
 * - `separator`: 品目間の区切り文字（例: ja=「・」、en=「, 」）
 */
export type ReservationTextFormat = {
  prefix: string
  suffix: string
  separator: string
}

/**
 * `enabledNames` に含まれる品目名を `format` の形式で結合して予約用テキストを生成する。
 * 品目が 0 件のときは空文字列を返す（0 件判定はコンポーネント側が行う）。
 */
export const buildReservationText = (
  enabledNames: string[],
  format: ReservationTextFormat,
): string => {
  if (enabledNames.length === 0) return ''
  const items = enabledNames.join(format.separator)
  return `${format.prefix}${items}${format.suffix}`
}
