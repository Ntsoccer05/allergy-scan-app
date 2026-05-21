# アレルギースキャンアプリ 設計ドキュメント

## 1. プロダクト概要

### コンセプト
スーパー・コンビニでの食品購入時に、バーコードスキャンまたはラベル撮影（OCR）でアレルギーを即座に判定するスマートフォンアプリ。

### ターゲットユーザー
- 食物アレルギーを持つ成人（特に乳・卵アレルギー）
- アレルギー持ちの家族を持つ親
- 派生成分（カゼイン等）まで気にする必要があるアナフィラキシーリスクを持つ人

### 解決する課題
- スーパー惣菜・コンビニ食品の裏ラベルを毎回目視確認する煩わしさの解消
- カゼイン・ホエイ等の派生成分の見逃し防止
- 競合（アレルギーチェッカー等）がカバーできていない惣菜・未登録商品への対応

---

## 2. 競合分析

### 主要競合の弱点

| 競合 | バーコード | OCR | 派生成分検出 | 惣菜対応 |
|---|---|---|---|---|
| アレルギーチェッカー（Willmore） | ✅ | ❌ | ❌ | ❌ |
| e食なび | △ | ❌ | ❌ | ❌ |
| Bokha | ✅ | ❌ | ❌ | ❌ |
| **本アプリ** | ✅ | ✅ | ✅ | ✅ |

### 差別化ポイント
1. **惣菜ラベルのOCR撮影判定**（全競合ゼロ）
2. **カゼイン等の派生成分検出**（全競合ゼロ）
3. **含む / 一部含む の2段階判定**（全競合ゼロ）
4. **自社DB蓄積によるスキャン精度の継続的向上**

---

## 3. 機能設計

### MVP（Phase 1）スコープ

**IN**
- アレルギー登録（タップのみ）
- バーコード自動スキャン（かざすだけ）
- ラベル自動OCR（かざすだけ）
- スキャン履歴 + 場所記録
- SNS共有（セーフ商品のみ）

**OUT（Phase 2以降）**
- 家族プロフィール管理
- 飲食店マップ
- レシピ提案

### アレルギー設定
```
Step 1: アレルギー選択（タップのみ）
        特定原材料9品目 + 準ずるもの20品目 から選択

Step 2: 一部含む商品も警告するか選択
        ☑ 含む商品は警告（必須ON）
        ☑ 一部含む商品も警告（ON/OFF選択可・デフォルトON）
```

### 対応アレルギー全品目（29品目）

**特定原材料（9品目・表示義務あり）**

| アレルギー | デフォルト |
|---|---|
| えび | OFF |
| かに | OFF |
| カシューナッツ | OFF |
| くるみ | OFF |
| 小麦 | OFF |
| そば | OFF |
| 卵 | OFF |
| 乳 | OFF |
| 落花生（ピーナッツ） | OFF |

**特定原材料に準ずるもの（20品目・表示推奨）**

| アレルギー | デフォルト |
|---|---|
| アーモンド | OFF |
| あわび | OFF |
| いか | OFF |
| いくら | OFF |
| オレンジ | OFF |
| キウイフルーツ | OFF |
| 牛肉 | OFF |
| ごま | OFF |
| さけ | OFF |
| さば | OFF |
| 大豆 | OFF |
| 鶏肉 | OFF |
| バナナ | OFF |
| ピスタチオ | OFF |
| 豚肉 | OFF |
| マカデミアナッツ | OFF |
| もも | OFF |
| りんご | OFF |
| やまいも | OFF |
| ゼラチン | OFF |

### アレルギー設定のデフォルト値

```typescript
// 全品目デフォルトOFF
// ・enabled:false = アレルギーOFF
// ・partialAlert:false = 一部含むOFF
// ※ enabled:trueにした瞬間にpartialAlert:trueに自動設定

const DEFAULT_ALLERGIES: AllergySettings = {
  // 特定原材料（9品目）
  えび:           { enabled: false, partialAlert: false },
  かに:           { enabled: false, partialAlert: false },
  カシューナッツ:   { enabled: false, partialAlert: false },
  くるみ:          { enabled: false, partialAlert: false },
  小麦:           { enabled: false, partialAlert: false },
  そば:           { enabled: false, partialAlert: false },
  卵:             { enabled: false, partialAlert: false },
  乳:             { enabled: false, partialAlert: false },
  落花生:          { enabled: false, partialAlert: false },
  // 準ずるもの（20品目）
  アーモンド:       { enabled: false, partialAlert: false },
  あわび:          { enabled: false, partialAlert: false },
  いか:            { enabled: false, partialAlert: false },
  いくら:          { enabled: false, partialAlert: false },
  オレンジ:         { enabled: false, partialAlert: false },
  キウイフルーツ:    { enabled: false, partialAlert: false },
  牛肉:            { enabled: false, partialAlert: false },
  ごま:            { enabled: false, partialAlert: false },
  さけ:            { enabled: false, partialAlert: false },
  さば:            { enabled: false, partialAlert: false },
  大豆:            { enabled: false, partialAlert: false },
  鶏肉:            { enabled: false, partialAlert: false },
  バナナ:           { enabled: false, partialAlert: false },
  ピスタチオ:       { enabled: false, partialAlert: false },
  豚肉:            { enabled: false, partialAlert: false },
  マカデミアナッツ:   { enabled: false, partialAlert: false },
  もも:            { enabled: false, partialAlert: false },
  りんご:           { enabled: false, partialAlert: false },
  やまいも:         { enabled: false, partialAlert: false },
  ゼラチン:         { enabled: false, partialAlert: false },
}

// ONにした瞬間にpartialAlertも自動ON
// OFFにした瞬間にpartialAlertも自動OFF
const toggleAllergen = (name: string) => {
  const isEnabling = !allergies[name].enabled
  return {
    ...allergies,
    [name]: {
      enabled: isEnabling,
      partialAlert: isEnabling, // enabledと連動
    }
  }
}
```

