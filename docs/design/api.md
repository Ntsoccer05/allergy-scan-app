# バックエンドAPI設計

## エンドポイント一覧

```
POST /users/init             初回Cookie発行・users INSERT（初回アクセス時）
GET  /scan/presigned-url     S3 Presigned URL発行
POST /scan/barcode           JANコード照合
POST /scan/ocr               OCR + アレルギー判定
GET  /history                履歴一覧取得
POST /history                履歴保存
GET  /allergens              アレルギーマスター取得（設定画面用）
GET  /users/me               ユーザー設定取得
PUT  /users/me               アレルギー設定更新
DELETE /users/me             ユーザーデータ削除（要配慮個人情報の削除権）
```

**認証方式**: ログイン不要。`POST /users/init` で `HttpOnly; SameSite=Strict; Secure` Cookie を発行し、以降すべてのリクエストでブラウザが自動送信する。カスタムヘッダー（`x-user-id`）は使用しない。

---

## POST /scan/barcode

```
request:
  { jan_code: string }

flow:
  NestJSメモリキャッシュ確認（TTL:60秒）
    ↓ ミス
  DBのexpires_at確認
    ↓ 期限内 → 即返却
    ↓ 期限切れ or 未登録
  Open Food Facts照合（無料）
    ↓ ミス
  { found: false } を返却 → クライアントがOCRに自動切り替え

response:
  {
    found: boolean,
    product_name: string,
    allergens: {
      contains: string[],
      partial: string[],
      components: string[]
    },
    judgment: 'ng' | 'partial' | 'ok',
    detected: string[],
    is_high_risk: boolean,
    from_cache: boolean
  }
```

---

## GET /scan/presigned-url → PUT S3 → POST /scan/ocr

```
// Step 1: Presigned URL取得
GET /scan/presigned-url
response: { url: string, s3_key: string }

// Step 2: クライアントがS3に直接アップロード（NestJS経由しない）
PUT {url} with image blob

// Step 3: OCR判定依頼
POST /scan/ocr
request: { s3_key: string }

flow:
  S3から画像取得
    ↓
  allergen_componentsテーブルからユーザーの有効アレルギーの成分を取得
    ↓
  Geminiにプロンプト送信（OCR + 判定）
    ↓
  incomplete:true → エラー返却（再スキャン要求）
    ↓
  products DBに保存（scan_count更新・expires_at設定）
  scan_histories DBに記録
    ↓
  クライアントに結果返却

response:
  {
    raw_text: string,
    confidence: 'high' | 'medium' | 'low',
    judgment: 'ng' | 'partial' | 'ok' | '判定不能',
    detected: string[],
    is_high_risk: boolean,
    reason: string,
    incomplete: boolean,
    price: number | null,
    price_with_tax: number | null,
    price_confidence: 'high' | 'low' | null
  }
```

---

## GET /history

```
query:
  filter: 'all' | 'ng' | 'partial' | 'ok'
  limit: number（デフォルト20）
  before: string（ページネーション用 scanned_at ISO8601）

sql:
  SELECT * FROM scan_histories
  WHERE user_id = $1
    AND ($2 = 'all' OR judgment = $2)
    AND ($3::timestamp IS NULL OR scanned_at < $3)
  ORDER BY scanned_at DESC
  LIMIT 20

response:
  {
    items: ScanHistory[],
    next_before: string | null
  }
```

---

## GET /allergens

```
response:
  [
    {
      category: 'mandatory',
      label: '特定原材料（9品目・表示義務あり）',
      items: [
        { name: 'えび', emoji: '🦐', display_order: 1 },
        ...
      ]
    },
    {
      category: 'recommended',
      label: '準ずるもの（20品目・表示推奨）',
      items: [ ... ]
    }
  ]
```

---

## GET /users/me

```
設定キャッシュ TTL: 5分
スキャン開始時に呼び出し → Geminiプロンプトの動的生成に使用

response:
  {
    id: string,
    allergies: {
      "乳": { enabled: true, partialAlert: true },
      "卵": { enabled: true, partialAlert: true },
      ...
    }
  }
```

---

## インフラ注意事項

- 画像はS3 Presigned URL経由（Lambdaの6MB制限回避）
- NestJSにはS3キーのみ渡す（画像データを渡さない）
- Lambdaコールドスタート対策：EventBridgeで5分おきにPing
