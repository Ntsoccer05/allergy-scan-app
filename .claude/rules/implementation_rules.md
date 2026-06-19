# 実装時の固有制約

## 安全設計の絶対ルール（アレルギーアプリ固有）

### 1. 判定不明は必ず安全側に倒す

- `confidence: high` → 通常判定表示
- `confidence: medium` → 判定は返すが「⚠️ 一部読み取りにくい箇所があります。ラベルも確認してください」を追加表示
- `confidence: low` → 「もう少し近づけて再スキャンしてください」を表示。判定を返さない
- `results[].judgment === '判定不能'` → 再スキャン誘導。「なし」として扱わない
- `incomplete: true` → 即エラー返却。部分的な判定をしない
- OCR が読み取れなかった文字は `?` で表現。推測で補完しない

### 1-a. detection_type 別の表示ルール

OCR レスポンスの `results[].detection_type` に応じて UI 表示を変える。

| detection_type | 意味 | 表示 |
|---|---|---|
| `contains` | 原材料として含む | 🔴 NG |
| `partial` | 一部に含む（一括表示） | 🟡 注意 |
| `may_contain` | 製造ラインのコンタミ（注意喚起） | 🟠 注意喚起 |

`highlights[]` 配列の `judgment` フィールドも同じ値を使う:
- `judgment: 'ng'` → 🔴（`detection_type: 'contains'` の成分テキスト）
- `judgment: 'partial'` → 🟡（一括表示パターンのテキスト）
- `judgment: 'may_contain'` → 🟠（製造ライン注意喚起テキスト）

`may_contain` は `contains` / `partial` と明確に区別すること（製造ラインのコンタミは原材料への直接混入ではない）。

### 2. raw_text を必ず画面に表示する

OCR 結果の `raw_text` はユーザーが「アプリが読んだ文字」を確認できるよう、必ず画面に表示する（「原材料を確認する」ボタンで展開等）。省略禁止。

### 3. 免責 UI は必ず表示する

| 画面 | 表示内容 | 省略可否 |
|---|---|---|
| スキャン結果（常時） | 「⚠️ 購入前にラベルの実物も確認ください」 | 省略不可 |
| NG 判定時（毎回） | 「このアプリの判定は参考情報です。アナフィラキシーのリスクがある方は必ず実物ラベルでご確認ください」 | 省略不可 |
| オンボーディング（1回） | 利用規約・免責事項への同意 | スキップ不可 |

### 4. OK 判定のみ SNS 共有可能

NG・一部含む判定の商品は共有ボタンを表示しない。誤情報の拡散・風評被害防止のため。

---

## スキャン UX の制約

### カメラ制御

- シャッター音は鳴らさない（動画フレームキャプチャで実現）
- フラッシュライトは使用しない（コンビニ・スーパーでの迷惑回避）
- 暗い環境での自動フラッシュ ON は禁止。「明るい場所に移動してください」と表示するのみ
- フォーカスエリアは画面中央に強制指定する（ピントずれ対策）

### タップ撮影フロー（手動キャプチャ・確認画面なし）

```
idle（カメラ映像ライブ表示 + 撮影ボタン）
    ↓ ユーザーが撮影ボタンをタップ（確認プレビューなしで即時処理）
バーコード検出（ZXing・フレーム内に JAN があれば POST /scan/barcode）
    ↓ 未検出 or found:false（JAN は OCR に引き継いで JAN キャッシュ保存）
processing（リサイズ → S3 PUT → POST /scan/ocr-stream）
    ↓
result（結果カードスライドイン）
```

- 撮影前のガイドは「バーコードまたは原材料欄にかざしてください」のみ表示
- タップ後の確認プレビュー（撮り直す / 確定する）は**廃止済み**（UX 改善で即時処理に変更）
- 自動キャプチャ・フレーム品質チェック（3フレーム連続 OK）は使用しない
- カメラかざし中もバーコードを 200ms 間隔で自動検出する（tick）

### エラー時の状態遷移ルール

```
api_error  → idle（ユーザー操作が必要なため自動リトライしない）
incomplete → idle（ガイド表示してユーザーに撮り直しを促す）
```

---

## バックエンド実装の制約

### Lambda の制約

- Lambda のペイロード制限（6MB）のため、画像データは Lambda 経由で受け取らない
- 画像は必ず Presigned URL でクライアントから S3 に直接アップロードする
- Lambda の再起動でメモリキャッシュがリセットされることを前提に設計する（TTL: 60 秒以内）

### Gemini API の呼び出し制約

- ユーザーが有効にしたアレルギーのみをプロンプトに含める（全 29 品目を常に渡さない）
- `exclude` 型の成分は検出対象に含めず、誤検出防止リストとして別途渡す
- Gemini のレスポンスは必ず JSON 形式を指定し、`OcrResponse` 型で受け取る

### 食品表示法の解釈（OCR 判定に関わる知識）

**繰り返し省略ルール（食品表示基準 別添アレルゲン表示）**:
同一アレルゲンが複数の原材料に含まれる場合、最初の1回のみ括弧付き表記し、以降を省略することが食品表示法上認められている。
例: `チーズ（乳成分を含む）、バター、生クリーム` → 乳成分は「チーズ」にのみ括弧あり。バター・生クリームには括弧なし（省略）。
→ Gemini はアレルゲン宣言欄（特定原材料等 N品目中: ○○, △△）と原材料名セクションの**両方**を参照するため、省略されていても宣言欄から検出できる。OCR 判定が `なし` になっているのに宣言欄に記載があるケースは「省略ルールの誤判定」の可能性がある。

