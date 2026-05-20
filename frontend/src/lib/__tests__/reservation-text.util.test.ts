import { buildReservationText } from '@/lib/reservation-text.util'
import type { ReservationTextFormat } from '@/lib/reservation-text.util'

const jaFormat: ReservationTextFormat = {
  prefix: '私は',
  suffix: 'アレルギーがあります。食事の際はご配慮をお願いいたします。',
  separator: '・',
}

const enFormat: ReservationTextFormat = {
  prefix: 'I have the following food allergies: ',
  suffix: '. Please take this into account when preparing my meal.',
  separator: ', ',
}

describe('buildReservationText', () => {
  it('品目が 3 件の場合、ja フォーマットで正しいテキストを生成する', () => {
    const result = buildReservationText(['卵', '乳', '小麦'], jaFormat)
    expect(result).toBe(
      '私は卵・乳・小麦アレルギーがあります。食事の際はご配慮をお願いいたします。',
    )
  })

  it('品目が 3 件の場合、en フォーマットで正しいテキストを生成する', () => {
    const result = buildReservationText(['egg', 'milk', 'wheat'], enFormat)
    expect(result).toBe(
      'I have the following food allergies: egg, milk, wheat. Please take this into account when preparing my meal.',
    )
  })

  it('品目が 1 件の場合、ja フォーマットで正しいテキストを生成する', () => {
    const result = buildReservationText(['卵'], jaFormat)
    expect(result).toBe(
      '私は卵アレルギーがあります。食事の際はご配慮をお願いいたします。',
    )
  })

  it('品目が 1 件の場合、en フォーマットで正しいテキストを生成する', () => {
    const result = buildReservationText(['egg'], enFormat)
    expect(result).toBe(
      'I have the following food allergies: egg. Please take this into account when preparing my meal.',
    )
  })

  it('品目が 2 件の場合、en フォーマットで正しいテキストを生成する', () => {
    const result = buildReservationText(['egg', 'milk'], enFormat)
    expect(result).toBe(
      'I have the following food allergies: egg, milk. Please take this into account when preparing my meal.',
    )
  })

  it('品目が 0 件のとき空文字列を返す', () => {
    expect(buildReservationText([], jaFormat)).toBe('')
    expect(buildReservationText([], enFormat)).toBe('')
  })
})
