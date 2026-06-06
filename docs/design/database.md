# データベース設計

## 構成
- **MVP段階**：RDS t3.micro（約$15/月）
- **PMF後**：Aurora Serverless v2（PostgreSQL）に移行

---

## テーブル一覧

| テーブル | 役割 |
|---|---|
| allergens | アレルギー・配慮成分マスター（29品目＋拡張） |
| allergen_components | 派生成分・除外リストマスター |
| products | 商品・アレルギー情報 |
| scan_histories | スキャン履歴 |
| users | ユーザー・アレルギー設定（Supabase Auth UID = id） |
| plans | プラン定義（free / premium） |
| user_subscriptions | ユーザーサブスクリプション |
| user_daily_scans | ユーザー日次スキャン数 |
| stripe_customers | Stripe 顧客情報 |

---

## allergensテーブル

```sql
CREATE TABLE allergens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(50) NOT NULL UNIQUE,
  display_name  VARCHAR(50) NOT NULL,
  category      VARCHAR(20) NOT NULL,
  -- 'mandatory'   : 特定原材料（9品目・表示義務あり）
  -- 'recommended' : 準ずるもの（20品目・表示推奨）
  -- 'addiction'   : 依存性への配慮（アルコール・カフェイン等）
  -- 'skin'        : 肌への配慮・アトピー（添加物・トランス脂肪酸等）
  judgment_type VARCHAR(20) NOT NULL DEFAULT 'allergy',
  -- 'allergy' : アレルギー → 🔴 NG / 🟡 注意（医学的根拠あり・強い表現）
  -- 'caution' : 配慮 → ⚠️ 含む / ✅ なし（個人の選好・弱い表現）
  -- ⚠️ judgment_type は Week4（設定・オンボーディング）で実装予定。schema.prisma への追加はそのタスクで行う
  display_order INTEGER NOT NULL,
  emoji         VARCHAR(10),
  deleted_at    TIMESTAMP,           -- ソフトデリート（NULL = 有効）
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX allergens_category_idx ON allergens(category, display_order);
```

### 初期データ（29品目＋拡張カテゴリー）