### アレルギー判定の2段階分類

| 分類 | 判定基準 | 表示 |
|---|---|---|
| 含む | 原材料に直接表記 or 派生成分含む | 🔴 NG |
| 一部含む | 「一部に〜を含む」or コンタミ注意書き | 🟡 注意 |
| なし | 該当成分なし | ✅ OK |

### 乳アレルギー対応の派生成分リスト（例）
```
直接表記：乳、牛乳、生乳、全乳、脱脂粉乳
タンパク成分（危険度高）：カゼイン、カゼインナトリウム、
                        ホエイ、ホエイパウダー、ラクトアルブミン
乳糖・加工品：ラクトース、バター、チーズ、クリーム
紛らわしい表記：乳化剤（乳由来の場合あり）
```

---

## 4. スキャンUX設計

### 基本方針
- ボタン操作なし・かざすだけ
- シャッター音なし（動画フレームキャプチャを使用）
- フラッシュライトなし（コンビニ・スーパーでの迷惑回避）

### スキャンフロー
```
カメラ常時起動（ライブ表示）
      ↓
バーコード検出を優先的に試みる
      ↓ バーコードなし
フレーム品質チェック（5fps）
  ✅ ブレなし（前フレームとの差分）
  ✅ 明るさ十分
  ✅ ピント合致（エッジシャープネス）
  ✅ テキスト領域検出
      ↓ 3フレーム連続OK
自動キャプチャ（無音）→ Gemini送信
      ↓
結果カードがスライドイン
```

### 自動制御の対応範囲

| 条件 | 自動制御 | 対応方法 |
|---|---|---|
| 暗い | ❌ | 「明るい場所に移動してください」ガイド表示 |
| ピントずれ | ✅ | フォーカスエリアを画面中央に強制指定 |
| ブレ | 半自動 | ISO自動調整 + 安定するまで待機 |
| 枠外 | ❌ | 全画面対象でOCR（枠で範囲制限しない） |

### Error時の状態遷移
```
api_error    → idle（ユーザー操作が必要なため）
dark         → detecting継続（自動リトライ）
blur         → detecting継続（自動リトライ）
motion       → detecting継続（自動リトライ）
incomplete   → detecting継続（ガイド表示して継続）
```

### 結果UI設計
```
┌──────────────────────┐
│  📷 カメラ映像        │
│                      │
├──────────────────────┤  ← 下からスライドイン
│ 卵    🔴 含む         │
│ 小麦  🟡 一部含む     │  ← 成分ごとに個別表示
│ 乳    ✅ なし         │
│                      │
│ [原材料を確認する ▼]  │  ← タップで展開
│                      │
│ ⚠️ 購入前にラベルの   │  ← 安全設計：常時表示
│    実物も確認ください  │
└──────────────────────┘
```

### iOS バイブレーション対応
- PWA段階：iOSはVibration API非対応のため視覚のみ
- Android PWA：バイブレーション対応済み
- ネイティブ移行後：iOS含め全対応

---

## 5. OCR安全設計

### 設計の根本思想
「OCRが間違える前提で設計する」＝判定不明・読み取り不完全は必ず安全側（警告）に倒す

### 2層構造

**Layer 1：送信前に画像品質を担保（端末側）**
- ブレ・暗さ・ピントを弾く
- 品質不足はdetectingで自動待機

**Layer 2：Geminiへの指示（サーバー側）**
```
【重要】有効なアレルギーのみをプロンプトに渡す
→ allergen_componentsテーブルから動的生成
→ トークン節約 + 判定精度向上の両方が得られる

例：ユーザーが「卵・乳」のみ有効にしている場合
---
ユーザーが設定しているアレルギー：[卵, 乳]

【検出対象成分】
・乳、牛乳、生乳、脱脂粉乳
・カゼイン、カゼインNa（⚠️危険度高）
・ホエイ、ホエイパウダー（⚠️危険度高）
・バター、チーズ、アイスクリーム、生クリーム
・卵、玉子、たまご、エッグ
・卵黄、卵白
・オボムコイド（⚠️危険度高・加熱でも残る）
・マヨネーズ、リゾチーム

【検出対象外（誤検出に注意）】
・乳化剤（乳由来でない場合がある）
・乳酸菌（乳アレルギーと無関係）
・カカオバター（乳ではない）

ルール：
・原材料テキストを一字一句そのまま抽出
・判定は「含む/一部含む/なし/判定不能」の4択
・上記検出対象成分を必ず検出すること
・検出対象外の成分でNGを返さないこと
・不明な文字は「？」で返す
・不明な場合は不明と返す（推測しない）
・テキストが途切れている場合は incomplete:true を返す
・価格が表示されていれば合わせて返す

返答はJSON形式：
{
  "raw_text": "読み取った原材料テキスト全文",
  "confidence": "high / medium / low",
  "judgment": "含む / 一部含む / なし / 判定不能",
  "detected": ["カゼイン", "ホエイ"],
  "is_high_risk": true,
  "reason": "カゼイン（乳由来タンパク・危険度高）を検出",
  "incomplete": false,
  "price": 298,
  "price_with_tax": 321,
  "price_confidence": "high / low / null"
}
```

### confidence別の処理
```
high   → 通常判定表示
medium → 判定表示 + 「⚠️ 一部読み取りにくい箇所があります」
low    → 「もう少し近づけて再スキャンしてください」
判定不能 → 同上
incomplete:true → 「ラベル全体が映るように離してください」
```

---

## 6. データベース設計

