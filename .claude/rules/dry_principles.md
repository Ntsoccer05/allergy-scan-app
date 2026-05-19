# DRY 原則

## 共通モジュールの集約点

新しい実装を追加する前に、以下の集約点に既存の実装がないか必ず確認する。

### バックエンド（NestJS）

| 責務 | 集約場所 |
|---|---|
| Gemini プロンプト生成 | `src/scan/gemini-prompt.builder.ts` |
| アレルゲン成分取得 | `AllergenComponentRepository` |
| キャッシュ期限計算（scan_count 連動） | `src/products/expires-at.util.ts` |
| 商品 ID 生成（JAN / hash） | `src/products/product-id.util.ts` |
| label_hash 生成ロジック | `src/products/label-hash.util.ts` |
| Gemini API クライアント | `src/shared/gemini.client.ts` |
| S3 クライアント | `src/shared/s3.client.ts` |
| Google Places クライアント | `src/shared/places.client.ts` |
| みんなのスキャン判定導出（ng/partial/ok） | `src/products/products.service.ts` の `deriveJudgment` |

### フロントエンド（Next.js）

| 責務 | 集約場所 |
|---|---|
| API クライアント関数 | `src/lib/api/` |
| クライアントキャッシュ（TTL: 2時間） | `src/lib/cache.ts` |
| アレルゲン設定の toggle ロジック | `src/lib/allergen.utils.ts` |
| フレーム品質チェックロジック | `useFrameCheck` Hook |
| バーコード検出ロジック | `useBarcode` Hook |
| カメラ制御ロジック | `useCamera` Hook |

---

## DRY 違反チェックリスト

実装前に以下を Grep で確認する:

### Gemini プロンプト生成
- `buildGeminiPrompt` または `buildPrompt` が他に存在しないか確認
- 成分リストの絞り込み（`component_type !== 'exclude'`）が重複していないか確認

### 判定ロジック
- `judgment === '含む'` の分岐が複数箇所に分散していないか
- `risk_level === 'high'` の判定が複数箇所で独自に行われていないか

### キャッシュ期限計算
- `expires_at` の計算式が複数箇所に書かれていないか
- `scan_count` のしきい値（6, 21）が複数箇所にマジックナンバーで出ていないか

### アレルゲン操作
- `toggleAllergen`（enabled と partialAlert を連動させるロジック）が複数箇所に書かれていないか
- `enabledAllergens` の絞り込み（`v.enabled === true`）が複数箇所に書かれていないか

### 商品 ID 管理
- `jan#` / `hash#` のプレフィックス付与が複数箇所に書かれていないか
- label_hash の生成式が複数箇所に書かれていないか

### みんなのスキャン判定
- `allergens.contains` → `ng`、`allergens.partial × partialAlert` → `partial`、それ以外 → `ok` の判定ロジックが `deriveJudgment` 以外に書かれていないか

---

## パターン：Gemini プロンプト動的生成

```typescript
// ✅ 集約点：src/scan/gemini-prompt.builder.ts
export const buildGeminiPrompt = async (
  enabledAllergens: string[],
  db: AllergenComponentRepository
): Promise<string> => {
  const components = await db.findByAllergens(enabledAllergens)
  const detectionList = components
    .filter(c => c.component_type !== 'exclude')
    .map(c => `・${c.canonical_name}${c.risk_level === 'high' ? '（⚠️risk_level:high）' : ''}`)
    .join('\n')
  const excludeList = components
    .filter(c => c.component_type === 'exclude')
    .map(c => `・${c.canonical_name}（${c.note}）`)
    .join('\n')
  return `検出対象：\n${detectionList}\n\n以下は検出対象外（誤検出に注意）：\n${excludeList}`
}
```

同様のロジックを別の場所に書かない。

---

## パターン：expires_at 計算

```typescript
// ✅ 集約点：src/products/expires-at.util.ts
export const getExpiryDays = (scanCount: number): number => {
  if (scanCount >= SCAN_COUNT_THRESHOLD.HIGH) return EXPIRES_AT_DAYS.HIGH_SCAN_COUNT
  if (scanCount >= SCAN_COUNT_THRESHOLD.MID)  return EXPIRES_AT_DAYS.MID_SCAN_COUNT
  return EXPIRES_AT_DAYS.LOW_SCAN_COUNT
}
```

---

## パターン：allergen toggle ロジック

```typescript
// ✅ 集約点：src/lib/allergen.utils.ts
export const toggleAllergen = (
  allergies: AllergySettings,
  name: string
): AllergySettings => {
  const isEnabling = !allergies[name].enabled
  return {
    ...allergies,
    [name]: { enabled: isEnabling, partialAlert: isEnabling },
  }
}
```

enabled と partialAlert の連動ロジックはここにのみ書く。

---

## パターン：みんなのスキャン判定導出（deriveJudgment）

```typescript
// ✅ 集約点：src/products/products.service.ts
const deriveJudgment = (
  allergens: ProductAllergens,
  userAllergies: AllergySettings
): 'ng' | 'partial' | 'ok' => {
  const enabled = Object.entries(userAllergies)
    .filter(([, v]) => v.enabled)
    .map(([name]) => name)

  if (allergens.contains.some(a => enabled.includes(a))) return 'ng'
  if (
    allergens.partial.some(a => enabled.includes(a) && userAllergies[a]?.partialAlert)
  ) return 'partial'
  return 'ok'
}
```

`ng` / `partial` / `ok` の導出ロジックはここにのみ書く。スキャン結果表示や履歴フィルタリングで同じロジックを再実装しない。
