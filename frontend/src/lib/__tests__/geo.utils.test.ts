import { haversineDistanceKm, sortByDistance } from '../geo.utils'

describe('haversineDistanceKm', () => {
  it('同一地点は 0 を返す', () => {
    expect(haversineDistanceKm(35.0, 139.0, 35.0, 139.0)).toBe(0)
  })

  it('東京駅〜新宿駅 はおよそ 6.5km（±1km）', () => {
    // 東京駅: 35.6812, 139.7671 / 新宿駅: 35.6896, 139.7006
    const d = haversineDistanceKm(35.6812, 139.7671, 35.6896, 139.7006)
    expect(d).toBeGreaterThan(5.5)
    expect(d).toBeLessThan(7.5)
  })
})

describe('sortByDistance', () => {
  const origin = { lat: 35.0, lng: 139.0 }
  const near = { id: 'near', location: { store_name: 'A', lat: 35.001, lng: 139.001 } }
  const far = { id: 'far', location: { store_name: 'B', lat: 36.0, lng: 140.0 } }
  const noLocation = { id: 'none', location: null }
  const noLatLng = { id: 'nolatlng', location: { store_name: 'C' } }

  it('現在地から近い順に並び、座標のないアイテムは末尾になる', () => {
    const sorted = sortByDistance([far, noLocation, near, noLatLng], origin)
    expect(sorted.map((i) => i.id)).toEqual(['near', 'far', 'none', 'nolatlng'])
  })

  it('元配列を破壊しない', () => {
    const items = [far, near]
    sortByDistance(items, origin)
    expect(items.map((i) => i.id)).toEqual(['far', 'near'])
  })
})
