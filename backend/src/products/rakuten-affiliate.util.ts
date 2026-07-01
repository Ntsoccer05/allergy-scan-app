const RAKUTEN_ITEM_HOST = 'item.rakuten.co.jp'

export const buildAffiliateUrl = (
  itemUrl: string,
  affiliateId: string,
): string | null => {
  try {
    const parsed = new URL(itemUrl)
    if (parsed.hostname !== RAKUTEN_ITEM_HOST) return null
    return (
      `https://hb.afl.rakuten.co.jp/hgc/${affiliateId}/allergy_scan/` +
      `?pc=${encodeURIComponent(itemUrl)}&m=${encodeURIComponent(itemUrl)}`
    )
  } catch {
    return null
  }
}