```sql
INSERT INTO allergens (id, name, display_name, category, judgment_type, display_order, emoji) VALUES
  -- 特定原材料（9品目・表示義務あり）
  (gen_random_uuid(), 'えび',          'えび',               'mandatory',   'allergy', 1,  '🦐'),
  (gen_random_uuid(), 'かに',          'かに',               'mandatory',   'allergy', 2,  '🦀'),
  (gen_random_uuid(), 'カシューナッツ', 'カシューナッツ',     'mandatory',   'allergy', 3,  '🌰'),
  (gen_random_uuid(), 'くるみ',        'くるみ',             'mandatory',   'allergy', 4,  '🌰'),
  (gen_random_uuid(), '小麦',          '小麦',               'mandatory',   'allergy', 5,  '🌾'),
  (gen_random_uuid(), 'そば',          'そば',               'mandatory',   'allergy', 6,  '🍜'),
  (gen_random_uuid(), '卵',            '卵',                 'mandatory',   'allergy', 7,  '🥚'),
  (gen_random_uuid(), '乳',            '乳',                 'mandatory',   'allergy', 8,  '🥛'),
  (gen_random_uuid(), '落花生',        '落花生（ピーナッツ）','mandatory',   'allergy', 9,  '🥜'),
  -- 準ずるもの（20品目・表示推奨）
  (gen_random_uuid(), 'アーモンド',       'アーモンド',       'recommended', 'allergy', 10, '🌰'),
  (gen_random_uuid(), 'あわび',           'あわび',           'recommended', 'allergy', 11, '🐚'),
  (gen_random_uuid(), 'いか',             'いか',             'recommended', 'allergy', 12, '🦑'),
  (gen_random_uuid(), 'いくら',           'いくら',           'recommended', 'allergy', 13, '🐟'),
  (gen_random_uuid(), 'オレンジ',         'オレンジ',         'recommended', 'allergy', 14, '🍊'),
  (gen_random_uuid(), 'キウイフルーツ',   'キウイフルーツ',   'recommended', 'allergy', 15, '🥝'),
  (gen_random_uuid(), '牛肉',             '牛肉',             'recommended', 'allergy', 16, '🥩'),
  (gen_random_uuid(), 'ごま',             'ごま',             'recommended', 'allergy', 17, '🌿'),
  (gen_random_uuid(), 'さけ',             'さけ',             'recommended', 'allergy', 18, '🐟'),
  (gen_random_uuid(), 'さば',             'さば',             'recommended', 'allergy', 19, '🐟'),
  (gen_random_uuid(), '大豆',             '大豆',             'recommended', 'allergy', 20, '🫘'),
  (gen_random_uuid(), '鶏肉',             '鶏肉',             'recommended', 'allergy', 21, '🍗'),
  (gen_random_uuid(), 'バナナ',           'バナナ',           'recommended', 'allergy', 22, '🍌'),
  (gen_random_uuid(), 'ピスタチオ',       'ピスタチオ',       'recommended', 'allergy', 23, '🌰'),
  (gen_random_uuid(), '豚肉',             '豚肉',             'recommended', 'allergy', 24, '🥩'),
  (gen_random_uuid(), 'マカダミアナッツ', 'マカダミアナッツ', 'recommended', 'allergy', 25, '🌰'),
  (gen_random_uuid(), 'もも',             'もも',             'recommended', 'allergy', 26, '🍑'),
  (gen_random_uuid(), 'りんご',           'りんご',           'recommended', 'allergy', 27, '🍎'),
  (gen_random_uuid(), 'やまいも',         'やまいも',         'recommended', 'allergy', 28, '🌿'),
  (gen_random_uuid(), 'ゼラチン',         'ゼラチン',         'recommended', 'allergy', 29, '🫙'),
  -- 依存性への配慮
  (gen_random_uuid(), 'アルコール',       'アルコール',       'addiction',   'caution', 30, '🍺'),
  (gen_random_uuid(), 'カフェイン',       'カフェイン',       'addiction',   'caution', 31, '☕'),
  (gen_random_uuid(), '糖質',             '糖質・甘味料',     'addiction',   'caution', 32, '🍚'),
  -- 肌への配慮（アトピー）
  (gen_random_uuid(), '食品添加物',       '食品添加物',       'skin',        'caution', 33, '⚗️'),
  (gen_random_uuid(), 'トランス脂肪酸',   'トランス脂肪酸',   'skin',        'caution', 34, '🛢️'),
  (gen_random_uuid(), '砂糖',             '砂糖',             'skin',        'caution', 35, '🍬');
```

---

## allergen_componentsテーブル

```sql
CREATE TABLE allergen_components (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allergen_name  VARCHAR(50) NOT NULL,
  canonical_name VARCHAR(100) NOT NULL,   -- 代表表記
  aliases        JSONB DEFAULT '[]',       -- 表記ゆれ・英語表記
  component_type VARCHAR(20) NOT NULL,
  -- 'direct'        : 直接表記（乳、牛乳 等）
  -- 'derivative'    : 派生成分（カゼイン、ホエイ 等）
  -- 'processed'     : 加工品（バター、チーズ 等）
  -- 'compound'      : 複合原材料（マヨネーズ（卵を含む）等）
  -- 'additive'      : 添加物（カゼインNa、グルテン 等）
  -- 'contains_label': 一括表示パターン（一部に〜を含む 等）
  -- 'exclude'       : 誤検出除外（乳化剤、乳酸菌 等）
  detection_type VARCHAR(20) DEFAULT 'contains',
  -- 'contains'      : 原材料として含む
  -- 'partial'       : 一部に含む（一括表示）
  -- 'may_contain'   : 製造ラインのコンタミ（注意喚起）
  risk_level     VARCHAR(10) DEFAULT 'medium',
  -- 'high'   : アナフィラキシーリスク高（加熱でも残存）
  -- 'medium' : 加工品・一般的な派生成分
  -- 'low'    : 抗原性低・摂取可能患者あり（醤油の小麦等）
  -- 'ignore' : 誤検出除外対象
  note           TEXT,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_allergen_name
    FOREIGN KEY (allergen_name)
    REFERENCES allergens(name)
    ON UPDATE CASCADE
);

CREATE INDEX allergen_components_name_idx
  ON allergen_components(allergen_name);
CREATE INDEX allergen_components_type_idx
  ON allergen_components(allergen_name, component_type);
```

