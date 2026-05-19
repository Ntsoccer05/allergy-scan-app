# アンチパターン禁則

## 安全性に関わるアンチパターン（最優先）

### 1. OCR 結果を安全側に倒さない

```typescript
// ❌ 判定不能を「なし」として扱う
if (!result) return 'なし'

// ✅ 判定不能は必ず警告側に倒す（results[] 配列の各要素をチェック）
if (!result || result.results.some(r => r.judgment === '判定不能')) {
  // ユーザーに再スキャン or 実物確認を促す
}
```

**理由**: アレルギーの見逃しはアナフィラキシーリスクに直結する。不明な場合は必ず安全側（警告）に倒す。

### 2. incomplete フラグを無視してアレルゲン判定を返す

```typescript
// ❌ incomplete でも判定結果を返す
return { judgment: result.judgment }

// ✅ incomplete は即エラー返却
if (result.incomplete) {
  throw new BadRequestException('ラベル全体が映るように離してください')
}
```

### 3. exclude 型の成分を Gemini プロンプトに含める

```typescript
// ❌ 全成分をそのままプロンプトに渡す
const allComponents = await getComponents(allergens)

// ✅ exclude 型を除外してから渡す
const detectionComponents = allComponents.filter(
  c => c.component_type !== 'exclude'
)
// exclude 型は誤検出防止として別途渡す
```

### 4. NG・一部含む判定の商品を SNS 共有可能にする

```typescript
// ❌ 全判定を共有可能にする
const canShare = true

// ✅ OK 判定のみ
const canShare = judgment === 'なし'
```

---

## アーキテクチャ違反

### 5. Controller が Repository を直接呼ぶ

```typescript
// ❌
@Post('/scan/ocr')
async scanOcr(@Body() dto: OcrDto) {
  return this.productRepository.findByHash(dto.hash)  // ❌ Repository 直呼び
}

// ✅
@Post('/scan/ocr')
async scanOcr(@Body() dto: OcrDto) {
  return this.scanService.processOcr(dto)  // ✅ Service 経由
}
```

### 6. Service に SQL クエリを書く

```typescript
// ❌
async getHistory(userId: string) {
  return this.db.query('SELECT * FROM scan_histories WHERE user_id = $1', [userId])
}

// ✅ Repository に委譲
async getHistory(userId: string) {
  return this.historyRepository.findByUserId(userId)
}
```

### 7. UI コンポーネントが fetch を直接呼ぶ

```typescript
// ❌
const ResultCard = () => {
  const [data, setData] = useState(null)
  useEffect(() => { fetch('/api/history').then(...) }, [])
}

// ✅ Hook 経由
const ResultCard = ({ judgment, detected }: ResultCardProps) => {
  // Props で受け取るだけ。fetch しない
}
```

---

## データ整合性

### 8. `allergens.name` と `users.allergies` のキーを不一致にする

`users.allergies` JSONB のキーは `allergens.name` と完全一致でなければならない。`allergen_components.allergen_name` も同様。

### 9. `scan_count` を更新せずにキャッシュ期限を固定する

```typescript
// ❌ 固定期間
expiresAt = addDays(now, 30)

// ✅ scan_count 連動
expiresAt = addDays(now, getExpiryDays(product.scan_count))
```

### 10. `id_type` + `id_value` の UNIQUE 制約をアプリ側で無視する

UPSERT 時は必ず `ON CONFLICT (id_type, id_value)` 句を使う。重複を無視しない。

---

## パフォーマンス・コスト

### 11. 全アレルゲンの成分を常に Gemini プロンプトに含める

```typescript
// ❌ 全 29 品目を常に渡す（トークン無駄・精度低下）
const allComponents = await getComponents(ALL_ALLERGENS)

// ✅ ユーザーが有効にしたアレルゲンのみ
const enabledAllergens = Object.entries(user.allergies)
  .filter(([, v]) => v.enabled)
  .map(([name]) => name)
const components = await getComponents(enabledAllergens)
```

### 12. S3 に画像を直接 Lambda 経由でアップロードする

Lambda は 6MB のペイロード制限がある。画像は必ず Presigned URL でクライアントから S3 に直接アップロードする。

---

## 型安全

### 13. `as any` / `@ts-ignore` で型エラーを抑制する

型エラーは必ず根本的に解決する。`as any` は禁止。

### 14. JSONB フィールドを型定義なしで扱う

```typescript
// ❌
const allergens = product.allergens  // any 型

// ✅ 型を定義する
type ProductAllergens = {
  contains: string[]
  partial: string[]
  components: string[]
}
```

---

## UI・UX

### 15. 免責事項を結果画面から除去する

スキャン結果画面には「⚠️ 購入前にラベルの実物も確認ください」を常時表示する。省略禁止。

### 16. NG 判定時に免責メッセージを省略する

NG 判定時は「このアプリの判定は参考情報です。アナフィラキシーのリスクがある方は必ず実物ラベルでご確認ください」を必ず表示する。

### 17. UIテキストをコンポーネントにハードコードする

```typescript
// ❌ ハードコード（多言語化で全コンポーネント修正が必要になる）
<p>購入前にラベルの実物も必ずご確認ください</p>

// ✅ i18nキーで管理
<p>{t('scan.result.caution')}</p>
```

**理由**: アプリは日本語/英語の多言語対応を予定している。最初からi18nキーで書かないと後で全コンポーネントを書き直す大工事になる（`coding_rules.md` の i18n セクション参照）。