**注意喚起表示の法的形式（コンタミネーション警告）**:
製造ライン経由のコンタミ注意書きは食品表示基準で記載形式が定められている。
- ✅ 合法: `「本製品の製造ラインでは〜を含む製品も製造しています」`
- ✅ 合法: `「〜を含む製品と共通の設備で製造しています」`
- ❌ 違反（法令非準拠）: `「〜が入っているかもしれません」`
→ OCR で読み取った注意書きが法令非準拠の形式でも `may_contain` として正しく判定する（表示形式の妥当性チェックは OCR の責務外）。
→ `detection_type: 'may_contain'` は製造ラインのコンタミであり、原材料への直接混入（`contains`）と区別して 🟠 表示する。

### Gemini プロンプトの変更時は必ず回帰検証する（⚠️ 安全設計）

プロンプト（`backend/src/scan/prompts/*.md`）は判定品質に直結するクリティカル資産。変更したら必ず:

```
pnpm --filter backend exec ts-node --project tsconfig.json scripts/prompt-consistency-test.ts
```

- `docs/assets/` の実画像 × 5回ずつ実行し、画像ごとに5回の判定が一致すること・変更前と判定が劣化していないことを確認する
- 環境変数 `IMAGES_DIR` で画像ディレクトリ、`REPORT_NAME` でレポート名を差し替え可能
- Gemini 無料枠（15回/分）対策のスロットリング内蔵。検出消失（特に製造ライン注意書き）がないかを必ず見る

### データ保存の制約

- スキャン結果は `products` テーブルに UPSERT する（`ON CONFLICT (id_type, id_value)` を使う）
- UPSERT 時は `scan_count` を +1、`updated_at` を更新、`expires_at` を再計算する
- 惣菜の場合のみ S3 に thumbnail を保存する（JANコード商品は保存しない）

### スキャン日次上限制約

- スキャン回数は `user_daily_scans` テーブルで per-user/日 単位に管理する
- 無料プラン: `plans.daily_scan_limit`（デフォルト 20 回/日）を超えたら 429 を返す
- プレミアムプラン: `plans.daily_scan_limit`（50 回/日）
- `DailyScanLimitGuard` で `POST /scan/ocr` と `POST /scan/barcode` に適用する
- 上限チェックは `user_daily_scans` の `(user_id, scan_date)` UNIQUE 制約を利用した UPSERT で行う

### レートリミット制約

- 認証系エンドポイントには専用の厳しいレートリミットを設ける
- 通常エンドポイントのデフォルトレートリミットより必ず厳しく設定すること（ブルートフォース防止）

---

## 個人情報・プライバシーの制約

アレルギー情報は**要配慮個人情報**（個人情報保護法）に該当する。

- RDS は暗号化設定必須（`storage_encrypted = true`）
- `users.allergies` データは外部 API に渡さない（Gemini には成分リストのみを渡す）
- ログにアレルギー設定の具体値を出力しない（マスク処理が必要）
- ユーザーのデータ削除要求に応じるため、`user_id` 単位でデータを削除できる仕組みを持つ

---

## DB 運用制約

### マイグレーション

- カラム追加は `NULL` 許容 or DEFAULT 付きで行う（ダウンタイムなし）
- `allergens` テーブルへの品目追加はマイグレーション不要（INSERT のみ）
- 品目廃止は `deleted_at = NOW()` に更新する（DELETE しない。既存ユーザーの設定データが壊れる）

### インデックス

```sql
-- 必須インデックス（廃止・変更不可）
CREATE INDEX scan_histories_user_idx ON scan_histories(user_id, scanned_at DESC);
CREATE INDEX scan_histories_store_idx ON scan_histories(store_name, scanned_at DESC);
CREATE INDEX allergens_category_idx ON allergens(category, display_order);
CREATE INDEX allergen_components_name_idx ON allergen_components(allergen_name);
CREATE INDEX allergen_components_type_idx ON allergen_components(allergen_name, component_type);
```

> `products.allergens` への GIN インデックスは OCR/バーコードスキャンのたびに UPDATE が走るため書き込みコストが高い。現行クエリパターンでも使われないため省略。「アレルギーで商品横断検索」機能を追加する際に `CREATE INDEX CONCURRENTLY` で無停止追加する。

---

## iOS / Android の差異対応

| 機能 | iOS PWA | Android PWA | ネイティブ移行後 |
|---|---|---|---|
| バイブレーション | 非対応（Vibration API なし） | 対応済み | 全対応 |
| 代替手段（iOS） | 視覚（🔴🟡✅）で代替 | — | — |

iOS で `navigator.vibrate()` を呼ぶコードを書かない。バイブレーションが必要な場合は Platform 判定を入れる。

---

## PWA → React Native 移行を見据えた制約

- API は NestJS に完全分離する（フロントに API ロジックを書かない）
- カメラ処理は `useCamera` Hook に切り出す（コンポーネントに埋め込まない）
- UI はモバイルファーストで実装する（PC レイアウトは後回し）
- React Native 移行時に `useCamera` の内部実装のみ置き換えれば済む設計にする
