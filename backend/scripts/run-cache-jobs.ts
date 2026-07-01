/**
 * pending な cache_jobs を全件処理するスクリプト。
 * 実行: pnpm --filter backend exec ts-node --project tsconfig.json scripts/run-cache-jobs.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const YAHOO_LOCAL_SEARCH_URL = 'https://map.yahooapis.jp/search/local/V1/localSearch'
const STORE_CACHE_MAX_RESULTS = 100
const YAHOO_REQUEST_INTERVAL_MS = 300
const YAHOO_MAX_PAGES_PER_GENRE = 30
const YAHOO_LOCAL_SEARCH_GENRES = [
  '0205', '0202', '0402001', '0204001', '0204002', '0204004',
  '0206002', '0207008', '0210', '0114001', '0117001', '0118001', '0118002', '0307003',
] as const

type YahooStoreRaw = { uid: string; name: string; lat: number; lng: number; address?: string; genre?: string }

function toGridKey(lat: number, lng: number): string {
  return `${Math.floor(lat * 100)}_${Math.floor(lng * 100)}`
}
function addDays(date: Date, days: number): Date {
  const r = new Date(date); r.setDate(r.getDate() + days); return r
}
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)) }

async function fetchPage(appId: string, lat: number, lng: number, radiusKm: number, genre: string, start: number): Promise<YahooStoreRaw[]> {
  const params = new URLSearchParams({
    appid: appId, lat: String(lat), lon: String(lng), dist: String(radiusKm),
    gc: genre, results: String(STORE_CACHE_MAX_RESULTS), start: String(start), output: 'json',
  })
  const res = await fetch(`${YAHOO_LOCAL_SEARCH_URL}?${params}`, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) { console.warn(`Yahoo HTTP ${res.status} genre=${genre} start=${start}`); return [] }
  const data = await res.json() as { Feature?: Array<{ Id: string; Name: string; Geometry: { Coordinates: string }; Property: { Address?: string; Genre?: Array<{ Name: string }> } }> }
  return (data.Feature ?? []).map(f => {
    const [lngStr, latStr] = f.Geometry.Coordinates.split(',')
    return { uid: f.Id, name: f.Name, lat: parseFloat(latStr ?? '0'), lng: parseFloat(lngStr ?? '0'), address: f.Property.Address, genre: f.Property.Genre?.[0]?.Name }
  })
}

async function fetchAllStores(appId: string, lat: number, lng: number, radiusKm: number): Promise<YahooStoreRaw[]> {
  const stores = new Map<string, YahooStoreRaw>()
  for (const genre of YAHOO_LOCAL_SEARCH_GENRES) {
    let start = 1, totalFetched = 0
    for (let page = 0; page < YAHOO_MAX_PAGES_PER_GENRE; page++) {
      const batch = await fetchPage(appId, lat, lng, radiusKm, genre, start)
      if (batch.length === 0) break
      for (const s of batch) stores.set(s.uid, s)
      totalFetched += batch.length
      start += batch.length
      if (batch.length < STORE_CACHE_MAX_RESULTS) break
      await sleep(YAHOO_REQUEST_INTERVAL_MS)
    }
    console.log(`  genre=${genre} fetched=${totalFetched}`)
    await sleep(YAHOO_REQUEST_INTERVAL_MS)
  }
  return Array.from(stores.values())
}

async function main() {
  const appId = process.env.YAHOO_APP_ID
  if (!appId) throw new Error('YAHOO_APP_ID が設定されていません')

  const prisma = new PrismaClient()

  try {
    // 同一座標の重複ジョブを除いて1件ずつ処理
    const jobs = await prisma.cacheJob.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' } })
    console.log(`pending jobs: ${jobs.length}`)

    // 同一 gridKey のジョブは1回だけ処理
    const processed = new Set<string>()

    for (const job of jobs) {
      const gridKey = toGridKey(job.lat, job.lng)

      if (processed.has(gridKey)) {
        // 重複ジョブは skip して done にする
        await prisma.cacheJob.update({ where: { id: job.id }, data: { status: 'done', processedAt: new Date() } })
        console.log(`[skip] job=${job.id} gridKey=${gridKey} (already processed)`)
        continue
      }

      console.log(`\n[start] job=${job.id} gridKey=${gridKey} lat=${job.lat} lng=${job.lng}`)
      await prisma.cacheJob.update({ where: { id: job.id }, data: { status: 'processing' } })

      try {
        const batchStartedAt = new Date()
        const raw = await fetchAllStores(appId, job.lat, job.lng, 20)
        console.log(`  total stores fetched: ${raw.length}`)

        const now = new Date()
        const expiresAt = addDays(now, 90)

        // UPSERT
        for (const s of raw) {
          await prisma.storeCache.upsert({
            where: { uid: s.uid },
            create: { uid: s.uid, name: s.name, address: s.address, genre: s.genre, lat: s.lat, lng: s.lng, source: 'batch', expiresAt },
            update: { name: s.name, address: s.address, genre: s.genre, lat: s.lat, lng: s.lng, source: 'batch', expiresAt },
          })
        }

        // 古いバッチデータを削除
        await prisma.storeCache.deleteMany({ where: { source: 'batch', updatedAt: { lt: batchStartedAt } } })

        // エリアカバー記録
        await prisma.storeCacheArea.upsert({
          where: { gridKey },
          create: { gridKey, radiusKm: 20, tier: 'regional', expiresAt },
          update: { radiusKm: 20, tier: 'regional', fetchedAt: now, expiresAt },
        })

        await prisma.cacheJob.update({ where: { id: job.id }, data: { status: 'done', processedAt: new Date() } })
        processed.add(gridKey)
        console.log(`[done] job=${job.id}`)

        // マルハチが取得できたか確認
        const maruhachi = raw.filter(s => s.name.includes('マルハチ'))
        if (maruhachi.length > 0) {
          const dist = maruhachi.map(s => haversineKm(job.lat, job.lng, s.lat, s.lng).toFixed(2))
          console.log(`  ✅ マルハチ ${maruhachi.length}件取得: ${maruhachi.map((s, i) => `${s.name}(${dist[i]}km)`).join(', ')}`)
        } else {
          console.log('  ⚠️ マルハチは取得されませんでした')
        }
      } catch (err) {
        await prisma.cacheJob.update({ where: { id: job.id }, data: { status: 'failed', processedAt: new Date() } })
        console.error(`[fail] job=${job.id}`, err)
      }
    }

    console.log('\n✅ 全ジョブ処理完了')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
