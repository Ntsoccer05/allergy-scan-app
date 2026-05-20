import { render, screen, fireEvent, act } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { ResultCard } from './ResultCard'
import type { AllergenResult, HighlightItem, ScanResult } from '@/app/scan/scan.types'
import scanJa from '../../public/locales/ja/scan.json'

const onClose = jest.fn()

/** navigator.share をモックするヘルパー */
const mockNavigatorShare = (impl?: jest.Mock) => {
  const mockShare = impl ?? jest.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    writable: true,
    value: mockShare,
  })
  return mockShare
}

/** navigator.share を undefined に設定するヘルパー */
const removeNavigatorShare = () => {
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    writable: true,
    value: undefined,
  })
}

/** テスト用の NextIntlClientProvider ラッパー（日本語ロケールで翻訳文字列をそのまま使う） */
const renderWithI18n = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={{ ...scanJa }}>
      {ui}
    </NextIntlClientProvider>,
  )

const makeOcrResult = (
  judgment: '含む' | '一部含む' | 'なし' | '判定不能',
  rawText = '原材料: 卵',
): ScanResult => ({
  type: 'ocr',
  data: {
    raw_text: rawText,
    confidence: 'high',
    results:
      judgment === 'なし'
        ? []
        : [
            {
              allergen: '卵',
              judgment,
              detection_type: 'contains',
              detected: ['卵'],
              risk_level: 'high',
              reason: '卵を検出',
            },
          ],
    highlights:
      judgment === 'なし' ? [] : [{ text: '卵', judgment: 'ng' as const }],
    incomplete: false,
    price: null,
    price_with_tax: null,
    price_confidence: null,
  },
})

/** 複数アレルゲン結果を持つ OCR モック */
const makeMultiAllergenResult = (
  items: AllergenResult[],
  highlights: HighlightItem[] = [],
  rawText = '原材料: 卵、乳成分、小麦',
): ScanResult => ({
  type: 'ocr',
  data: {
    raw_text: rawText,
    confidence: 'high',
    results: items,
    highlights,
    incomplete: false,
    price: null,
    price_with_tax: null,
    price_confidence: null,
  },
})