### 構成
- **本番（PMF後）**：Aurora Serverless v2（PostgreSQL）
- **MVP段階**：RDS t3.micro（約$15/月）→ PMF後にAurora移行

### テーブル設計

#### productsテーブル
```sql
CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_type       VARCHAR(10) NOT NULL,  -- 'jan' or 'hash'
  id_value      VARCHAR(255) NOT NULL,
  product_name  VARCHAR(255),
  store_name    VARCHAR(255),          -- 惣菜の場合のみ
  allergens     JSONB NOT NULL DEFAULT '{}',
  -- allergens例：
  -- {
  --   "contains": ["乳", "卵"],
  --   "partial": ["小麦"],
  --   "components": ["カゼイン", "卵白"]
  -- }
  raw_text      TEXT,
  scan_count    INTEGER DEFAULT 1,
  confidence    VARCHAR(10),
  expires_at    TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(id_type, id_value)
);

```

#### scan_historiesテーブル
```sql
CREATE TABLE scan_histories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR(255) NOT NULL,
  product_id    UUID REFERENCES products(id),
  product_name  VARCHAR(255),          -- 履歴一覧の高速表示用
  judgment      VARCHAR(10) NOT NULL,  -- 'ng' / 'partial' / 'ok'
  detected      JSONB DEFAULT '[]',
  location      JSONB,
  -- location例：
  -- {
  --   "store_name": "セブンイレブン渋谷店",
  --   "lat": 35.658,
  --   "lng": 139.701
  -- }
  thumbnail_url VARCHAR(500),          -- 惣菜のみ
  scanned_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX scan_histories_user_idx
  ON scan_histories(user_id, scanned_at DESC);
CREATE INDEX scan_histories_store_idx
  ON scan_histories(store_name, scanned_at DESC);
```

#### usersテーブル
```sql
CREATE TABLE users (
  id           VARCHAR(255) PRIMARY KEY, -- MVPはデバイスID
  allergies    JSONB NOT NULL DEFAULT '{}',
  -- allergies例：
  -- {
  --   "乳":   { "enabled": true,  "partialAlert": true },
  --   "卵":   { "enabled": true,  "partialAlert": true },
  --   "小麦": { "enabled": false, "partialAlert": false }
  -- }
  -- ※キーはallergensテーブルのnameと対応
  created_at   TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP DEFAULT NOW()
);
```

### allergensテーブル（アレルギーマスター）

```sql
CREATE TABLE allergens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(50) NOT NULL UNIQUE,  -- '乳', '卵' 等
  display_name  VARCHAR(50) NOT NULL,         -- 表示名（同じでもOK）
  category      VARCHAR(20) NOT NULL,
  -- 'mandatory'    : 特定原材料（9品目・表示義務あり）
  -- 'recommended'  : 準ずるもの（20品目・表示推奨）
  display_order INTEGER NOT NULL,             -- 設定画面の表示順
  emoji         VARCHAR(10),                  -- 設定画面用アイコン
  is_active     BOOLEAN DEFAULT true,         -- 法改正時の無効化用
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX allergens_category_idx
  ON allergens(category, display_order);
```

#### 初期データ（29品目）

```sql
-- 特定原材料（9品目・表示義務あり）
INSERT INTO allergens
  (id, name, display_name, category, display_order, emoji) VALUES
  (gen_random_uuid(), 'えび',     'えび',           'mandatory',   1,  '🦐'),
  (gen_random_uuid(), 'かに',     'かに',           'mandatory',   2,  '🦀'),
  (gen_random_uuid(), 'カシューナッツ','カシューナッツ','mandatory',  3,  '🌰'),
  (gen_random_uuid(), 'くるみ',   'くるみ',         'mandatory',   4,  '🌰'),
  (gen_random_uuid(), '小麦',     '小麦',           'mandatory',   5,  '🌾'),
  (gen_random_uuid(), 'そば',     'そば',           'mandatory',   6,  '🍜'),
  (gen_random_uuid(), '卵',       '卵',             'mandatory',   7,  '🥚'),
  (gen_random_uuid(), '乳',       '乳',             'mandatory',   8,  '🥛'),
  (gen_random_uuid(), '落花生',   '落花生（ピーナッツ）','mandatory',9,  '🥜'),

  -- 特定原材料に準ずるもの（20品目・表示推奨）
  (gen_random_uuid(), 'アーモンド',   'アーモンド',     'recommended', 10, '🌰'),
  (gen_random_uuid(), 'あわび',       'あわび',         'recommended', 11, '🐚'),
  (gen_random_uuid(), 'いか',         'いか',           'recommended', 12, '🦑'),
  (gen_random_uuid(), 'いくら',       'いくら',         'recommended', 13, '🐟'),
  (gen_random_uuid(), 'オレンジ',     'オレンジ',       'recommended', 14, '🍊'),
  (gen_random_uuid(), 'キウイフルーツ','キウイフルーツ', 'recommended', 15, '🥝'),
  (gen_random_uuid(), '牛肉',         '牛肉',           'recommended', 16, '🥩'),
  (gen_random_uuid(), 'ごま',         'ごま',           'recommended', 17, '🌿'),
  (gen_random_uuid(), 'さけ',         'さけ',           'recommended', 18, '🐟'),
  (gen_random_uuid(), 'さば',         'さば',           'recommended', 19, '🐟'),
  (gen_random_uuid(), '大豆',         '大豆',           'recommended', 20, '🫘'),
  (gen_random_uuid(), '鶏肉',         '鶏肉',           'recommended', 21, '🍗'),
  (gen_random_uuid(), 'バナナ',       'バナナ',         'recommended', 22, '🍌'),
  (gen_random_uuid(), 'ピスタチオ',   'ピスタチオ',     'recommended', 23, '🌰'),
  (gen_random_uuid(), '豚肉',         '豚肉',           'recommended', 24, '🥩'),
  (gen_random_uuid(), 'マカダミアナッツ','マカダミアナッツ','recommended',25,'🌰'),
  (gen_random_uuid(), 'もも',         'もも',           'recommended', 26, '🍑'),
  (gen_random_uuid(), 'りんご',       'りんご',         'recommended', 27, '🍎'),
  (gen_random_uuid(), 'やまいも',     'やまいも',       'recommended', 28, '🌿'),
  (gen_random_uuid(), 'ゼラチン',     'ゼラチン',       'recommended', 29, '🫙');
```