### 初期データ（全アレルギー・拡張版）

```sql
-- =====================
-- 乳
-- =====================
INSERT INTO allergen_components
  (id, allergen_name, canonical_name, aliases, component_type, detection_type, risk_level, note) VALUES

  -- 直接表記
  (gen_random_uuid(), '乳', '乳',        '[]',                  'direct', 'contains', 'high', NULL),
  (gen_random_uuid(), '乳', '牛乳',      '["ミルク","milk"]',   'direct', 'contains', 'high', NULL),
  (gen_random_uuid(), '乳', '生乳',      '[]',                  'direct', 'contains', 'high', NULL),
  (gen_random_uuid(), '乳', '全粉乳',    '[]',                  'direct', 'contains', 'high', NULL),
  (gen_random_uuid(), '乳', '脱脂粉乳',  '[]',                  'direct', 'contains', 'high', NULL),
  (gen_random_uuid(), '乳', '乳成分',    '[]',                  'direct', 'contains', 'high', '法律上の正式表記・必須'),
  (gen_random_uuid(), '乳', '乳等を主要原料とする食品', '[]',   'direct', 'contains', 'high', '加工品の正式分類名'),

  -- 派生成分（risk_level: high）
  (gen_random_uuid(), '乳', 'カゼイン',            '["casein"]',              'derivative', 'contains', 'high', '加熱で変性しない・アナフィラキシーリスク'),
  (gen_random_uuid(), '乳', 'ホエイ',              '["ホエー","乳清","whey"]', 'derivative', 'contains', 'high', '乳清タンパク'),
  (gen_random_uuid(), '乳', 'ホエイパウダー',      '["乳清パウダー"]',        'derivative', 'contains', 'high', '乳清タンパク'),
  (gen_random_uuid(), '乳', 'ラクトアルブミン',    '[]',                      'derivative', 'contains', 'high', '乳清タンパク'),
  (gen_random_uuid(), '乳', 'たんぱく質濃縮ホエイパウダー', '["WPC","WPI"]',  'derivative', 'contains', 'high', NULL),
  (gen_random_uuid(), '乳', '濃縮ホエイ',          '[]',                      'derivative', 'contains', 'high', NULL),
  (gen_random_uuid(), '乳', 'ラクトース',          '["乳糖","lactose"]',      'derivative', 'contains', 'medium', '乳糖・精製度による'),

  -- 加工品
  (gen_random_uuid(), '乳', 'バター',              '["butter"]',              'processed',  'contains', 'high',   NULL),
  (gen_random_uuid(), '乳', 'チーズ',              '["cheese"]',              'processed',  'contains', 'high',   NULL),
  (gen_random_uuid(), '乳', 'アイスクリーム',      '[]',                      'processed',  'contains', 'high',   NULL),
  (gen_random_uuid(), '乳', '生クリーム',          '["クリーム","cream"]',    'processed',  'contains', 'high',   NULL),
  (gen_random_uuid(), '乳', '練乳',                '["加糖練乳","濃縮乳"]',   'processed',  'contains', 'high',   NULL),
  (gen_random_uuid(), '乳', 'ヨーグルト',          '["発酵乳"]',              'processed',  'contains', 'high',   NULL),
  (gen_random_uuid(), '乳', 'バターオイル',        '[]',                      'processed',  'contains', 'high',   NULL),

  -- 添加物
  (gen_random_uuid(), '乳', 'カゼインNa',          '["カゼインナトリウム"]',  'additive',   'contains', 'high',   '添加物表記'),
  (gen_random_uuid(), '乳', 'カゼインCa',          '[]',                      'additive',   'contains', 'high',   '添加物表記'),

  -- 一括表示パターン
  (gen_random_uuid(), '乳', '乳成分を含む',        '[]',                      'contains_label', 'partial', 'high',  '一括表示の正式表記'),
  (gen_random_uuid(), '乳', '一部に乳成分を含む',  '[]',                      'contains_label', 'partial', 'high',  NULL),
  (gen_random_uuid(), '乳', '乳由来',              '[]',                      'contains_label', 'partial', 'high',  '添加物の由来表記'),

  -- コンタミ（注意喚起）
  (gen_random_uuid(), '乳', '乳を含む製品を製造',  '[]',                      'contains_label', 'may_contain', 'medium', '製造ラインのコンタミ注意喚起'),

  -- 誤検出除外
  (gen_random_uuid(), '乳', '乳化剤',      '[]', 'exclude', 'contains', 'ignore', '乳由来でない場合が多い'),
  (gen_random_uuid(), '乳', '乳酸菌',      '[]', 'exclude', 'contains', 'ignore', '乳アレルギーと無関係'),
  (gen_random_uuid(), '乳', '乳酸',        '[]', 'exclude', 'contains', 'ignore', '乳アレルギーと無関係'),
  (gen_random_uuid(), '乳', 'カカオバター','[]', 'exclude', 'contains', 'ignore', '乳ではない・植物性');

-- =====================
-- 卵
-- =====================
INSERT INTO allergen_components
  (id, allergen_name, canonical_name, aliases, component_type, detection_type, risk_level, note) VALUES

  (gen_random_uuid(), '卵', '卵',           '["玉子","たまご","エッグ","egg"]', 'direct',     'contains', 'high',   NULL),
  (gen_random_uuid(), '卵', '卵黄',         '["egg yolk"]',                    'derivative', 'contains', 'high',   NULL),
  (gen_random_uuid(), '卵', '卵白',         '["egg white","albumin"]',         'derivative', 'contains', 'high',   NULL),
  (gen_random_uuid(), '卵', 'オボムコイド', '[]',                              'derivative', 'contains', 'high',   '加熱しても残るアレルギー・要注意'),
  (gen_random_uuid(), '卵', 'マヨネーズ',   '[]',                              'compound',   'contains', 'medium', '複合原材料・卵を含む'),
  (gen_random_uuid(), '卵', 'リゾチーム',   '[]',                              'additive',   'contains', 'high',   '卵白由来添加物'),
  (gen_random_uuid(), '卵', 'レシチン（卵由来）', '[]',                        'additive',   'contains', 'high',   '大豆由来は卵ではない'),
  (gen_random_uuid(), '卵', '卵を含む',     '[]',                              'contains_label', 'partial', 'high', '一括表示'),
  (gen_random_uuid(), '卵', '一部に卵を含む','[]',                             'contains_label', 'partial', 'high', NULL),
  (gen_random_uuid(), '卵', '卵殻カルシウム','[]',                             'exclude',    'contains', 'ignore', '抗原性ほぼなし');

-- =====================
-- 小麦（拡張版）
-- =====================
INSERT INTO allergen_components
  (id, allergen_name, canonical_name, aliases, component_type, detection_type, risk_level, note) VALUES

  (gen_random_uuid(), '小麦', '小麦',          '["wheat"]',              'direct',     'contains', 'high',   NULL),
  (gen_random_uuid(), '小麦', '小麦粉',        '["強力粉","薄力粉","中力粉","wheat flour"]', 'direct', 'contains', 'high', NULL),
  (gen_random_uuid(), '小麦', 'デュラム小麦',  '["デュラムセモリナ","durum"]','direct',  'contains', 'high',   'パスタ原料'),
  (gen_random_uuid(), '小麦', 'グルテン',      '["gluten"]',             'derivative', 'contains', 'high',   NULL),
  (gen_random_uuid(), '小麦', '麦芽',          '["malt"]',               'derivative', 'contains', 'medium', 'ビール・麦芽糖'),
  (gen_random_uuid(), '小麦', '麩',            '[]',                     'processed',  'contains', 'high',   NULL),
  (gen_random_uuid(), '小麦', 'パン粉',        '[]',                     'processed',  'contains', 'high',   NULL),
  (gen_random_uuid(), '小麦', 'しょうゆ',      '["醤油","soy sauce"]',   'processed',  'contains', 'low',    '抗原性低・摂取可能患者あり'),
  (gen_random_uuid(), '小麦', '味噌',          '[]',                     'processed',  'contains', 'low',    '抗原性低'),
  (gen_random_uuid(), '小麦', 'うどん',        '[]',                     'processed',  'contains', 'high',   NULL),
  (gen_random_uuid(), '小麦', 'グルテン（小麦由来）','[]',               'additive',   'contains', 'high',   '添加物表記'),
  (gen_random_uuid(), '小麦', 'ベーキングパウダー（小麦由来）','[]',     'additive',   'contains', 'medium', NULL),
  (gen_random_uuid(), '小麦', '小麦を含む',    '[]',                     'contains_label','partial','high',  '一括表示'),
  (gen_random_uuid(), '小麦', '一部に小麦を含む','[]',                   'contains_label','partial','high',  NULL);

-- =====================
-- 大豆（拡張版）
-- =====================
INSERT INTO allergen_components
  (id, allergen_name, canonical_name, aliases, component_type, detection_type, risk_level, note) VALUES

  (gen_random_uuid(), '大豆', '大豆',             '["soy","soybean"]',   'direct',     'contains', 'high',   NULL),
  (gen_random_uuid(), '大豆', '大豆たんぱく',     '["植物性たん白","植物性タンパク"]','derivative','contains','high',NULL),
  (gen_random_uuid(), '大豆', '豆腐',             '[]',                  'processed',  'contains', 'high',   NULL),
  (gen_random_uuid(), '大豆', '油揚げ',           '["厚揚げ"]',          'processed',  'contains', 'high',   NULL),
  (gen_random_uuid(), '大豆', '豆乳',             '[]',                  'processed',  'contains', 'high',   NULL),
  (gen_random_uuid(), '大豆', 'きなこ',           '["黄粉"]',            'processed',  'contains', 'high',   NULL),
  (gen_random_uuid(), '大豆', 'おから',           '[]',                  'processed',  'contains', 'medium', NULL),
  (gen_random_uuid(), '大豆', '湯葉',             '[]',                  'processed',  'contains', 'high',   NULL),
  (gen_random_uuid(), '大豆', '納豆',             '[]',                  'processed',  'contains', 'high',   NULL),
  (gen_random_uuid(), '大豆', 'みそ',             '["味噌"]',            'processed',  'contains', 'low',    '抗原性低'),
  (gen_random_uuid(), '大豆', 'しょうゆ（大豆）', '[]',                  'processed',  'contains', 'low',    '抗原性低・摂取可能患者あり'),
  (gen_random_uuid(), '大豆', '大豆油',           '[]',                  'processed',  'contains', 'low',    '高精製品は抗原性低'),
  (gen_random_uuid(), '大豆', 'レシチン（大豆由来）','["大豆レシチン"]', 'additive',   'contains', 'low',    '高精製品は抗原性低'),
  (gen_random_uuid(), '大豆', '大豆を含む',       '[]',                  'contains_label','partial','high',  '一括表示');

-- =====================
-- ナッツ系（拡張版）
-- =====================
INSERT INTO allergen_components
  (id, allergen_name, canonical_name, aliases, component_type, detection_type, risk_level, note) VALUES

  -- くるみ
  (gen_random_uuid(), 'くるみ', 'くるみ',       '["ウォールナッツ","walnut"]',  'direct', 'contains', 'high', NULL),
  (gen_random_uuid(), 'くるみ', 'ペカンナッツ', '["pecan"]',                   'direct', 'contains', 'high', 'くるみの近縁種・交差反応あり'),
  (gen_random_uuid(), 'くるみ', 'くるみを含む', '[]',                          'contains_label','partial','high',NULL),

  -- カシューナッツ
  (gen_random_uuid(), 'カシューナッツ', 'カシューナッツ', '["cashew","カシュー"]', 'direct', 'contains', 'high', NULL),
  (gen_random_uuid(), 'カシューナッツ', 'カシューペースト','[]',                  'processed','contains','high',NULL),

  -- アーモンド
  (gen_random_uuid(), 'アーモンド', 'アーモンド', '["almond"]',                 'direct',    'contains', 'high', NULL),
  (gen_random_uuid(), 'アーモンド', 'アーモンドプードル','["アーモンドパウダー"]','processed','contains', 'high', 'アーモンドの粉末'),
  (gen_random_uuid(), 'アーモンド', 'アーモンドミルク','[]',                    'processed', 'contains', 'high', NULL),

  -- ピスタチオ
  (gen_random_uuid(), 'ピスタチオ', 'ピスタチオ', '["pistachio"]',              'direct',    'contains', 'high', NULL),
  (gen_random_uuid(), 'ピスタチオ', 'ピスタチオペースト','[]',                   'processed', 'contains', 'high', NULL),

  -- マカダミアナッツ
  (gen_random_uuid(), 'マカダミアナッツ', 'マカダミアナッツ', '["macadamia"]',  'direct',    'contains', 'high', NULL),

  -- ヘーゼルナッツ（輸入菓子で多い・準ずるもの未満だが追加）
  (gen_random_uuid(), 'アーモンド', 'ヘーゼルナッツ', '["hazelnut","榛の実"]',  'direct',    'contains', 'high', '輸入菓子で頻出・交差反応注意'),
  (gen_random_uuid(), 'アーモンド', 'ブラジルナッツ', '["brazil nut"]',         'direct',    'contains', 'high', '輸入品で注意');
```

