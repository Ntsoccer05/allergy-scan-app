# アレルギースキャンアプリ

食品ラベルをスキャンしてアレルゲンを判定する PWA。
Next.js (frontend) + NestJS on AWS Lambda (backend) + PostgreSQL + Gemini Flash API (OCR)。
技術スタック・ディレクトリ構成・層境界・API 一覧の詳細は `.claude/rules/architecture.md` が**単一ソース**（このファイルに複製しない。ドリフト防止）。

**認証（現行）**: Supabase Auth の JWT Bearer Token（`SupabaseJwtGuard` グローバル適用・`@Public()` でバイパス）。旧 Cookie 認証は廃止済み。詳細は `architecture.md`。

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

1機能を DB→API→フロントまで貫通させてから次に進む。

## 絶対に守る設計原則

### OCR安全設計（命に関わる）
- 判定は必ず安全側に倒す（迷ったらNG）
- raw_textを必ず画面に表示する
- 「購入前にラベルの実物も必ずご確認ください」を全判定で常時表示
- incomplete:trueなら必ず再スキャンを促す
- Gemini プロンプト（`backend/src/scan/prompts/`）を変更したら必ず
  `backend/scripts/prompt-consistency-test.ts` で実画像回帰検証を行う
- 詳細: `.claude/rules/implementation_rules.md`

### インフラ制約
- 画像はS3 Presigned URL経由（Lambda直接送信禁止・6MB制限回避）
- NestJSにはS3キーのみ渡す

### アレルギー判定
- allergen_componentsテーブルから動的生成（ハードコード禁止）
- 有効なアレルギーのみプロンプトに渡す
- 除外リスト（乳化剤・乳酸菌等）も必ずプロンプトに渡す
- JAN キャッシュ（全ユーザー共有）には confidence: high の結果のみ保存・配信する

### 多言語対応（i18n）
- UIテキストをコンポーネントにハードコード禁止
- すべてのUIテキストはi18nキーで管理（`t('キー名')`）
- localesディレクトリにja/enのJSONを用意する

## 必須遵守ルール（詳細は `.claude/rules/` を参照。rules が docs より優先）

| ルールファイル | 内容 |
|---|---|
| `architecture.md` | 技術スタック・ディレクトリ構成・層境界・API一覧・認証・キャッシュ構造 |
| `coding_rules.md` | 命名・型・エラー・ログ・コメント・i18n規約 |
| `anti_patterns.md` | 禁止パターン（安全設計違反・層違反・型抑制・i18nハードコード等） |
| `dry_principles.md` | 共通モジュール集約点・DRY チェックリスト |
| `patterns.md` | 確立済み実装パターン（スキャンフロー・UPSERT・judgment_type等） |
| `implementation_rules.md` | プロジェクト固有制約（Lambda制限・免責UI・OCR安全設計・個人情報等） |
| `database_design.md` | DB正規化方針（1NF〜5NF・無損失分解・非正規化の許容条件） |
| `chrome_testing.md` | Chrome 実機チェック手順・省略不可条件（UI/API/認証変更時） |

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
| `brainstorming` | **新機能・設計変更・複数ファイル横断の変更**の実装前に必須（軽微なバグ修正・1ファイルの小修正には不要） |
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
- APIエンドポイント設計: `docs/design/api.md`
- 履歴・設定・オンボーディング・SNS共有・引き継ぎ・i18n: `docs/design/screens.md`
- 法務・免責・プライバシー: `docs/design/legal.md`
