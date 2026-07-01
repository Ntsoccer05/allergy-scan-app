/** 地球の平均半径 (km)。ハバーサイン距離計算に使用。 */
const EARTH_RADIUS_KM = 6371

/** 2点間のハバーサイン距離 (km) を返す。 */
export const haversineDistanceKm = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const toRad = (deg: number): number => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

type Locatable = {
  location?: { lat?: number; lng?: number; [key: string]: unknown } | null
}

/**
 * 現在地から近い順にソートした新しい配列を返す（履歴の「近い順」表示用）。
 * 座標を持たないアイテムは元の順序を保ったまま末尾に置く。
 */
export const sortByDistance = <T extends Locatable>(
  items: T[],
  origin: { lat: number; lng: number },
): T[] => {
  const distance = (item: T): number => {
    const lat = item.location?.lat
    const lng = item.location?.lng
    if (lat === undefined || lng === undefined) return Number.POSITIVE_INFINITY
    return haversineDistanceKm(origin.lat, origin.lng, lat, lng)
  }
  // sort は安定ソートのため、座標なし同士は元の順序を維持する
  return [...items].sort((a, b) => distance(a) - distance(b))
}