### allergen_componentsへの外部キー追加

```sql
-- allergen_nameをallergensテーブルのnameと紐付け
ALTER TABLE allergen_components
  ADD CONSTRAINT fk_allergen_name
  FOREIGN KEY (allergen_name)
  REFERENCES allergens(name)
  ON UPDATE CASCADE;  -- allergens側の名前変更に自動追従
```

### テーブル間の関係

```
allergens（マスター）
  └─ name → allergen_components（派生成分・除外リスト）
               └─ allergen_name（FK）

設定画面：
  GET /allergens
  → allergensテーブルから全件取得
  → category順・display_order順で表示

スキャン時：
  有効アレルギー → allergen_componentsから派生成分を取得
  → Geminiプロンプトを動的生成
```

### 設定画面APIのレスポンス例

```json
[
  {
    "category": "mandatory",
    "label": "特定原材料（9品目・表示義務あり）",
    "items": [
      { "name": "えび",  "emoji": "🦐", "display_order": 1 },
      { "name": "かに",  "emoji": "🦀", "display_order": 2 },
      { "name": "卵",    "emoji": "🥚", "display_order": 7 },
      { "name": "乳",    "emoji": "🥛", "display_order": 8 }
    ]
  },
  {
    "category": "recommended",
    "label": "準ずるもの（20品目・表示推奨）",
    "items": [
      { "name": "アーモンド", "emoji": "🌰", "display_order": 10 },
      ...
    ]
  }
]
```

### 法改正時の対応

```
新しい品目が追加された場合：
  → allergensにINSERT
  → allergen_componentsに派生成分をINSERT
  → デプロイ不要・即反映

品目が廃止された場合：
  → is_active = false に更新
  → 既存ユーザーの設定データには影響なし
  → 設定画面から非表示になるだけ
```

### allergen_componentsテーブル（派生成分マスター）

```sql
CREATE TABLE allergen_components (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allergen_name VARCHAR(50) NOT NULL,   -- '乳', '卵', '小麦' 等
  component     VARCHAR(100) NOT NULL,  -- 実際の表記
  component_type VARCHAR(20) NOT NULL,
  -- 'direct'    : 直接表記（乳、牛乳 等）
  -- 'derivative': 派生成分（カゼイン、ホエイ 等）
  -- 'processed' : 加工品（バター、チーズ 等）
  -- 'additive'  : 添加物（カゼインNa、グルテン 等）
  -- 'exclude'   : 誤検出除外リスト（乳化剤、乳酸菌 等）
  is_high_risk  BOOLEAN DEFAULT false,  -- アナフィラキシーリスク高
  note          TEXT,                   -- 補足説明
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX allergen_components_name_idx
  ON allergen_components(allergen_name);
CREATE INDEX allergen_components_type_idx
  ON allergen_components(allergen_name, component_type);
```

#### 初期データ（抜粋）

