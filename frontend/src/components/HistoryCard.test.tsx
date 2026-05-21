import { render, screen } from '@testing-library/react'
import { HistoryCard } from './HistoryCard'
import type { HistoryItem } from '@/app/history/history.types'

const makeItem = (overrides: Partial<HistoryItem> = {}): HistoryItem => ({
  id: 'item-1',
  userId: 'user-1',
  productId: null,
  productName: null,
  judgment: 'ok',
  detected: [],
  thumbnailUrl: null,
  scannedAt: '2026-05-18T12:00:00.000Z',
  ...overrides,
})

describe('HistoryCard', () => {
  describe('judgment による絵文字表示', () => {
    it('judgment: ng のとき 🔴 が表示される', () => {
      render(<HistoryCard item={makeItem({ judgment: 'ng' })} />)
      expect(screen.getByText('🔴')).toBeInTheDocument()
    })

    it('judgment: partial のとき 🟡 が表示される', () => {
      render(<HistoryCard item={makeItem({ judgment: 'partial' })} />)
      expect(screen.getByText('🟡')).toBeInTheDocument()
    })

    it('judgment: ok のとき ✅ が表示される', () => {
      render(<HistoryCard item={makeItem({ judgment: 'ok' })} />)
      expect(screen.getByText('✅')).toBeInTheDocument()
    })
  })

  describe('product_name 表示', () => {
    it('productName がある場合にテキストが表示される', () => {
      render(<HistoryCard item={makeItem({ productName: 'テスト商品' })} />)
      expect(screen.getByText('テスト商品')).toBeInTheDocument()
    })

    it('productName が null の場合は表示されない', () => {
      render(<HistoryCard item={makeItem({ productName: null })} />)
      expect(screen.queryByText('テスト商品')).toBeNull()
    })
  })

  describe('detected 表示', () => {
    it('detected に要素がある場合に検出アレルギー名が表示される', () => {
      render(<HistoryCard item={makeItem({ detected: ['卵', '乳'] })} />)
      expect(screen.getByText('卵')).toBeInTheDocument()
      expect(screen.getByText('乳')).toBeInTheDocument()
    })

    it('detected が空配列の場合はアレルギー名が表示されない', () => {
      render(<HistoryCard item={makeItem({ detected: [] })} />)
      expect(screen.queryByText('卵')).toBeNull()
    })
  })
})
