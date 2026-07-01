import { deriveRakutenConfidence } from './rakuten-confidence.util'

describe('deriveRakutenConfidence', () => {
  it('contains がある場合 high を返す', () => {
    expect(deriveRakutenConfidence({ contains: ['乳'], partial: [], components: [] })).toBe('high')
  })

  it('partial のみある場合 high を返す', () => {
    expect(deriveRakutenConfidence({ contains: [], partial: ['小麦'], components: [] })).toBe('high')
  })

  it('components のみある場合 high を返す', () => {
    expect(deriveRakutenConfidence({ contains: [], partial: [], components: ['バター'] })).toBe('high')
  })

  it('全て空の場合 low を返す', () => {
    expect(deriveRakutenConfidence({ contains: [], partial: [], components: [] })).toBe('low')
  })
})
