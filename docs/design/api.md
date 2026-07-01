# バックエンドAPI設計

## エンドポイント一覧

```
POST /users/me/init          Supabase JWT 初回ユーザー登録（users INSERT）
GET  /users/me               ユーザー設定取得（TTL: 5分キャッシュ）
PUT  /users/me               アレルギー設定更新
DELETE /users/me             ユーザーデータ削除（要配慮個人情報の削除権）
POST /users/me/reset-data    アレルギー設定・履歴のみリセット（users/user_daily_scans は保持・204）
POST /users/me/backup-code   引継ぎ用バックアップコード発行（30日有効・再発行で旧コード無効化）
POST /users/me/restore       バックアップコードでアレルギー設定を引継ぎ（{ code: string }）
GET  /scan/presigned-url     S3 Presigned URL発行
POST /scan/barcode           JANコード照合
POST /scan/ocr               OCR + アレルギー判定（日次スキャン上限チェック）
GET  /history                履歴一覧取得（カーソルページネーション）
POST /history                履歴保存
PATCH /history/:id           履歴編集（product_name / store_name / memo / is_public）
DELETE /history/:id          履歴削除
GET  /public/history         みんなのスキャン一覧（認証不要・カーソルページネーション）
GET  /public/history/digest  みんなのスキャン新着件数（ポーリング用）
GET  /allergens              アレルギーマスター取得（設定画面用）
GET  /route                  経路取得（クエリ: from_lat, from_lng, to_lat, to_lng, mode=driving|walking|cycling）。ROUTING_PROVIDER env で OSRM（本番）/ ORS（ローカル）切替。transit モードはフロント側で Google Maps ディープリンクに委譲
GET  /admin/users            ユーザー一覧（admin 専用・カーソルページネーション）
GET  /admin/stats            統計情報（admin 専用）
PATCH /admin/users/:id/plan  プラン手動変更（admin 専用）
POST /webhooks/stripe        Stripe Webhook 受信（@Public）
```

**認証方式（現行）**: Cookie ベース認証（HttpOnly Cookie）。フロントエンドはクッキーを自動送信する。`@Public()` デコレータで認証バイパス。`/admin/*` は `AdminGuard` が Supabase Auth `app_metadata.role === 'admin'` を追加チェック。

> ⚠️ Phase 1（pending）で Supabase Auth JWT Bearer Token に統一予定。移行後は `Authorization: Bearer <token>` ヘッダーを `apiFetch` ラッパーが自動付与する。

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
  before: string（ページネーション用 MAX(scanned_at) ISO8601）

response（v2 - HistoryGroup 形式）:
  {
    items: HistoryGroup[],
    next_before: string | null
  }

type HistoryGroup = {
  product: {
    id: string
    name: string | null
    allergens: ProductAllergens
    thumbnailUrl: string | null
    itemUrl: string | null       // 楽天アフィリエイトURL
  }
  judgment: 'ng' | 'partial' | 'ok'  // 現在の設定で再導出
  detected: string[]
  scans: Array<{
    id: string
    scannedAt: string
    location: { storeName: string; lat: number; lng: number; address?: string; placeId?: string } | null
    memo: string | null
  }>
  latestScanAt: string
}

注意:
  - 旧フラット ScanHistory[] から GROUP BY product_id 形式に変更済み
  - judgment は scan_histories.judgment ではなく、product.allergens × 現在のユーザー設定から in-memory 再導出
  - カーソルは HAVING MAX(scanned_at) < before で比較
```

---

## PATCH /history/:id

```
認証: Bearer Token 必須（未認証 → 401）
所有権チェック: 他ユーザーの履歴 → 403、存在しない → 404

request:
  {
    product_name?: string | null   // 最大200文字
    store_name?: string | null     // 最大100文字（location JSONB の store_name のみ更新。lat/lng は既存値を維持）
    memo?: string | null           // 最大500文字
    is_public?: boolean            // みんなの履歴公開フラグ（デフォルト: true）
    thumbnail_url?: string | null  // サムネイル URL（null で削除）
  }

response: 200 OK（ボディなし）
```

---

## DELETE /history/:id

```
認証: Bearer Token 必須（未認証 → 401）
所有権チェック: 他ユーザーの履歴 → 403、存在しない → 404

response: 204 No Content
```

---

## DELETE /history/bulk

```
認証: Bearer Token 必須（未認証 → 401）
他ユーザーの ID を含めても自ユーザー分のみ削除される（403 にしない）

request:
  {
    ids: string[]   // 削除対象の履歴 ID リスト（最大100件）
  }

response: 204 No Content
```

---

## GET /public/history

```
認証: 不要（@Public）

query:
  limit: number（デフォルト20）
  before: string（カーソル用 ISO8601 datetime）

response:
  {
    items: PublicHistoryItem[],
    next_before: string | null
  }

PublicHistoryItem:
  {
    id: string
    product_name: string | null
    store_name: string | null
    judgment: 'ng' | 'partial' | 'ok'
    thumbnail_url: string | null
    scanned_at: string
  }
```

---

## GET /public/history/digest

```
認証: 不要（@Public）
用途: フロントエンドが60秒ごとにポーリングして新着バナー表示

response:
  {
    count: number    // 最新N件のスキャン数（新着検知用）
  }
```

---

## GET /admin/users

```
認証: Bearer Token 必須 + AdminGuard (role=admin)

query:
  limit: number（デフォルト20）
  cursor: string（カーソル用 user.created_at ISO8601）

response:
  {
    items: AdminUser[],
    next_cursor: string | null
  }

AdminUser:
  {
    id: string
    created_at: string
    subscription: { plan_name: string } | null
    daily_scan_limit: number
  }
```

---

## GET /admin/stats

```
認証: Bearer Token 必須 + AdminGuard (role=admin)

response:
  {
    total_users: number
    total_scans: number
    today_scans: number
    premium_users: number
  }
```

---

## PATCH /admin/users/:id/plan

```
認証: Bearer Token 必須 + AdminGuard (role=admin)

request:
  { plan_name: string }   // 'free' | 'premium'

response: 204 No Content
```

---

## POST /webhooks/stripe

```
認証: 不要（@Public）、Stripe 署名検証（TODO: Stripe SDK）

headers:
  stripe-signature: string（Stripe が付与するHMAC署名）

response:
  { received: true }
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