```sql
-- 乳
INSERT INTO allergen_components VALUES
  (gen_random_uuid(), '乳', '乳',           'direct',     true,  NULL),
  (gen_random_uuid(), '乳', '牛乳',          'direct',     true,  NULL),
  (gen_random_uuid(), '乳', '生乳',          'direct',     true,  NULL),
  (gen_random_uuid(), '乳', '全乳',          'direct',     true,  NULL),
  (gen_random_uuid(), '乳', '脱脂粉乳',      'direct',     true,  NULL),
  (gen_random_uuid(), '乳', 'カゼイン',      'derivative', true,  '乳タンパク・加熱で変性しない'),
  (gen_random_uuid(), '乳', 'カゼインNa',    'additive',   true,  '添加物表記'),
  (gen_random_uuid(), '乳', 'ホエイ',        'derivative', true,  '乳清タンパク'),
  (gen_random_uuid(), '乳', 'ホエイパウダー', 'derivative', true,  '乳清タンパク'),
  (gen_random_uuid(), '乳', 'ラクトアルブミン','derivative', true, '乳清タンパク'),
  (gen_random_uuid(), '乳', 'ラクトース',    'derivative', false, '乳糖'),
  (gen_random_uuid(), '乳', 'バター',        'processed',  true,  NULL),
  (gen_random_uuid(), '乳', 'チーズ',        'processed',  true,  NULL),
  (gen_random_uuid(), '乳', 'アイスクリーム', 'processed',  true,  NULL),
  (gen_random_uuid(), '乳', '生クリーム',    'processed',  true,  NULL),
  (gen_random_uuid(), '乳', '練乳',          'processed',  true,  NULL),
  -- 誤検出除外リスト
  (gen_random_uuid(), '乳', '乳化剤',        'exclude',    false, '乳由来でない場合がある'),
  (gen_random_uuid(), '乳', '乳酸菌',        'exclude',    false, '乳アレルギーと無関係'),
  (gen_random_uuid(), '乳', 'カカオバター',   'exclude',    false, '乳ではない');

-- 卵
INSERT INTO allergen_components VALUES
  (gen_random_uuid(), '卵', '卵',            'direct',     true,  NULL),
  (gen_random_uuid(), '卵', '玉子',          'direct',     true,  '代替表記'),
  (gen_random_uuid(), '卵', 'たまご',        'direct',     true,  '代替表記'),
  (gen_random_uuid(), '卵', 'エッグ',        'direct',     true,  '代替表記'),
  (gen_random_uuid(), '卵', '卵黄',          'derivative', true,  NULL),
  (gen_random_uuid(), '卵', '卵白',          'derivative', true,  NULL),
  (gen_random_uuid(), '卵', 'オボムコイド',   'derivative', true,  '加熱しても残るアレルギー'),
  (gen_random_uuid(), '卵', 'マヨネーズ',    'processed',  true,  '含む旨省略されることも'),
  (gen_random_uuid(), '卵', 'リゾチーム',    'additive',   true,  '卵白由来添加物'),
  (gen_random_uuid(), '卵', 'レシチン（卵由来）','additive', true, '大豆由来は卵ではない');

-- 小麦
INSERT INTO allergen_components VALUES
  (gen_random_uuid(), '小麦', '小麦',         'direct',     true,  NULL),
  (gen_random_uuid(), '小麦', '小麦粉',       'direct',     true,  NULL),
  (gen_random_uuid(), '小麦', '強力粉',       'direct',     true,  NULL),
  (gen_random_uuid(), '小麦', '薄力粉',       'direct',     true,  NULL),
  (gen_random_uuid(), '小麦', 'グルテン',     'derivative', true,  NULL),
  (gen_random_uuid(), '小麦', 'しょうゆ',     'processed',  false, '含む旨省略されることも'),
  (gen_random_uuid(), '小麦', '醤油',         'processed',  false, NULL),
  (gen_random_uuid(), '小麦', '麩',           'processed',  true,  NULL),
  (gen_random_uuid(), '小麦', '大麦',         'processed',  false, 'グルテン含む'),
  (gen_random_uuid(), '小麦', 'デュラムセモリナ','processed', true, 'パスタ原料'),
  (gen_random_uuid(), '小麦', 'パン粉',       'processed',  true,  NULL),
  (gen_random_uuid(), '小麦', 'ベーキングパウダー（小麦由来）','additive',false,NULL);

-- 落花生
INSERT INTO allergen_components VALUES
  (gen_random_uuid(), '落花生', '落花生',           'direct',    true, NULL),
  (gen_random_uuid(), '落花生', 'ピーナッツ',        'direct',    true, '代替表記'),
  (gen_random_uuid(), '落花生', 'ピーナッツバター',   'processed', true, NULL),
  (gen_random_uuid(), '落花生', 'ピーナッツオイル',   'processed', true, NULL),
  (gen_random_uuid(), '落花生', '落花生油',          'processed', true, NULL),
  (gen_random_uuid(), '落花生', 'アラキス油',        'processed', true, '落花生油の別名');

-- えび
INSERT INTO allergen_components VALUES
  (gen_random_uuid(), 'えび', 'えび',          'direct',    true, NULL),
  (gen_random_uuid(), 'えび', 'エビ',          'direct',    true, NULL),
  (gen_random_uuid(), 'えび', '海老',          'direct',    true, NULL),
  (gen_random_uuid(), 'えび', 'シュリンプ',    'direct',    true, '英語表記'),
  (gen_random_uuid(), 'えび', 'プローン',      'direct',    true, '英語表記'),
  (gen_random_uuid(), 'えび', '甲殻類エキス',  'processed', true, 'かに含む可能性も'),
  (gen_random_uuid(), 'えび', 'えびエキス',    'processed', true, NULL);

-- かに
INSERT INTO allergen_components VALUES
  (gen_random_uuid(), 'かに', 'かに',             'direct',    true, NULL),
  (gen_random_uuid(), 'かに', 'カニ',             'direct',    true, NULL),
  (gen_random_uuid(), 'かに', '蟹',               'direct',    true, NULL),
  (gen_random_uuid(), 'かに', 'カニカマ',         'processed', false,'かにを含む旨省略されることも'),
  (gen_random_uuid(), 'かに', 'かに風味かまぼこ',  'processed', false, NULL),
  (gen_random_uuid(), 'かに', 'キチン（かに由来）','additive',  false,'添加物表記'),
  (gen_random_uuid(), 'かに', 'かにエキス',       'processed', true, NULL);
```

### allergen_componentsの活用方法

```
スキャン時のGeminiプロンプト生成フロー：

ユーザーの有効アレルギー取得（例：乳・卵）
        ↓
allergen_componentsから該当アレルギーを取得
  WHERE allergen_name IN ('乳', '卵')
  AND component_type != 'exclude'
        ↓
検出対象リストをプロンプトに動的生成
        ↓
除外リスト（exclude）も誤検出防止として渡す
```

```typescript
// NestJS側の実装イメージ
const buildPrompt = async (enabledAllergens: string[]) => {
  const components = await db.query(`
    SELECT allergen_name, component, component_type, is_high_risk, note
    FROM allergen_components
    WHERE allergen_name = ANY($1)
    ORDER BY allergen_name, component_type
  `, [enabledAllergens])

  const detectionList = components
    .filter(c => c.component_type !== 'exclude')
    .map(c => `・${c.component}${c.is_high_risk ? '（⚠️危険度高）' : ''}`)
    .join('\n')

  const excludeList = components
    .filter(c => c.component_type === 'exclude')
    .map(c => `・${c.component}（${c.note}）`)
    .join('\n')

  return `
検出対象：
${detectionList}

以下は検出対象外（誤検出に注意）：
${excludeList}
  `
}
```

### 商品IDの2階層管理

| ID種別 | 対象 | キー例 |
|---|---|---|
| jan | メーカー製加工食品 | `jan#4901234567890` |
| hash | 惣菜・バーコードなし商品 | `hash#a3f8c2d1...` |

