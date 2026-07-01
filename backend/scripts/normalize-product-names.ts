/**
 * all-products-modified.json の product_name を Gemini API で正規化するスクリプト。
 *
 * 使い方:
 *   pnpm --filter backend exec ts-node --project tsconfig.json scripts/normalize-product-names.ts
 *
 * 無料枠内で動作:
 *   - Gemini Flash: 15 RPM / 1,500 RPD
 *   - 100件バッチ × 約540リクエスト = 1日以内に完了
 *   - 進捗ファイルで中断・再開可能
 */

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
/** backend/.env を読んで未設定の環境変数のみ反映する（dotenv 非依存） */
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env')
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, '')
    }
  }
}
loadEnv()

const INPUT_FILE = path.resolve(__dirname, 'output/all-products-modified.json')
const PROGRESS_FILE = path.resolve(__dirname, 'output/normalize-progress.json')

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

const BATCH_SIZE = 100
// 無料枠 15 RPM → 1リクエストあたり 4.5秒待機
const RATE_LIMIT_MS = 4500

// ─── 型 ──────────────────────────────────────────────────────────────────────

interface ProductEntry {
  jan_code: string
  product_name: string
  manufacturer?: string
  allergens: { contains: string[]; partial: string[]; components: string[] }
  raw_text: string
  thumbnail_url?: string
  source_url?: string
}

interface BatchItem {
  i: number   // バッチ内インデックス
  n: string   // 元の商品名
}

// ─── Gemini 呼び出し ──────────────────────────────────────────────────────────

function httpsPost(url: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`))
        } else {
          resolve(data)
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function normalizeBatch(items: BatchItem[]): Promise<string[]> {
  const inputJson = JSON.stringify(items, null, 0)

  const prompt = `以下のJSON配列は日本の食品ECサイト（楽天等）から収集した商品名です。
各商品名を「実際の商品パッケージに記載されているような自然な日本語の商品名」に整形してください。

【除去するもの】
- 【】内の販促文言（例：【12袋】【送料無料】【企画品】）
- SEO・販促キーワード（大容量、パーティー、イベント、まとめ買い、食べ比べ、詰め合わせ、送料無料、最強配送、スナック、芋 など）
- ブランド名の重複（カルビー が2回出てくる場合は1回に）
- 同じフレーバー名の重複

【残すもの】
- ブランド名（カルビー、湖池屋 など）
- 商品名（ポテトチップス、堅あげポテト など）
- フレーバー（うすしお、コンソメパンチ など）
- 内容量・サイズ（65g、12袋入り など）—商品名の一部として定着している場合のみ

【出力形式】
JSON配列のみ。説明・コードブロック不要。

入力:
${inputJson}

出力（同じiを保持）:
[{"i":0,"n":"正規化後の商品名"}, ...]`

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
  })

  const raw = await httpsPost(GEMINI_URL, body)
  const result = JSON.parse(raw)
  const text: string = result.candidates[0].content.parts[0].text

  // JSON部分を抽出
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error(`No JSON array in response: ${text.slice(0, 200)}`)

  const parsed: BatchItem[] = JSON.parse(match[0])
  const nameMap = new Map(parsed.map(x => [x.i, x.n]))
  return items.map(x => nameMap.get(x.i) ?? x.n)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── メイン ──────────────────────────────────────────────────────────────────

async function main() {
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY が設定されていません（backend/.env を確認してください）')
    process.exit(1)
  }

  console.log('Loading data...')
  const data: ProductEntry[] = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'))
  console.log(`Total: ${data.length} products`)

  // 進捗ファイル（中断・再開対応）
  const progress: Record<string, string[]> = fs.existsSync(PROGRESS_FILE)
    ? JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'))
    : {}

  const doneCount = Object.keys(progress).length
  if (doneCount > 0) {
    console.log(`Resuming from batch ${doneCount} (${doneCount * BATCH_SIZE} / ${data.length} done)`)
  }

  const totalBatches = Math.ceil(data.length / BATCH_SIZE)
  let savedCount = 0

  for (let batchStart = 0; batchStart < data.length; batchStart += BATCH_SIZE) {
    const batchKey = String(batchStart)
    const batchEnd = Math.min(batchStart + BATCH_SIZE, data.length)
    const batchNum = batchStart / BATCH_SIZE + 1

    // 保存済みのバッチは適用してスキップ
    if (progress[batchKey]) {
      const names = progress[batchKey]
      for (let j = 0; j < names.length; j++) {
        data[batchStart + j].product_name = names[j]!
      }
      savedCount += names.length
      continue
    }

    const items: BatchItem[] = []
    for (let j = 0; j < batchEnd - batchStart; j++) {
      items.push({ i: j, n: data[batchStart + j].product_name })
    }

    try {
      const normalized = await normalizeBatch(items)

      for (let j = 0; j < normalized.length; j++) {
        data[batchStart + j].product_name = normalized[j]!
      }

      progress[batchKey] = normalized
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 0), 'utf-8')
      savedCount += normalized.length

      if (batchNum % 10 === 0 || batchNum === totalBatches) {
        console.log(`[${batchNum}/${totalBatches}] ${batchEnd}/${data.length} done — saving checkpoint...`)
        fs.writeFileSync(INPUT_FILE, JSON.stringify(data, null, 2), 'utf-8')
      } else {
        process.stdout.write(`[${batchNum}/${totalBatches}] `)
      }

      // レートリミット (15 RPM 無料枠)
      if (batchNum < totalBatches) await sleep(RATE_LIMIT_MS)

    } catch (err) {
      console.error(`\nBatch ${batchNum} failed: ${err}`)
      console.error('Saving progress so far and retrying in 30s...')
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 0), 'utf-8')
      await sleep(30000)
      batchStart -= BATCH_SIZE // 同バッチを再試行
    }
  }

  // 最終保存
  console.log('\nFinal save...')
  fs.writeFileSync(INPUT_FILE, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`Done! ${savedCount} product names normalized.`)
  console.log(`Output: ${INPUT_FILE}`)

  // 進捗ファイル削除（完了）
  if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
