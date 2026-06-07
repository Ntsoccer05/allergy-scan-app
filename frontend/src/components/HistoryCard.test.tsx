import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { HistoryCard } from './HistoryCard'
import type { HistoryItem } from '@/app/history/history.types'
import historyJa from '../../public/locales/ja/history.json'

/** テスト用の NextIntlClientProvider ラッパー（日本語ロケール）。 */
const renderWithI18n = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={{ history: historyJa }}>
      {ui}
    </NextIntlClientProvider>,
  )

const makeItem = (overrides: Partial<HistoryItem> = {}): HistoryItem => ({
  id: 'item-1',
  userId: 'user-1',
  productId: null,
  productName: null,
  judgment: 'ok',
  detected: [],
  thumbnailUrl: null,
  ocrImageUrl: null,
  isPublic: false,
  memo: null,
  scannedAt: '2026-05-18T12:00:00.000Z',
  ...overrides,
})

describe('HistoryCard', () => {
  describe('judgment による絵文字表示', () => {
    it('judgment: ng のとき 🔴 が表示される', () => {
      renderWithI18n(<HistoryCard item={makeItem({ judgment: 'ng' })} />)
      expect(screen.getByText('🔴')).toBeInTheDocument()
    })

    it('judgment: partial のとき 🟡 が表示される', () => {
      renderWithI18n(<HistoryCard item={makeItem({ judgment: 'partial' })} />)
      expect(screen.getByText('🟡')).toBeInTheDocument()
    })

    it('judgment: ok のとき ✅ が表示される', () => {
      renderWithI18n(<HistoryCard item={makeItem({ judgment: 'ok' })} />)
      expect(screen.getByText('✅')).toBeInTheDocument()
    })
  })

  describe('product_name 表示', () => {
    it('productName がある場合にテキストが表示される', () => {
      renderWithI18n(<HistoryCard item={makeItem({ productName: 'テスト商品' })} />)
      expect(screen.getByText('テスト商品')).toBeInTheDocument()
    })

    it('productName が null の場合は表示されない', () => {
      renderWithI18n(<HistoryCard item={makeItem({ productName: null })} />)
      expect(screen.queryByText('テスト商品')).toBeNull()
    })
  })

  describe('detected 表示', () => {
    it('detected に要素がある場合に検出アレルギー名が表示される', () => {
      renderWithI18n(<HistoryCard item={makeItem({ detected: ['卵', '乳'] })} />)
      expect(screen.getByText('卵')).toBeInTheDocument()
      expect(screen.getByText('乳')).toBeInTheDocument()
    })

    it('detected が空配列の場合はアレルギー名が表示されない', () => {
      renderWithI18n(<HistoryCard item={makeItem({ detected: [] })} />)
      expect(screen.queryByText('卵')).toBeNull()
    })
  })

  describe('店舗名表示', () => {
    it('location.store_name が truthy な場合に店舗名が DOM に表示される', () => {
      renderWithI18n(
        <HistoryCard
          item={makeItem({
            location: { store_name: 'セブン渋谷店', lat: 35.6, lng: 139.7 },
          })}
        />,
      )
      expect(screen.getByText(/セブン渋谷店/)).toBeInTheDocument()
    })

    it('location: null の場合に店舗名エリアが DOM に存在しない', () => {
      renderWithI18n(<HistoryCard item={makeItem({ location: null })} />)
      expect(screen.queryByText(/セブン渋谷店/)).toBeNull()
      // 📍 を含む要素が存在しないことを確認
      expect(screen.queryByText(/📍/)).toBeNull()
    })

    it('location: undefined（フィールド未設定）の場合に店舗名エリアが DOM に存在しない', () => {
      renderWithI18n(<HistoryCard item={makeItem({ location: undefined })} />)
      expect(screen.queryByText(/📍/)).toBeNull()
    })
  })
})