label_hashの生成ロジック：
```
「商品名 + 店舗名 + 原材料の先頭50文字」をハッシュ化
例："セブン_チキン南蛮弁当_鶏肉(国産)、米、小麦粉..."
→ "a3f8c2d1..."
```

### expires_at（鮮度管理）

| scan_count | 有効期限 | 理由 |
|---|---|---|
| 1〜5件 | 30日 | 信頼性低・早めに再検証 |
| 6〜20件 | 90日 | 中程度の信頼性 |
| 21件〜 | 180日 | 高信頼性 |

---

## 7. キャッシュ設計

### 3層構造

```
Layer 1：クライアントキャッシュ（TTL: 2時間）
  └─ 同一セッション内の重複スキャンを即返却
  └─ 2時間の理由：大家族の買い物時間を考慮

Layer 2：NestJSメモリキャッシュ（TTL: 60秒）
  └─ 連続した重複リクエスト防止のみ
  └─ Lambdaの再起動でリセットされるため短期のみ

Layer 3：DBのexpires_at（TTL: 30〜180日）
  └─ 長期キャッシュの責務はDBが持つ
  └─ scan_count連動で有効期限を動的に設定
```

### 完全な判定フロー
```
バーコードスキャン
      ↓
Layer1：クライアントキャッシュ確認（TTL:2時間）
      ↓ ミス or 期限切れ
POST /scan/barcode
      ↓
Layer2：NestJSメモリキャッシュ確認（TTL:60秒）
      ↓ ミス
Layer3：DBのexpires_at確認
      ↓ 期限内 → 即返却
      ↓ 期限切れ or 未登録
Open Food Facts照合（無料）
      ↓ ミス
OCR自動切り替え → Gemini判定
      ↓
結果をDBに保存（次回からキャッシュ対象に）
```

---

## 8. 自社DB成長戦略

### DBヒット率の成長見込み
```
開始1ヶ月  → ヒット率 10%程度
3ヶ月後   → ヒット率 40%（コンビニ定番商品が埋まる）
6ヶ月後   → ヒット率 60%
1年後     → ヒット率 80%以上
```

### コスト削減効果
```
全スキャンOCR時：   3,000回 × $0.0002 = $0.6/月
DB成熟後（80%）：  600回  × $0.0002 = $0.12/月
→ コストが1/5になり速度も向上
```

### 将来的なID拡張
```
jan_code   → メーカー製加工食品
label_hash → スーパー惣菜・コンビニデリ
store_id   → チェーン定番メニュー
menu_hash  → 飲食店メニュー（Phase 3）
```

---

## 9. 技術スタック

### 全体構成

```
【フロントエンド】
Next.js (PWA → 将来React Nativeへ移行)
├── カメラ制御（getUserMedia API）
├── バーコード検出（ZXing.js）
├── フレーム品質チェック（Canvas API）
└── PWAマニフェスト

          ↓ HTTPS API通信

【バックエンド】
NestJS on AWS Lambda（コンテナデプロイ）
├── /scan/barcode    JANコード照合
├── /scan/ocr        画像受取 → Gemini連携
├── /scan/presigned-url  S3 URL発行
├── /history         履歴CRUD
└── /products        自社DB管理

          ↓

【インフラ・外部連携】
S3               画像アップロード（Presigned URL）
RDS t3.micro     自社商品DB・スキャン履歴（MVP）
Aurora Serverless v2  スケール後に移行
Gemini Flash API OCR + アレルギー判定
Open Food Facts  JANコード初期照合（無料）
Google Places API 店舗名取得
```

### 技術選定理由

| 項目 | 選定 | 理由 |
|---|---|---|
| フロント | Next.js PWA | 既存知見・ストア審査なし |
| バックエンド | NestJS on Lambda | 既存知見・スケール対応 |
| DB（MVP） | RDS t3.micro | 月$15・コスト最小 |
| DB（成長後） | Aurora Serverless v2 | 自動スケール |
| 画像ストレージ | S3 Presigned URL | Lambda 6MB制限回避 |
| OCR | Gemini Flash | 日本語精度・コスト最安 |
| バーコード | ZXing.js | 端末完結・無料 |
| 移行先 | React Native (Expo) | APIそのまま流用可能 |

### PWA → ネイティブ移行戦略
```
PWA段階でやること：
├── APIをNestJSに完全分離
├── カメラ処理をhooksに切り出し
└── UIをモバイルファーストで実装

PMF確認後：
├── React Native（Expo）にフロントを差し替え
├── NestJS APIはそのまま流用
└── カメラ処理のみネイティブAPIに置き換え
```

---

## 10. フロントエンド実装設計

### スキャン画面の状態管理

```typescript
type ScanState =
  | 'idle'        // カメラ起動中・待機
  | 'detecting'   // バーコード or テキスト検出中
  | 'stable'      // 品質チェックOK・キャプチャ直前
  | 'processing'  // API送信中
  | 'result'      // 結果表示中
  | 'error'       // エラー（暗い・ぼやけ等）
```

### コンポーネント設計
```
ScanScreen
├── useScan（状態管理・メインhook）
│   ├── useCamera（カメラ制御）
│   ├── useBarcode（バーコード検出）
│   ├── useFrameCheck（品質チェック）
│   └── useScanApi（API通信）
├── CameraView（カメラ映像表示）
├── ScanGuide（ガイド表示）
├── ScanOverlay（検出中エフェクト）
└── ResultCard（結果カード）
```

### ガイドメッセージ

| 状態 | メッセージ |
|---|---|
| idle | バーコードまたは原材料欄にかざしてください |
| detecting | 読み取り中... |
| stable | 読み取り中... |
| processing | 確認中... |
| error（dark） | 明るい場所に移動してください |
| error（incomplete） | ラベル全体が映るように離してください |
| error（api_error） | 通信エラーが発生しました。再度お試しください |

