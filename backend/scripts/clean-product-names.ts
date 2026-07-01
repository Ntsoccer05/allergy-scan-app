/**
 * all-products-modified.json の product_name から不要な文字列を正規表現で除去するスクリプト。
 * Gemini APIは使用しない（高速・無料）。
 *
 * 除去対象:
 *   - 「送料無料」「最強配送」等の配送キーワード
 *   - 「3本」「10本入り」等の本数表記
 *   - 「65g」「1.35kg」「500ml」等の重量・容量表記
 *   - 個数・袋数・箱数等の数量表記
 *   - 賞味期限ブロック・JANコード括弧
 *   - 前後のゴミ（余分なスペース・記号）
 *
 * 使い方:
 *   pnpm --filter backend exec ts-node --project tsconfig.json scripts/clean-product-names.ts
 *
 * 出力:
 *   backend/scripts/output/all-products-cleaned.json（コンパクトJSON・軽量）
 */

import * as fs from 'fs'
import * as path from 'path'

const INPUT_FILE  = path.resolve(__dirname, 'output/all-products-modified.json')
const OUTPUT_FILE = path.resolve(__dirname, 'output/all-products-cleaned.json')

// ─── 除去パターン定義 ────────────────────────────────────────────────────────

/**
 * product_name から除去する文字列パターン一覧。
 * 上から順に適用する。
 */
const REMOVE_PATTERNS: RegExp[] = [
  // ① 賞味期限ブロック（先に処理）
  //    例: 『賞味期限：27.05.31』
  /[『【]賞味期限[：:][^』】]+[』】]\s*/g,

  // ② JANコード括弧
  //    例: (4901005521179c) / （4901330524210）
  /[（(]\s*\d{8,13}[cC]?\s*[）)]/g,

  // ③ 配送・販促キーワード
  /\s*送料無料\s*/g,
  /\s*最強配送\s*/g,

  // ④ 〇g / 〇kg / 〇ml 等の重量・容量単位
  //    全角単位を先に処理（ｇ/ｋｇ/ｍｌ）
  /\d+(?:\.\d+)?(?:ｋｇ|ｍｌ|ｇ)/g,
  /\d+(?:\.\d+)?(?:kg|KG|Kg|mg)/g,
  /\d+(?:\.\d+)?(?:mL|ml|ML)/g,
  /\d+(?:\.\d+)?ℓ/g,
  // g/G の後に英字が続かないケースのみ（BOX等を除外）
  /\d+(?:\.\d+)?[gG](?=[^a-zA-Z]|$)/g,

  // ⑤ 〇本 系
  /\d+本入り?/g,
  /\d+本セット/g,
  /\d+本/g,

  // ⑥ ×〇 系（セット数・入数など）—スペースありパターンも対応
  //    例: ×12個、×3袋、×2個セット、×1BOX、×12入、×12セット、× 90点
  /×\s*\d+個セット/g,
  /×\s*\d+袋セット/g,
  /×\s*\d+本セット/g,
  /×\s*\d+[Bb][Oo][Xx]/g,
  /×\s*\d+個入り?/g,
  /×\s*\d+袋入り?/g,
  /×\s*\d+コ入り?/g,
  /×\s*\d+ケース/g,
  /×\s*\d+入り?/g,
  /×\s*\d+セット/g,
  /×\s*\d+個/g,
  /×\s*\d+袋/g,
  /×\s*\d+箱/g,
  /×\s*\d+缶/g,
  /×\s*\d+点/g,
  /×\s*\d+/g,       // 残った ×数字 を除去（スペースあり含む）

  // ⑦ *〇 系（楽天表記: `600g*10本セット` → *10残りを除去）
  /\*\d+[^)\s]*/g,

  // ⑧ 袋・個・箱 等の数量表記
  /\d+袋入り?/g,
  /\d+袋セット/g,
  /\d+袋/g,
  /\d+個入り?/g,
  /\d+個セット/g,
  /\d+個/g,
  /\d+ケース/g,
  /\d+箱/g,
  /\d+パック/g,
  /\d+コ入り/g,
  /\d+コ/g,
  /\d+入り?/g,      // 入 / 入り 両方対応（例: 56入）
  /\d+缶/g,
  /\d+点/g,

  // ⑨ セット表記（括弧外）
  //    例: 3種×、24入 など
  /\d+種×/g,
  /\d+入(?!\w)/g,   // 残った「56入」等の単独パターン

  // ⑩ 括弧内が空・記号だけになったものを削除（複数回適用）
  //    例: ( * )、( )、（ ）
  /[（(]\s*[）)]/g,
  /[（(][^（(）)a-zA-Z぀-ヿ一-鿿]{0,15}[）)]/g,

  // ⑪ 末尾・先頭に残った孤立記号
  /\s*[×*｜]\s*$/g,
  /^\s*[×*｜]\s*/g,
]

// ─── クリーニング関数 ─────────────────────────────────────────────────────────

function cleanProductName(name: string): string {
  let result = name

  for (const pattern of REMOVE_PATTERNS) {
    result = result.replace(pattern, ' ')
  }

  // 連続スペース・全角スペースを半角1つに統一
  result = result.replace(/[\s　]+/g, ' ').trim()

  // 末尾の不要な句読点・括弧・記号を除去
  result = result.replace(/[\s,、。・×*｜/]+$/g, '').trim()
  // 先頭の不要な記号を除去
  result = result.replace(/^[\s,、。・×*｜/]+/g, '').trim()

  return result || name  // 空になったら元の名前を返す（安全策）
}

// ─── メイン ──────────────────────────────────────────────────────────────────

interface ProductEntry {
  jan_code: string
  product_name: string
  manufacturer?: string
  allergens: { contains: string[]; partial: string[]; components: string[] }
  raw_text: string
  thumbnail_url?: string
  source_url?: string
}

function main() {
  console.log('Loading data...')
  const data: ProductEntry[] = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'))
  console.log(`Total: ${data.length} products`)

  let changedCount = 0

  for (const entry of data) {
    const cleaned = cleanProductName(entry.product_name)
    if (cleaned !== entry.product_name) {
      entry.product_name = cleaned
      changedCount++
    }
  }

  console.log(`Changed: ${changedCount} / ${data.length} product names`)
  console.log(`Writing compact JSON to ${OUTPUT_FILE} ...`)

  // コンパクトJSON（インデントなし）で出力 → ファイルサイズ削減
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data), 'utf-8')

  const sizeKB = Math.round(fs.statSync(OUTPUT_FILE).size / 1024)
  console.log(`Done! Output size: ${sizeKB.toLocaleString()} KB`)
}

main()
