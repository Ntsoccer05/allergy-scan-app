import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { BottomNav } from '../BottomNav'
import commonJa from '../../../public/locales/ja/common.json'

// next/navigation の usePathname をモックする
const mockUsePathname = jest.fn<string, []>()
jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

// next/link をシンプルな <a> タグとしてモックする
jest.mock('next/link', () => {
  const MockLink = ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
  MockLink.displayName = 'MockLink'
  return MockLink
})

/** テスト用の NextIntlClientProvider ラッパー */
const renderWithI18n = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={{ common: commonJa }}>
      {ui}
    </NextIntlClientProvider>,
  )

describe('BottomNav', () => {
  describe('/scan パスのとき', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/scan')
    })

    it('スキャンタブのみアクティブスタイル（text-blue-600）を持つ', () => {
      renderWithI18n(<BottomNav />)
      const scanLink = screen.getByRole('link', { name: /スキャン/ })
      const historyLink = screen.getByRole('link', { name: /履歴/ })
      const settingsLink = screen.getByRole('link', { name: /設定/ })

      expect(scanLink).toHaveClass('text-blue-600')
      expect(historyLink).not.toHaveClass('text-blue-600')
      expect(settingsLink).not.toHaveClass('text-blue-600')
    })

    it('スキャンタブに aria-current="page" が設定される', () => {
      renderWithI18n(<BottomNav />)
      const scanLink = screen.getByRole('link', { name: /スキャン/ })
      expect(scanLink).toHaveAttribute('aria-current', 'page')
    })
  })

  describe('/ パス（トップ）のとき', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/')
    })

    it('スキャンタブがアクティブスタイル（text-blue-600）を持つ', () => {
      renderWithI18n(<BottomNav />)
      const scanLink = screen.getByRole('link', { name: /スキャン/ })
      expect(scanLink).toHaveClass('text-blue-600')
    })
  })

  describe('/history パスのとき', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/history')
    })

    it('履歴タブのみアクティブスタイル（text-blue-600）を持つ', () => {
      renderWithI18n(<BottomNav />)
      const scanLink = screen.getByRole('link', { name: /スキャン/ })
      const historyLink = screen.getByRole('link', { name: /履歴/ })
      const settingsLink = screen.getByRole('link', { name: /設定/ })

      expect(historyLink).toHaveClass('text-blue-600')
      expect(scanLink).not.toHaveClass('text-blue-600')
      expect(settingsLink).not.toHaveClass('text-blue-600')
    })

    it('履歴タブに aria-current="page" が設定される', () => {
      renderWithI18n(<BottomNav />)
      const historyLink = screen.getByRole('link', { name: /履歴/ })
      expect(historyLink).toHaveAttribute('aria-current', 'page')
    })
  })

  describe('/settings パスのとき', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/settings')
    })

    it('設定タブのみアクティブスタイル（text-blue-600）を持つ', () => {
      renderWithI18n(<BottomNav />)
      const scanLink = screen.getByRole('link', { name: /スキャン/ })
      const historyLink = screen.getByRole('link', { name: /履歴/ })
      const settingsLink = screen.getByRole('link', { name: /設定/ })

      expect(settingsLink).toHaveClass('text-blue-600')
      expect(scanLink).not.toHaveClass('text-blue-600')
      expect(historyLink).not.toHaveClass('text-blue-600')
    })

    it('設定タブに aria-current="page" が設定される', () => {
      renderWithI18n(<BottomNav />)
      const settingsLink = screen.getByRole('link', { name: /設定/ })
      expect(settingsLink).toHaveAttribute('aria-current', 'page')
    })
  })

  describe('/map パスのとき', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/map')
    })

    it('地図タブのみアクティブスタイル（text-blue-600）を持つ', () => {
      renderWithI18n(<BottomNav />)
      const scanLink = screen.getByRole('link', { name: /スキャン/ })
      const mapLink = screen.getByRole('link', { name: /地図/ })
      const settingsLink = screen.getByRole('link', { name: /設定/ })

      expect(mapLink).toHaveClass('text-blue-600')
      expect(scanLink).not.toHaveClass('text-blue-600')
      expect(settingsLink).not.toHaveClass('text-blue-600')
    })

    it('地図タブに aria-current="page" が設定される', () => {
      renderWithI18n(<BottomNav />)
      const mapLink = screen.getByRole('link', { name: /地図/ })
      expect(mapLink).toHaveAttribute('aria-current', 'page')
    })
  })

  describe('/onboarding パスのとき', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/onboarding')
    })

    it('ボトムナビが DOM に存在しない', () => {
      renderWithI18n(<BottomNav />)
      expect(screen.queryByRole('navigation')).toBeNull()
    })
  })

  describe('i18n キーの検証', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/scan')
    })

    it('t("nav.scan") が呼ばれ「スキャン」と表示される', () => {
      renderWithI18n(<BottomNav />)
      expect(screen.getByText('スキャン')).toBeInTheDocument()
    })

    it('t("nav.history") が呼ばれ「履歴」と表示される', () => {
      renderWithI18n(<BottomNav />)
      expect(screen.getByText('履歴')).toBeInTheDocument()
    })

    it('t("nav.settings") が呼ばれ「設定」と表示される', () => {
      renderWithI18n(<BottomNav />)
      expect(screen.getByText('設定')).toBeInTheDocument()
    })
  })

  describe('各タブのリンク先', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/scan')
    })

    it('スキャンタブのリンク先が /scan である', () => {
      renderWithI18n(<BottomNav />)
      const scanLink = screen.getByRole('link', { name: /スキャン/ })
      expect(scanLink).toHaveAttribute('href', '/scan')
    })

    it('履歴タブのリンク先が /history である', () => {
      renderWithI18n(<BottomNav />)
      const historyLink = screen.getByRole('link', { name: /履歴/ })
      expect(historyLink).toHaveAttribute('href', '/history')
    })

    it('地図タブのリンク先が /map である', () => {
      renderWithI18n(<BottomNav />)
      const mapLink = screen.getByRole('link', { name: /地図/ })
      expect(mapLink).toHaveAttribute('href', '/map')
    })

    it('設定タブのリンク先が /settings である', () => {
      renderWithI18n(<BottomNav />)
      const settingsLink = screen.getByRole('link', { name: /設定/ })
      expect(settingsLink).toHaveAttribute('href', '/settings')
    })
  })
})
