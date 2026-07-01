import { buildAffiliateUrl } from './rakuten-affiliate.util'

describe('buildAffiliateUrl', () => {
  const validUrl = 'https://item.rakuten.co.jp/shop/item-1234/'

  it('楽天商品URLをアフィリエイトURLに変換する', () => {
    const result = buildAffiliateUrl(validUrl, 'abc123')
    expect(result).toContain('hb.afl.rakuten.co.jp')
    expect(result).toContain(encodeURIComponent(validUrl))
  })

  it('空のAFFILIATE_IDでも動作する', () => {
    const result = buildAffiliateUrl(validUrl, '')
    expect(result).toContain('hb.afl.rakuten.co.jp')
  })

  it('item.rakuten.co.jp 以外のドメインは null を返す', () => {
    expect(buildAffiliateUrl('https://evil.com/item', 'abc123')).toBeNull()
    expect(buildAffiliateUrl('https://www.rakuten.co.jp/shop/', 'abc123')).toBeNull()
  })

  it('無効なURLは null を返す', () => {
    expect(buildAffiliateUrl('not-a-url', 'abc123')).toBeNull()
  })
})