describe('ResultCard', () => {
  beforeEach(() => {
    onClose.mockClear()
  })

  describe('judgment: 含む', () => {
    it('「⚠️ 購入前にラベルの実物も必ずご確認ください」がレンダリングされる', () => {
      renderWithI18n(<ResultCard result={makeOcrResult('含む')} onClose={onClose} />)
      expect(
        screen.getByText(/購入前にラベルの実物も必ずご確認ください/),
      ).toBeInTheDocument()
    })

    it('「アナフィラキシーのリスク」文言がレンダリングされる', () => {
      renderWithI18n(<ResultCard result={makeOcrResult('含む')} onClose={onClose} />)
      expect(screen.getByText(/アナフィラキシーのリスク/)).toBeInTheDocument()
    })

    it('共有ボタンが存在しない', () => {
      mockNavigatorShare()
      renderWithI18n(<ResultCard result={makeOcrResult('含む')} onClose={onClose} />)
      expect(screen.queryByRole('button', { name: /共有する/ })).toBeNull()
    })
  })

  describe('judgment: 一部含む', () => {
    it('「アナフィラキシーのリスク」文言がレンダリングされる', () => {
      renderWithI18n(<ResultCard result={makeOcrResult('一部含む')} onClose={onClose} />)
      expect(screen.getByText(/アナフィラキシーのリスク/)).toBeInTheDocument()
    })

    it('共有ボタンが存在しない', () => {
      mockNavigatorShare()
      renderWithI18n(<ResultCard result={makeOcrResult('一部含む')} onClose={onClose} />)
      expect(screen.queryByRole('button', { name: /共有する/ })).toBeNull()
    })
  })

  describe('judgment: なし', () => {
    it('「⚠️ 購入前にラベルの実物も必ずご確認ください」がレンダリングされる', () => {
      renderWithI18n(<ResultCard result={makeOcrResult('なし')} onClose={onClose} />)
      expect(
        screen.getByText(/購入前にラベルの実物も必ずご確認ください/),
      ).toBeInTheDocument()
    })

    it('navigator.share が関数のとき共有ボタンが存在する', () => {
      mockNavigatorShare()
      renderWithI18n(<ResultCard result={makeOcrResult('なし')} onClose={onClose} />)
      expect(screen.getByRole('button', { name: /共有する/ })).toBeInTheDocument()
    })

    it('「アナフィラキシーのリスク」文言が存在しない', () => {
      renderWithI18n(<ResultCard result={makeOcrResult('なし')} onClose={onClose} />)
      expect(screen.queryByText(/アナフィラキシーのリスク/)).toBeNull()
    })
  })

  describe('Web Share API', () => {
    afterEach(() => {
      removeNavigatorShare()
    })

    it('navigator.share が関数として存在 + judgment === "なし" → 共有ボタンが DOM に描画される', () => {
      mockNavigatorShare()
      renderWithI18n(<ResultCard result={makeOcrResult('なし')} onClose={onClose} />)
      expect(screen.getByRole('button', { name: /共有する/ })).toBeInTheDocument()
    })

    it('navigator.share が undefined + judgment === "なし" → 共有ボタンが DOM に描画されない', () => {
      removeNavigatorShare()
      renderWithI18n(<ResultCard result={makeOcrResult('なし')} onClose={onClose} />)
      expect(screen.queryByRole('button', { name: /共有する/ })).toBeNull()
    })

    it('navigator.share が関数として存在 + judgment === "含む" → 共有ボタンが DOM に描画されない', () => {
      mockNavigatorShare()
      renderWithI18n(<ResultCard result={makeOcrResult('含む')} onClose={onClose} />)
      expect(screen.queryByRole('button', { name: /共有する/ })).toBeNull()
    })

    it('共有ボタンクリック時に navigator.share が title / text を含むオブジェクトで呼ばれる', async () => {
      const mockShare = mockNavigatorShare()
      renderWithI18n(<ResultCard result={makeOcrResult('なし')} onClose={onClose} />)
      const shareBtn = screen.getByRole('button', { name: /共有する/ })
      await act(async () => {
        fireEvent.click(shareBtn)
      })
      expect(mockShare).toHaveBeenCalledTimes(1)
      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.any(String),
          text: expect.any(String),
        }),
      )
    })

    it('navigator.share が AbortError を投げる場合、エラーがユーザーに表示されない（UI 変化なし）', async () => {
      const abortError = new DOMException('Share cancelled', 'AbortError')
      const mockShare = mockNavigatorShare(jest.fn().mockRejectedValue(abortError))
      renderWithI18n(<ResultCard result={makeOcrResult('なし')} onClose={onClose} />)
      const shareBtn = screen.getByRole('button', { name: /共有する/ })
      // エラーが投げられても UI が変化しないことを確認
      await act(async () => {
        fireEvent.click(shareBtn)
      })
      expect(mockShare).toHaveBeenCalledTimes(1)
      // 共有ボタンはまだ表示されている（エラーで非表示にならない）
      expect(screen.getByRole('button', { name: /共有する/ })).toBeInTheDocument()
    })
  })

  describe('raw_text', () => {
    it('raw_text のテキストが DOM 内に存在する（展開前でも sr-only で存在）', () => {
      const rawText = '卵、小麦、乳成分'
      renderWithI18n(
        <ResultCard result={makeOcrResult('なし', rawText)} onClose={onClose} />,
      )
      expect(screen.getByText(rawText)).toBeInTheDocument()
    })
  })

  describe('複数アレルゲン表示（R1: results[] ループ）', () => {
    const multiItems: AllergenResult[] = [
      {
        allergen: '乳',
        judgment: '含む',
        detection_type: 'contains',
        detected: ['乳成分'],
        risk_level: 'high',
        reason: '乳成分を検出',
      },
      {
        allergen: '卵',
        judgment: '一部含む',
        detection_type: 'partial',
        detected: ['卵黄'],
        risk_level: 'medium',
        reason: '一括表示で卵黄を検出',
      },
    ]

    it('複数のアレルゲン名がすべて表示される', () => {
      renderWithI18n(
        <ResultCard result={makeMultiAllergenResult(multiItems)} onClose={onClose} />,
      )
      expect(screen.getByText('乳')).toBeInTheDocument()
      expect(screen.getByText('卵')).toBeInTheDocument()
    })

    it('detection_type: contains → 🔴 NG が表示される', () => {
      renderWithI18n(
        <ResultCard result={makeMultiAllergenResult(multiItems)} onClose={onClose} />,
      )
      expect(screen.getByText('🔴 NG')).toBeInTheDocument()
    })

    it('detection_type: partial → 🟡 注意 が表示される', () => {
      renderWithI18n(
        <ResultCard result={makeMultiAllergenResult(multiItems)} onClose={onClose} />,
      )
      expect(screen.getByText('🟡 注意')).toBeInTheDocument()
    })

    it('検出成分がチップとして表示される', () => {
      renderWithI18n(
        <ResultCard result={makeMultiAllergenResult(multiItems)} onClose={onClose} />,
      )
      expect(screen.getByText('乳成分')).toBeInTheDocument()
      expect(screen.getByText('卵黄')).toBeInTheDocument()
    })
  })

  describe('may_contain の表示（R2: may_contain は 🟠 注意喚起、NG 扱いしない）', () => {
    const mayContainItem: AllergenResult[] = [
      {
        allergen: '小麦',
        judgment: '一部含む',
        detection_type: 'may_contain',
        detected: ['小麦'],
        risk_level: 'low',
        reason: '製造ラインで小麦を使用した設備で製造',
      },
    ]

    it('🟠 注意喚起 が表示される', () => {
      renderWithI18n(
        <ResultCard result={makeMultiAllergenResult(mayContainItem)} onClose={onClose} />,
      )
      expect(screen.getByText('🟠 注意喚起')).toBeInTheDocument()
    })

    it('🔴 NG が表示されない（may_contain を NG 扱いしない）', () => {
      renderWithI18n(
        <ResultCard result={makeMultiAllergenResult(mayContainItem)} onClose={onClose} />,
      )
      expect(screen.queryByText('🔴 NG')).toBeNull()
    })
  })

  describe('results: [] の場合（R6: アレルゲン設定なし）', () => {
    it('アレルゲン設定なし文言が表示される', () => {
      renderWithI18n(<ResultCard result={makeOcrResult('なし')} onClose={onClose} />)
      expect(screen.getByText(/アレルゲン設定なし/)).toBeInTheDocument()
    })
  })

  describe('highlights ハイライト表示（R3）', () => {
    it('原材料展開ボタンをクリックすると raw_text がハイライト付きで表示される', () => {
      const rawText = '原材料: 卵、乳成分'
      const highlights: HighlightItem[] = [
        { text: '卵', judgment: 'ng' },
        { text: '乳成分', judgment: 'partial' },
      ]
      const items: AllergenResult[] = [
        {
          allergen: '卵',
          judgment: '含む',
          detection_type: 'contains',
          detected: ['卵'],
          risk_level: 'high',
          reason: '卵を検出',
        },
      ]
      renderWithI18n(
        <ResultCard
          result={makeMultiAllergenResult(items, highlights, rawText)}
          onClose={onClose}
        />,
      )

      // 展開ボタンをクリック
      const expandBtn = screen.getByText(/原材料を確認する/)
      fireEvent.click(expandBtn)

      // raw_text の一部が mark 要素でハイライトされている
      const marks = document.querySelectorAll('mark')
      expect(marks.length).toBeGreaterThan(0)
    })

    it('highlights が空の場合も raw_text が表示される', () => {
      const rawText = '原材料: 大豆'
      renderWithI18n(
        <ResultCard result={makeOcrResult('なし', rawText)} onClose={onClose} />,
      )
      const expandBtn = screen.getByText(/原材料を確認する/)
      fireEvent.click(expandBtn)
      // sr-only 以外でも表示されること
      const allText = screen.getAllByText(rawText)
      expect(allText.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('全アレルゲンがなしの場合（R4: ✅ 問題なし）', () => {
    it('全アレルゲンが「なし」なら ✅ 問題なし が表示される', () => {
      const noneItems: AllergenResult[] = [
        {
          allergen: '卵',
          judgment: 'なし',
          detection_type: 'contains',
          detected: [],
          risk_level: 'ignore',
          reason: '卵は含まれていません',
        },
      ]
      renderWithI18n(
        <ResultCard
          result={makeMultiAllergenResult(noneItems, [], '原材料: 大豆')}
          onClose={onClose}
        />,
      )
      expect(screen.getByText(/✅ 問題なし/)).toBeInTheDocument()
    })
  })
})
