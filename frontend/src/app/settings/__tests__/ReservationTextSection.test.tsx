import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ReservationTextSection } from '../ReservationTextSection'
import type { AllergySettings, AllergenGroup } from '../settings.types'

// i18n テキストを返す簡易 t 関数
const t = (key: string): string => {
  const messages: Record<string, string> = {
    'reservationText.title': 'お店予約用テキスト',
    'reservationText.description': '予約時にご利用ください',
    'reservationText.copyButton': 'コピーする',
    'reservationText.copiedButton': 'コピーしました',
    'reservationText.regenerateButton': '再生成',
    'reservationText.copyError': 'コピーに失敗しました',
    'reservationText.format.prefix': '私は',
    'reservationText.format.suffix': 'アレルギーがあります。食事の際はご配慮をお願いいたします。',
    'reservationText.format.separator': '・',
  }
  return messages[key] ?? key
}

const makeAllergenGroups = (
  items: { name: string; display_name: string }[],
): AllergenGroup[] => [
  {
    category: 'mandatory',
    label: '特定原材料',
    items: items.map((item) => ({
      ...item,
      emoji: null,
      display_order: 1,
      judgment_type: 'allergy' as const,
    })),
  },
]

const makeAllergies = (
  enabledNames: string[],
  allNames: string[],
): AllergySettings =>
  Object.fromEntries(
    allNames.map((name) => [
      name,
      { enabled: enabledNames.includes(name), partialAlert: false },
    ]),
  )

describe('ReservationTextSection', () => {
  it('enabled: true の品目が 0 件のとき、コンポーネントが null を返し DOM に何も描画されない', () => {
    const allergenGroups = makeAllergenGroups([
      { name: '卵', display_name: '卵' },
      { name: '乳', display_name: '乳' },
    ])
    const allergies = makeAllergies([], ['卵', '乳'])

    const { container } = render(
      <ReservationTextSection
        allergies={allergies}
        allergenGroups={allergenGroups}
        locale="ja"
        t={t}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('enabled: true の品目が存在するとき、textarea に自動生成テキストが表示される', () => {
    const allergenGroups = makeAllergenGroups([
      { name: '卵', display_name: '卵' },
      { name: '乳', display_name: '乳' },
    ])
    const allergies = makeAllergies(['卵', '乳'], ['卵', '乳'])

    render(
      <ReservationTextSection
        allergies={allergies}
        allergenGroups={allergenGroups}
        locale="ja"
        t={t}
      />,
    )

    const textarea = screen.getByRole('textbox')
    expect(textarea).toBeInTheDocument()
    expect((textarea as HTMLTextAreaElement).value).toBe(
      '私は卵・乳アレルギーがあります。食事の際はご配慮をお願いいたします。',
    )
  })

  it('enabled: true の品目が存在するとき、再生成ボタンが存在する', () => {
    const allergenGroups = makeAllergenGroups([
      { name: '卵', display_name: '卵' },
    ])
    const allergies = makeAllergies(['卵'], ['卵'])

    render(
      <ReservationTextSection
        allergies={allergies}
        allergenGroups={allergenGroups}
        locale="ja"
        t={t}
      />,
    )

    expect(screen.getByText('再生成')).toBeInTheDocument()
  })

  it('textarea を編集後に再生成ボタンを押すと textarea の値が自動生成テキストに戻る', () => {
    const allergenGroups = makeAllergenGroups([
      { name: '卵', display_name: '卵' },
    ])
    const allergies = makeAllergies(['卵'], ['卵'])

    render(
      <ReservationTextSection
        allergies={allergies}
        allergenGroups={allergenGroups}
        locale="ja"
        t={t}
      />,
    )

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '編集後のテキスト' } })
    expect(textarea.value).toBe('編集後のテキスト')

    fireEvent.click(screen.getByText('再生成'))
    expect(textarea.value).toBe(
      '私は卵アレルギーがあります。食事の際はご配慮をお願いいたします。',
    )
  })

  it('コピーボタンを押すと navigator.clipboard.writeText が呼ばれる', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    const allergenGroups = makeAllergenGroups([
      { name: '卵', display_name: '卵' },
    ])
    const allergies = makeAllergies(['卵'], ['卵'])

    render(
      <ReservationTextSection
        allergies={allergies}
        allergenGroups={allergenGroups}
        locale="ja"
        t={t}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByText('コピーする'))
    })

    expect(writeText).toHaveBeenCalledWith(
      '私は卵アレルギーがあります。食事の際はご配慮をお願いいたします。',
    )
  })

  it('コピー成功後、ボタンテキストがコピー完了表示に切り替わる', async () => {
    jest.useFakeTimers()

    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    const allergenGroups = makeAllergenGroups([
      { name: '卵', display_name: '卵' },
    ])
    const allergies = makeAllergies(['卵'], ['卵'])

    render(
      <ReservationTextSection
        allergies={allergies}
        allergenGroups={allergenGroups}
        locale="ja"
        t={t}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByText('コピーする'))
    })

    await waitFor(() => {
      expect(screen.getByText('コピーしました')).toBeInTheDocument()
    })

    act(() => {
      jest.advanceTimersByTime(2000)
    })

    await waitFor(() => {
      expect(screen.getByText('コピーする')).toBeInTheDocument()
    })

    jest.useRealTimers()
  })

  it('navigator.clipboard.writeText が reject したとき、ページがクラッシュせずエラーが表示される', async () => {
    const writeText = jest.fn().mockRejectedValue(new Error('permission denied'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    const allergenGroups = makeAllergenGroups([
      { name: '卵', display_name: '卵' },
    ])
    const allergies = makeAllergies(['卵'], ['卵'])

    render(
      <ReservationTextSection
        allergies={allergies}
        allergenGroups={allergenGroups}
        locale="ja"
        t={t}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByText('コピーする'))
    })

    await waitFor(() => {
      expect(screen.getByText('コピーに失敗しました')).toBeInTheDocument()
    })
  })

  it('allergies の enabled 状態が変化したとき、textarea が新しい自動生成テキストに追従する', () => {
    const allergenGroups = makeAllergenGroups([
      { name: '卵', display_name: '卵' },
      { name: '乳', display_name: '乳' },
    ])

    // key prop の生成ロジックは settings/page.tsx に合わせる：
    // enabled 品目名を join(',') + locale
    const makeKey = (enabledNames: string[], locale: string) =>
      enabledNames.join(',') + locale

    const { rerender } = render(
      <ReservationTextSection
        key={makeKey(['卵'], 'ja')}
        allergies={makeAllergies(['卵'], ['卵', '乳'])}
        allergenGroups={allergenGroups}
        locale="ja"
        t={t}
      />,
    )

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      '私は卵アレルギーがあります。食事の際はご配慮をお願いいたします。',
    )

    // key が変わることで React がコンポーネントを再マウントし、
    // useState の初期値（generatedText）が再評価されて textarea がリセットされる。
    rerender(
      <ReservationTextSection
        key={makeKey(['卵', '乳'], 'ja')}
        allergies={makeAllergies(['卵', '乳'], ['卵', '乳'])}
        allergenGroups={allergenGroups}
        locale="ja"
        t={t}
      />,
    )

    // 再マウント後は新しい DOM 要素が生成されるため screen から再取得する。
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      '私は卵・乳アレルギーがあります。食事の際はご配慮をお願いいたします。',
    )
  })
})