---

## 11. バックエンドAPI設計

### エンドポイント一覧

```
GET  /scan/presigned-url     S3 Presigned URL発行
POST /scan/barcode           JANコード照合
POST /scan/ocr               OCR + アレルギー判定
GET  /history                履歴一覧取得
POST /history                履歴保存
GET  /users/me               ユーザー設定取得
PUT  /users/me               アレルギー設定更新
```

### OCRエンドポイントのフロー
```
クライアント
  ↓ GET /scan/presigned-url → S3 URL取得
  ↓ PUT S3（画像を直接アップロード）
  ↓ POST /scan/ocr { s3_key }

NestJS
  ↓ S3から画像取得
  ↓ Geminiに送信（OCR+判定）
  ↓ incomplete:true → 即エラー返却
  ↓ DBに保存（scan_count更新）
  ↓ scan_historyに記録
  → クライアントに結果返却
```

---

## 12. 履歴画面設計

### 画面構成
```
┌──────────────────────┐
│ 🕐 スキャン履歴        │
│                      │
│ [全て][NG][注意][OK]  │  ← フィルタータブ
│                      │
│ ─── 今日 ──────────  │
│ 📍 セブン渋谷店 18:23 │
│ チキン南蛮弁当  ¥298  │  ← 価格（ラベルにある場合のみ）
│ 🔴 カゼイン検出       │
│                      │
│ 📍 東京都渋谷区1-1    │  ← 未登録店舗は住所表示
│ 惣菜（ラベル画像）¥580│
│ ✅ 該当なし           │
│                      │
│ ─── 昨日 ──────────  │
│ ...                  │
└──────────────────────┘
```

### 店舗名のフォールバック設計

```
GPS座標取得
      ↓
Google Places API検索（半径100m）
      ↓
ヒット   → 「セブンイレブン渋谷店」
      ↓
ミス     → Google Geocoding APIで逆ジオコーディング
           「東京都渋谷区渋谷1-1」（住所表示）
      ↓
GPS未取得 → 「📍 場所不明」
```

| ケース | 店舗名表示 | 価格表示 |
|---|---|---|
| 大手チェーン + バーコード | ✅ 店舗名 | △ 参考（楽天API） |
| 大手チェーン + 惣菜 | ✅ 店舗名 | ✅ OCRで取得 |
| 地域スーパー + 惣菜 | △ 住所表示 | ✅ OCRで取得 |
| GPS未取得 | ❌ 場所不明 | ✅ OCRで取得（ラベルあれば） |

### 価格表示ルール

```
price_confidence が high  → 価格表示
price_confidence が low   → 非表示（誤表示防止）
price_confidence が null  → 非表示（価格記載なし）
```

価格は空欄・ゼロ表示しない。表示できる場合のみ表示する。

### ページネーション設計

```sql
-- カーソルベースで20件ずつ取得
SELECT * FROM scan_histories
WHERE user_id = $1
  AND ($2 = 'all' OR judgment = $2)
  AND ($3::timestamp IS NULL OR scanned_at < $3)
ORDER BY scanned_at DESC
LIMIT 20
```

---

## 13. 設定画面設計

### 画面構成

```
┌──────────────────────┐
│ ⚙️ アレルギー設定      │
│                      │
│ ── 特定原材料（9品目）─│
│ ※表示義務あり         │
│                      │
│ 🥚 卵          [ON]  │
│   └ 一部含む警告 [ON] │
│ 🥛 乳          [ON]  │
│   └ 一部含む警告 [ON] │
│ 🦐 えび        [OFF] │
│  ...                 │
│                      │
│ ── 準ずるもの（20品目）│
│ ※表示推奨             │
│                      │
│ アーモンド     [OFF]  │
│  ...                 │
│                      │
│ ── その他設定 ───────  │
│ スキャン時バイブ [ON] │  ← Android のみ表示
│                      │
└──────────────────────┘
```

### 設定変更のロジック

```typescript
// アレルギーON/OFF
// ONにした瞬間 → partialAlertも自動ON
// OFFにした瞬間 → partialAlertも自動OFF
toggleAllergen(name)

// 一部含む警告のON/OFF
// enabled:false の場合は変更不可（グレーアウト）
togglePartial(name)
```

### 設定変更のスキャン即時反映

```
スキャン開始
      ↓
GET /users/me（TTL:5分でキャッシュ）
      ↓
取得した設定でGeminiプロンプトを動的生成
→ 有効なアレルギーのみプロンプトに含める
```

---

## 14. コスト試算

### MVP（100ユーザー/月）

| 項目 | 月額 |
|---|---|
| Gemini Flash（OCR） | 約$0.4 |
| Google Places API | 無料枠内（$200/月） |
| RDS t3.micro | 約$15 |
| AWS Lambda + S3 | 約$5 |
| ドメイン・SSL | 約$2 |
| **合計** | **約$22（約3,500円）** |

### スケール後の目安

| ユーザー数 | 月額概算 |
|---|---|
| 100人 | 約$22 |
| 1,000人 | 約$80（Aurora移行後） |
| 10,000人 | 約$400 |

---

## 15. 法務・免責設計

### 基本方針

```
このアプリの法的ポジション：
「補助ツール」であり「医療機器」ではない
        ↓
判断はあくまでユーザー自身が行う
アプリは情報提供のみ
```

### 免責事項の表示タイミング

```
初回起動時：
  利用規約・免責事項に同意（1回のみ）

スキャン結果画面（毎回）：
  「⚠️ 購入前にラベルの実物も必ずご確認ください」

NG判定時（毎回）：
  「このアプリの判定は参考情報です。
   アナフィラキシーのリスクがある方は
   必ず実物ラベルでご確認ください」
```

