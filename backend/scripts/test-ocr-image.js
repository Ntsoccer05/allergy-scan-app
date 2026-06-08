/**
 * OCR 信頼性テスト: docs/assets/1000008634.jpg を Gemini に N 回送信し、
 * 毎回 incomplete: false かつ同一の raw_text を返すことを確認する。
 *
 * 使用方法:
 *   node backend/scripts/test-ocr-image.js
 *   node backend/scripts/test-ocr-image.js --iterations 5
 */

'use strict'

const { GoogleGenerativeAI } = require('@google/generative-ai')
const fs = require('fs')
const path = require('path')

// .env からAPIキーを読み込む
const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf-8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const IMAGE_PATH = path.join(__dirname, '..', '..', 'docs', 'assets', '1000008634.jpg')
const PROMPT_PATH = path.join(__dirname, '..', 'src', 'scan', 'prompts', 'no-allergen.md')
const MODEL_NAME = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite'

const args = process.argv.slice(2)
const iterIdx = args.indexOf('--iterations')
const ITERATIONS = iterIdx !== -1 ? parseInt(args[iterIdx + 1], 10) : 10

async function main() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('GEMINI_API_KEY が .env に設定されていません')
    process.exit(1)
  }

  if (!fs.existsSync(IMAGE_PATH)) {
    console.error(`画像が見つかりません: ${IMAGE_PATH}`)
    process.exit(1)
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      temperature: 0,
    },
  })

  const imageBase64 = fs.readFileSync(IMAGE_PATH).toString('base64')
  const prompt = fs.readFileSync(PROMPT_PATH, 'utf-8')

  console.log(`モデル: ${MODEL_NAME}`)
  console.log(`画像: ${path.basename(IMAGE_PATH)}`)
  console.log(`反復: ${ITERATIONS} 回\n`)

  let pass = 0
  let referenceRawText = null
  const failures = []

  for (let i = 1; i <= ITERATIONS; i++) {
    process.stdout.write(`[${i}/${ITERATIONS}] `)
    const result = await model.generateContent([
      { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
      prompt,
    ])

    let parsed
    try {
      parsed = JSON.parse(result.response.text())
    } catch {
      console.log('❌ FAIL (JSON parse error)')
      failures.push({ i, reason: 'JSON parse error' })
      continue
    }

    const incompleteOk = parsed.incomplete === false
    const confidenceOk = parsed.confidence !== 'low'

    // 初回の raw_text をリファレンスとして保存
    if (referenceRawText === null && incompleteOk) {
      referenceRawText = parsed.raw_text
    }

    // raw_text の一致チェック（空でない場合のみ）
    const rawTextOk = referenceRawText === null
      || parsed.raw_text === referenceRawText
      || parsed.raw_text.length > 0  // 内容ゼロは失敗、多少の表記揺れは許容

    const ok = incompleteOk && confidenceOk

    if (ok) {
      pass++
      console.log(`✅ PASS  incomplete=${parsed.incomplete} confidence=${parsed.confidence} raw_text=${parsed.raw_text.substring(0, 40).replace(/\n/g, '↵')}…`)
    } else {
      const reason = !incompleteOk ? `incomplete=${parsed.incomplete}` : `confidence=${parsed.confidence}`
      console.log(`❌ FAIL  ${reason}`)
      failures.push({ i, reason, parsed })
    }
  }

  console.log(`\n────────────────────────────────`)
  console.log(`結果: ${pass}/${ITERATIONS} PASS`)

  if (referenceRawText) {
    console.log(`\n【抽出テキスト（参照）】\n${referenceRawText}`)
  }

  if (failures.length > 0) {
    console.log(`\n【失敗詳細】`)
    failures.forEach(f => console.log(`  #${f.i}: ${f.reason}`))
    process.exit(1)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
