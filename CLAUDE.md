# アレルギースキャンアプリ

## 技術スタック

- Frontend: Next.js (PWA) / TypeScript
- Backend: NestJS on AWS Lambda（コンテナデプロイ）
- DB: PostgreSQL（RDS t3.micro → PMF後にAurora Serverless v2）
- OCR: Gemini Flash API
- バーコード: ZXing.js（端末完結・サーバー不要）
- 画像ストレージ: S3 Presigned URL
- 位置情報: Google Places API / Geocoding API

## ディレクトリ構成

```
/
├── frontend/   Next.js PWA
│   ├── app/
│   │   ├── scan/
│   │   ├── history/
│   │   └── settings/
│   └── hooks/
│       ├── useCamera.ts
│       ├── useBarcode.ts
│       ├── useFrameCheck.ts
│       └── useScan.ts
└── backend/    NestJS
    └── src/
        ├── scan/
        ├── products/
        ├── history/
        ├── allergens/
        ├── users/
        └── gemini/
```

## コマンド

```
# 型チェック
pnpm -r typecheck
pnpm --filter frontend typecheck
pnpm --filter backend typecheck

# ユニットテスト
pnpm -r test
pnpm --filter frontend test
pnpm --filter backend test

# 開発サーバー
pnpm --filter frontend dev
pnpm --filter backend start:dev
```

## 開発の進め方（バーティカルスライス）

1機能をDB→API→フロントまで貫通させてから次に進む。

```
Week1：バーコードスキャン（DB→API→フロント）
Week2：OCRスキャン（DB→API→フロント）
Week3：履歴機能（DB→API→フロント）
Week4：設定・オンボーディング
```

## 絶対に守る設計原則

### OCR安全設計（命に関わる）
- 判定は必ず安全側に倒す（迷ったらNG）
- raw_textを必ず画面に表示する
- 「購入前にラベルの実物も必ずご確認ください」を全判定で常時表示
- incomplete:trueなら必ず再スキャンを促す
- 詳細: `.claude/rules/implementation_rules.md`

### インフラ制約
- 画像はS3 Presigned URL経由（Lambda直接送信禁止・6MB制限回避）
- NestJSにはS3キーのみ渡す

### アレルギー判定
- allergen_componentsテーブルから動的生成（ハードコード禁止）
- 有効なアレルギーのみプロンプトに渡す
- 除外リスト（乳化剤・乳酸菌等）も必ずプロンプトに渡す

### 多言語対応（i18n）
- UIテキストをコンポーネントにハードコード禁止
- すべてのUIテキストはi18nキーで管理（`t('キー名')`）
- localesディレクトリにja/enのJSONを用意する

## 必須遵守ルール（詳細は `.claude/rules/` を参照。rules が docs より優先）

| ルールファイル | 内容 |
|---|---|
| `architecture.md` | 技術スタック・ディレクトリ構成・層境界・API一覧・キャッシュ構造 |
| `coding_rules.md` | 命名・型・エラー・ログ・コメント・i18n規約 |
| `anti_patterns.md` | 禁止パターン（安全設計違反・層違反・型抑制・i18nハードコード等） |
| `dry_principles.md` | 共通モジュール集約点・DRY チェックリスト |
| `patterns.md` | 確立済み実装パターン（スキャンフロー・UPSERT・judgment_type等） |
| `implementation_rules.md` | プロジェクト固有制約（Lambda制限・免責UI・OCR安全設計・個人情報等） |
| `database_design.md` | DB正規化方針（1NF〜5NF・無損失分解・非正規化の許容条件） |

## APIエンドポイント一覧（概要）

詳細は `architecture.md` および `docs/design/api.md` を参照。

```
POST /users/init             初回 Cookie 発行・users INSERT（初回アクセス時）
POST /users/backup-code      バックアップコード発行（Cookie 認証必須）
POST /users/restore          バックアップコードによるデバイス引き継ぎ（レートリミット: 60秒5回）
GET  /scan/presigned-url     S3 Presigned URL 発行
POST /scan/barcode           JANコード照合
POST /scan/ocr               OCR + アレルギー判定
GET  /history                履歴一覧（カーソルページネーション）
POST /history                履歴保存
DELETE /users/me             ユーザーデータ削除（要配慮個人情報の削除権）
GET  /users/me               ユーザー設定取得（TTL: 5分キャッシュ）
PUT  /users/me               アレルギー設定更新
GET  /allergens              アレルギーマスター取得
GET  /products/others        みんなのスキャン一覧（カーソルページネーション・Cookie 認証必須）
```

## タスク・要求の起票

- タスク: `.claude/tasks/{5桁連番}_{英語キーワード}.md`
- 採番: 既存の最大連番 +1（初回は `00001`）
- 完了タスクは `.claude/tasks/__done/` へ手動移動

## Claude Code 資産（エージェントパイプライン）

- `.claude/skills/run-harness-cycle/` — Planner→Generator→Evaluator ループ
- `.claude/agents/` — planner / generator / evaluator / spec-docs-syncer / static-test-runner

## 詳細設計ドキュメント（人間向け参照）

- プロダクト概要・ロードマップ: `docs/product.md`
- スキャンUX・状態管理・キャッシュ: `docs/design/scan-ux.md`
- OCR安全設計・Geminiプロンプト: `docs/design/ocr.md`
- DB設計・テーブル定義・初期データ: `docs/design/database.md`
  （allergens / allergen_components / products / scan_histories
   / users / backup_codes / judgment_reports）
- APIエンドポイント設計: `docs/design/api.md`
- 履歴・設定・オンボーディング・SNS共有・引き継ぎ・i18n: `docs/design/screens.md`
- 法務・免責・プライバシー: `docs/design/legal.md`