---

## productsテーブル

```sql
CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_type       VARCHAR(10) NOT NULL,   -- 'jan' or 'hash'
  id_value      VARCHAR(255) NOT NULL,
  product_name  VARCHAR(255),
  store_name    VARCHAR(255),           -- 惣菜の場合のみ
  image_url     VARCHAR(500),           -- 商品画像URL
  -- バーコード商品：楽天API等から取得した商品画像URL
  -- 惣菜（OCR）：S3に保存したキャプチャ画像URL
  allergens     JSONB NOT NULL DEFAULT '{}',
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

-- GIN インデックス（products.allergens）は省略
-- スキャンのたびに allergens カラムが UPDATE されるため書き込みコストが高い
-- 「アレルギーで商品横断検索」を追加する際に CREATE INDEX CONCURRENTLY で無停止追加する
```

### 商品IDの2階層管理

| id_type | 対象 | キー例 |
|---|---|---|
| jan | メーカー製加工食品 | `jan#4901234567890` |
| hash | 惣菜・バーコードなし商品 | `hash#a3f8c2d1...` |

label_hashの生成ロジック：
```
「商品名 + 店舗名 + 原材料の先頭50文字」をハッシュ化
```

### expires_at（鮮度管理）

| scan_count | 有効期限 |
|---|---|
| 1〜5件 | 30日 |
| 6〜20件 | 90日 |
| 21件〜 | 180日 |

