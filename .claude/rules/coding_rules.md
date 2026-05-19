# コード規約

## 言語・フレームワーク

- フロントエンド: TypeScript + Next.js (App Router) + React
- バックエンド: TypeScript + NestJS
- DB ORM: Prisma（または TypeORM。プロジェクト初期に統一）

## 命名規約

### ファイル名

| 種別 | 規約 | 例 |
|---|---|---|
| NestJS Controller | `*.controller.ts` | `scan.controller.ts` |
| NestJS Service | `*.service.ts` | `scan.service.ts` |
| NestJS Repository | `*.repository.ts` | `product.repository.ts` |
| NestJS Module | `*.module.ts` | `scan.module.ts` |
| React コンポーネント | PascalCase `.tsx` | `ResultCard.tsx` |
| React Hook | `use*.ts` | `useCamera.ts` |
| 型定義 | `*.types.ts` | `scan.types.ts` |
| 定数 | `*.constants.ts` | `allergen.constants.ts` |

### 変数・関数

```typescript
// ✅ camelCase
const scanState = 'idle'
const buildGeminiPrompt = () => {}

// ✅ PascalCase（クラス・型・インターフェース・コンポーネント）
class ScanService {}
type ScanState = 'idle' | 'detecting' | 'processing' | 'result' | 'error'
interface AllergenComponent { ... }

// ✅ SCREAMING_SNAKE_CASE（定数）
const CACHE_TTL_CLIENT_MS = 2 * 60 * 60 * 1000
const CACHE_TTL_MEMORY_SEC = 60
const SCAN_COUNT_THRESHOLDS = { HIGH: 21, MEDIUM: 6 } as const

// ❌ マジックナンバー直書き禁止
const ttl = 7200000    // ❌
const ttl = CACHE_TTL_CLIENT_MS  // ✅
```

### 定数の配置

意図を持つリテラル値は必ず名前付き定数として定義し、`*.constants.ts` に置く。

```typescript
// ✅
export const EXPIRES_AT_DAYS = {
  LOW_SCAN_COUNT: 30,    // scan_count 1〜5
  MID_SCAN_COUNT: 90,    // scan_count 6〜20
  HIGH_SCAN_COUNT: 180,  // scan_count 21〜
} as const

export const SCAN_COUNT_THRESHOLD = {
  MID: 6,
  HIGH: 21,
} as const
```

## 型安全

```typescript
// ❌ 型エラー抑制禁止
const result = data as any
// @ts-ignore
const x = foo.bar

// ✅ 型を正しく定義する
type JudgmentResult = '含む' | '一部含む' | 'なし' | '判定不能'
type Confidence = 'high' | 'medium' | 'low'
type AllergenCategory = 'mandatory' | 'recommended'
type ComponentType = 'direct' | 'derivative' | 'processed' | 'additive' | 'exclude'
```

## エラーハンドリング

```typescript
// ✅ NestJS での例外
throw new BadRequestException('必須フィールドが不足しています')
throw new NotFoundException('商品が見つかりません')
throw new InternalServerErrorException('OCR処理に失敗しました')

// ✅ フロントエンドでのエラー状態
// ScanState の 'error' に遷移させる（ユーザーに通知）
// api_error → idle（ユーザー操作が必要なため自動リトライしない）

// ❌ エラーを黙って握りつぶさない
try { ... } catch (e) { /* 何もしない */ }  // ❌
```

## コメント規約

- WHY が自明でない場合のみコメントを書く
- 型・関数名の翻訳コメント禁止（`// ユーザーIDを取得する` 等）
- `// ⚠️ 安全設計` など、非自明な制約には必ずコメントを付ける

```typescript
// ❌ 翻訳コメント禁止
// アレルゲンリストを取得する
const getAllergens = async () => {}

// ✅ WHY が非自明な場合のみ書く
// exclude 型を含めると Gemini が誤検出するため、必ずフィルタリングする
const detectionList = components.filter(c => c.component_type !== 'exclude')
```

## ロギング

```typescript
// ✅ NestJS Logger を使う
private readonly logger = new Logger(ScanService.name)
this.logger.log('OCR処理開始', { s3Key })
this.logger.error('Gemini API エラー', error.message)

// ❌ console.log 禁止（本番ログに混入する）
console.log('debug', data)
```

## API レスポンス形式

```typescript
// ✅ 判定結果は必ず定義済み型を使う
type RiskLevel = 'high' | 'medium' | 'low' | 'ignore'
type DetectionType = 'contains' | 'partial' | 'may_contain'
type HighlightJudgment = 'ng' | 'partial' | 'may_contain'

type AllergenResult = {
  allergen: string
  judgment: JudgmentResult
  detection_type: DetectionType
  detected: string[]
  risk_level: RiskLevel
  reason: string
}

type HighlightItem = {
  text: string
  judgment: HighlightJudgment
  // 'ng' → 🔴, 'partial' → 🟡, 'may_contain' → 🟠
}

type OcrResponse = {
  raw_text: string
  confidence: Confidence
  results: AllergenResult[]         // アレルゲンごとの判定（複数）
  highlights: HighlightItem[]       // UI ハイライト用テキスト一覧
  incomplete: boolean
  price: number | null
  price_with_tax: number | null
  price_confidence: 'high' | 'low' | null
}
```

## 価格表示ルール（UI コンポーネント共通）

`price_confidence` が `high` の場合のみ価格を表示する。`low` または `null` は非表示。空欄・ゼロ表示しない。

## i18n（多言語対応）

UIテキストをコンポーネントに直書きしない。すべて `t('キー名')` で管理する。

```typescript
// ❌ ハードコード禁止（後から多言語化するとき全コンポーネント修正が必要になる）
<p>購入前にラベルの実物も必ずご確認ください</p>

// ✅ i18nキー
<p>{t('scan.result.caution')}</p>
```

ロケールファイル構成: `frontend/public/locales/{ja,en}/{common,scan,history,settings}.json`  
MVP では `ja`（日本語）をデフォルト、`en`（英語）を設定画面から切り替え可能にする。
