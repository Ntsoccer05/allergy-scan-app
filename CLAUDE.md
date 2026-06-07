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
| `chrome_testing.md` | Chrome 実機チェック手順・省略不可条件（UI/API/認証変更時） |

## APIエンドポイント一覧（概要）

詳細は `architecture.md` および `docs/design/api.md` を参照。

**認証方式（現行）**: Cookie ベース認証（HttpOnly Cookie）。`@Public()` デコレータで認証バイパス。`/admin/*` は Supabase Auth `app_metadata.role === 'admin'` を追加チェック。Phase 1（pending）で JWT Bearer Token に統一予定。

```
POST /users/me/init          Supabase JWT 初回ユーザー登録（Bearer Token 必須）
GET  /users/me               ユーザー設定取得（TTL: 5分キャッシュ）
PUT  /users/me               アレルギー設定更新
DELETE /users/me             ユーザーデータ削除（要配慮個人情報の削除権）
POST /users/me/reset-data    アレルギー設定・履歴のみリセット（users/user_daily_scans は保持）
POST /users/me/backup-code   引継ぎ用バックアップコード発行（30日有効・再発行で旧コード無効化）
POST /users/me/restore       バックアップコードでアレルギー設定を引継ぎ
GET  /scan/presigned-url     S3 Presigned URL 発行
POST /scan/barcode           JANコード照合
POST /scan/ocr               OCR + アレルギー判定（日次スキャン上限チェック）
GET  /history                履歴一覧（カーソルページネーション）
POST /history                履歴保存
PATCH /history/:id           履歴編集（product_name / store_name / memo / is_public / thumbnail_url）
DELETE /history/:id          履歴削除
DELETE /history/bulk         履歴一括削除（ids: string[]・最大100件）
GET  /public/history         みんなのスキャン一覧（認証不要・カーソルページネーション）
GET  /public/history/digest  みんなのスキャン新着件数（ポーリング用・認証不要）
GET  /allergens              アレルギーマスター取得
GET  /admin/users            ユーザー一覧（admin 専用）
GET  /admin/stats            統計情報（admin 専用）
PATCH /admin/users/:id/plan  プラン手動変更（admin 専用）
POST /webhooks/stripe        Stripe Webhook 受信（@Public）
```

## タスク・要求の起票

- タスク: `.claude/tasks/{5桁連番}_{英語キーワード}.md`
- 採番: 既存の最大連番 +1（初回は `00001`）
- 完了タスクは `.claude/tasks/__done/` へ手動移動

## 実装計画（Plans）

- 作成先: `.claude/plans/pending/YYYY-MM-DD-<feature-name>.md`
- 完了後: `.claude/plans/done/` へ移動
- 計画を書く際は `writing-plans` スキルを使用

## ワークフロースキル

Claude Code の `Skill` ツールで呼び出す。セッション開始時に `using-superpowers` が自動注入される。

**ブランチ運用:** ブランチの作成・切り替えはユーザー自身が行う。Claude はブランチを作成・削除しない。

| スキル | 使用タイミング |
|---|---|
| `using-superpowers` | セッション開始時に自動ロード — スキルの使い方を確立 |
| `brainstorming` | 機能追加・設計変更など実装前に必ず使用 |
| `writing-plans` | 仕様/要件がある多ステップタスクの計画作成 |
| `executing-plans` | 書かれた実装計画をサブエージェントレビューつきで実行 |
| `subagent-driven-development` | 計画の独立タスクをサブエージェントで実行（推奨） |
| `finishing-a-development-branch` | 実装完了後 — テスト検証・ドキュメント更新・最終レビュー・PR |
| `systematic-debugging` | バグ・テスト失敗・予期しない動作に遭遇したとき |
| `verification-before-completion` | 完了主張やコミット・PR 作成の前に必ず実行 |
| `test-driven-development` | 機能追加・バグ修正で実装コードを書く前 |
| `dispatching-parallel-agents` | 2 件以上の独立タスクを並列処理するとき |
| `requesting-code-review` | タスク完了後やマージ前のコードレビュー依頼 |
| `receiving-code-review` | コードレビューフィードバックを受け取ったとき |
| `writing-skills` | 新しいスキルの作成・既存スキルの編集 |

## 詳細設計ドキュメント（人間向け参照）

- プロダクト概要・ロードマップ: `docs/product.md`
- スキャンUX・状態管理・キャッシュ: `docs/design/scan-ux.md`
- OCR安全設計・Geminiプロンプト: `docs/design/ocr.md`
- DB設計・テーブル定義・初期データ: `docs/design/database.md`
  （allergens / allergen_components / products / scan_histories
   / users / plans / user_subscriptions / user_daily_scans / stripe_customers）
- APIエンドポイント設計: `docs/design/api.md`
- 履歴・設定・オンボーディング・SNS共有・引き継ぎ・i18n: `docs/design/screens.md`
- 法務・免責・プライバシー: `docs/design/legal.md`