---

## scan_historiesテーブル

```sql
CREATE TABLE scan_histories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR(255) NOT NULL,
  product_id    UUID REFERENCES products(id),
  product_name  VARCHAR(255),           -- 履歴一覧の高速表示用（JOIN不要）
  judgment      VARCHAR(10) NOT NULL,   -- 'ng' / 'partial' / 'ok'
  detected      JSONB DEFAULT '[]',
  location      JSONB,
  -- {
  --   "store_name": "セブンイレブン渋谷店",
  --   "lat": 35.658,
  --   "lng": 139.701
  -- }
  thumbnail_url  VARCHAR(500),          -- 惣菜のみ S3 キー
  ocr_image_url  VARCHAR(500),          -- OCR スキャン画像 S3 キー
  is_public      BOOLEAN DEFAULT true,  -- みんなの履歴に公開するか
  memo           TEXT,                  -- ユーザーメモ（最大500文字）
  scanned_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX scan_histories_user_idx ON scan_histories(user_id, scanned_at DESC);
-- location JSONB 内の store_name を対象にした関数インデックス（migration SQL 手動編集）
-- CREATE INDEX scan_histories_store_idx ON scan_histories((location->>'store_name'), scanned_at DESC);
```

---

## usersテーブル

```sql
CREATE TABLE users (
  id           VARCHAR(255) PRIMARY KEY,  -- Supabase Auth UID
  allergies    JSONB NOT NULL DEFAULT '{}',
  -- {
  --   "乳": { "enabled": true,  "partialAlert": true },
  --   "卵": { "enabled": true,  "partialAlert": true },
  --   "小麦": { "enabled": false, "partialAlert": false }
  -- }
  -- ※キーはallergensテーブルのnameと対応
  locale       VARCHAR(10) DEFAULT 'ja',  -- 多言語対応用（'ja' / 'en' 等）
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);
```