### 利用規約の必須項目

```
① 本アプリは食品アレルギー情報の参考提供を目的とし、
  医療的診断・アドバイスを行うものではない

② OCRの読み取り精度・DBの情報の正確性を保証しない

③ 本アプリの判定結果に基づく行動により生じた
  いかなる損害についても責任を負わない

④ アレルギー情報は個人の健康情報であり、
  第三者への提供・販売は行わない

⑤ 商品の原材料はリニューアル等により変更される場合があり、
  最新情報はラベル実物で確認すること
```

### 個人情報・プライバシー設計

アレルギー情報は**要配慮個人情報**（個人情報保護法）に該当します。

```
取得時：明示的な同意が必要
保管時：RDSの暗号化設定（必須）
利用時：アプリ内のアレルギー判定のみに限定
第三者提供：原則禁止
削除：ユーザーがデータ削除を要求できる機能が必要
```

### プライバシーポリシーの必須記載

```
・取得する情報の種類
  （デバイスID・アレルギー設定・位置情報・スキャン履歴）
・利用目的（アレルギー判定・履歴表示のみ）
・第三者提供しない旨
・データ保管場所（AWS東京リージョン）
・データ削除方法
・お問い合わせ窓口
```

---

## 16. オンボーディング設計

### 基本方針

```
初回起動からスキャンまで1分以内に完了させる
登録の手間で離脱させない
```

### 画面フロー

```
起動
  ↓
【画面1】ようこそ（1画面のみ）
  「バーコードをかざすだけで
   アレルギー成分を即チェック」
  [はじめる]

  ↓
【画面2】アレルギー設定（スキップ不可）
  特定原材料9品目をタップで選択
  準ずるもの20品目は「もっと見る」で展開
  ※設定なしだとスキャンしても何も検出されないため必須
  [次へ]

  ↓
【画面3】一部含む警告の設定
  ONにした品目だけ表示
  「一部に含む場合も警告しますか？」
  デフォルトON・変更可能
  [設定完了]

  ↓
【画面4】免責同意（スキップ不可）
  ・参考情報である旨
  ・実物ラベル確認の推奨
  ・利用規約・プライバシーポリシーへのリンク
  [同意してはじめる]

  ↓
スキャン画面（メイン画面）
```

### 設計のポイント

```
画面2をスキップ不可にする理由：
  設定なし → スキャンしても何も検出されない
  → 「使えないアプリ」と思われて離脱
  → 強制設定の方がユーザーのため

画面4を最後にする理由：
  最初に規約を見せると離脱する
  設定完了後なら読む気になりやすい
```

---

## 17. SNS共有設計

### 共有できる条件

```
✅ OK判定の商品のみ共有可能
❌ NG・一部含む判定は共有不可
   （誤情報拡散・風評被害リスク）
```

### 優先プラットフォーム

```
① X（旧Twitter）：アレルギーコミュニティでの拡散力
② LINE          ：家族・友人への個人的な共有
③ Instagram     ：Phase2以降で検討
```

### 共有コンテンツ設計

**共有テキスト（自動生成）**
```
【アレルギーチェック済み✅】
セブン チキン南蛮弁当  ¥298
卵・乳アレルギーでも食べられます！
#アレルギー #アレルギーフレンドリー
[アプリ名] で確認
```

**OGP画像**
```
┌──────────────────────┐
│  ✅ アレルギーチェック済み│
│                      │
│  チキン南蛮弁当        │
│  ¥298（税抜）         │  ← 価格（取得できた場合のみ表示）
│  📍 セブン渋谷店       │
│                      │
│  卵 ✅  乳 ✅  小麦 ✅  │
│                      │
│       [アプリ名]      │  ← ロゴで自然にブランド露出
└──────────────────────┘
```

価格表示ルール（OGP画像も同様）：
```
price_confidence が high  → 「¥298（税抜）」表示
price_confidence が low   → 非表示
price_confidence が null  → 非表示
```

### OGP画像の生成方法

```
Next.jsの @vercel/og を使用
        ↓
スキャン結果のJSONを渡すだけで動的生成
        ↓
追加サーバーコスト不要
```

### 共有ボタンの設置場所

```
結果カード（OK判定時のみ表示）
  ↓
[X でシェア] [LINEで送る]
  ↓
タップ → OGP画像付きで共有画面が開く
```

---

## 18. 開発ロードマップ

### Phase 1：MVP（8週間）

```
Week 1-2：カメラ + バーコードスキャン + Open Food Facts照合
Week 3-4：OCR + Gemini判定 + 自社DB保存
Week 5  ：履歴 + 店舗名取得（Google Places）
Week 6  ：アレルギー設定 + 判定UI
Week 7-8：PWAマニフェスト + テスト（奥さんに使ってもらう）
```

### Phase 2：スイッチングコストを作る
- スキャン履歴の充実
- 家族プロフィール管理
- セーフリスト / NGリスト
- SNS共有機能

### Phase 3：エコシステム化
- 飲食店マップ連携
- 食品メーカーへのデータ提供
- 保育園・学校向けBtoB展開

---

## 19. リスクと対策

| リスク | 対策 |
|---|---|
| OCRの誤読による見逃し | 安全側に倒す設計 + 生テキスト常時表示 + 実物確認を促すUI |
| 商品リニューアルによる古いDB | expires_at + scan_count連動の鮮度管理 |
| 競合がAI機能を後追い | 先に惣菜ユーザーの習慣を獲得・自社DB資産化 |
| iOSバイブ未対応 | 視覚（成分ごとの🔴🟡✅）で代替。ネイティブ移行で解決 |
| 誤情報による健康被害 | 「実物ラベル確認」を常時表示・免責事項明記 |