---

## plansテーブル

```sql
CREATE TABLE plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(50) NOT NULL UNIQUE,  -- 'free' | 'premium'
  display_name     VARCHAR(100) NOT NULL,
  daily_scan_limit INT NOT NULL,                 -- 日次スキャン上限（free=50, premium=無制限等）
  price_monthly_jpy INT DEFAULT 0,
  price_yearly_jpy  INT DEFAULT 0,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);
```

---

## user_subscriptionsテーブル

```sql
CREATE TABLE user_subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id                UUID NOT NULL REFERENCES plans(id),
  status                 VARCHAR(20) DEFAULT 'active',  -- 'active' | 'canceled' | 'past_due'
  current_period_start   TIMESTAMP DEFAULT NOW(),
  current_period_end     TIMESTAMP,
  stripe_subscription_id VARCHAR(255),
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);

CREATE INDEX user_subscriptions_user_idx ON user_subscriptions(user_id, status);
```

---

## user_daily_scansテーブル

```sql
CREATE TABLE user_daily_scans (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scan_date  DATE NOT NULL,
  scan_count INT DEFAULT 0,

  UNIQUE(user_id, scan_date)
);
```

---

## stripe_customersテーブル

```sql
CREATE TABLE stripe_customers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            VARCHAR(255) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) NOT NULL UNIQUE,
  created_at         TIMESTAMP DEFAULT NOW()
);
```

---

## judgment_reportsテーブル（誤判定報告）

```sql
CREATE TABLE judgment_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      VARCHAR(255) NOT NULL,
  product_id   UUID REFERENCES products(id),
  scan_history_id UUID REFERENCES scan_histories(id),
  reported_judgment VARCHAR(10) NOT NULL,
  -- ユーザーが「正しい」と思う判定
  -- 'ng' / 'partial' / 'ok'
  comment      TEXT,            -- 任意コメント
  status       VARCHAR(20) DEFAULT 'pending',
  -- 'pending'  : 未確認
  -- 'confirmed': 確認済み・DB修正完了
  -- 'rejected' : 却下（ユーザーの誤解等）
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX judgment_reports_product_idx
  ON judgment_reports(product_id, status);
```

### 報告ボタンのUI

```
スキャン結果画面の下部（毎回表示）
  ↓
「判定が違う場合はこちら」（小さめのテキストリンク）
  ↓
【正しい判定を選択】
  ○ 含む
  ○ 一部含む
  ○ 含まない
  コメント（任意）
  [送信]
```

### 管理側の優先確認ロジック

```sql
-- scan_countが多い商品から優先確認
SELECT
  p.product_name,
  p.scan_count,
  COUNT(jr.id) as report_count,
  MODE() WITHIN GROUP (ORDER BY jr.reported_judgment) as majority_judgment
FROM judgment_reports jr
JOIN products p ON p.id = jr.product_id
WHERE jr.status = 'pending'
GROUP BY p.id, p.product_name, p.scan_count
ORDER BY p.scan_count DESC, report_count DESC;
```

---

## 法改正時の対応

```
新しい品目が追加：
  → allergensにINSERT
  → allergen_componentsに派生成分をINSERT
  → デプロイ不要・即反映

品目が廃止：
  → is_active = false に更新
  → 設定画面から非表示になるだけ
  → 既存ユーザーの設定データには影響なし
```
