---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to finalize the work - verifies tests, updates documentation, and presents options for push/PR or keeping as-is
---

# 開発ブランチを完了する

## 概要

テストを検証し、ドキュメントを更新し、完成した作業をまとめる。

**前提:** ブランチの作成・切り替えはユーザー自身が行う。Claude はブランチを作成・削除しない。

**コアプリンシパル:** テストを検証 → ドキュメントを更新 → 選択肢を提示 → 選択を実行。

**開始時に宣言:** 「finishing-a-development-branch スキルを使ってこの作業を完了します。」

## プロセス

### Step 1: テストを検証する

**次のステップに進む前に、テストがパスすることを確認:**

```bash
pnpm -r test
# または
pnpm --filter frontend test
pnpm --filter backend test
pnpm --filter frontend typecheck && pnpm --filter backend typecheck
```

**テストが失敗する場合:**
```
テストが失敗しています（N 件の失敗）。完了前に修正が必要です:
[失敗を表示]
テストがパスするまで進めません。
```

止まる。Step 2 に進まない。

**テストがパスする場合:** Step 2 に進む。

### Step 2: ドキュメントを更新する

実装内容に基づいて、変更が必要なドキュメントを確認・更新する。

**確認チェックリスト:**

| 変更の種類 | 更新すべきドキュメント |
|------------|----------------------|
| API エンドポイントの追加・変更 | `docs/design/api.md` |
| DB スキーマの変更（テーブル・カラム）| `docs/design/database.md` |
| 新しい実装パターンの確立 | `.claude/rules/patterns.md` |
| アーキテクチャ・技術スタックの変更 | `.claude/rules/architecture.md`、`CLAUDE.md` |
| 禁止パターンの追加・発見 | `.claude/rules/anti_patterns.md` |
| コーディング規約の変更 | `.claude/rules/coding_rules.md` |
| 新しい API エンドポイント一覧 | `CLAUDE.md` の API エンドポイント一覧 |

**更新の原則:**
- 実際に変更した内容のみ更新する（推測で書かない）
- 既存の記述と矛盾が生じないか確認する
- 変更がない場合はスキップして問題ない

**ドキュメント更新後はコミット:**
```bash
git add docs/ .claude/rules/ CLAUDE.md
git commit -m "docs: update documentation for <feature>"
```

### Step 3: 最終コードレビューを実施する

実装全体のコードレビューをサブエージェントで実施する。

```bash
BASE_SHA=$(git rev-parse origin/main 2>/dev/null || git rev-parse main 2>/dev/null)
HEAD_SHA=$(git rev-parse HEAD)
```

`requesting-code-review` スキルを使ってサブエージェントを派遣:
- DESCRIPTION: 実装した機能の概要
- PLAN_OR_REQUIREMENTS: 計画ファイルのパス（存在する場合）
- BASE_SHA: `$BASE_SHA`
- HEAD_SHA: `$HEAD_SHA`

**Critical な問題:** 即座に修正してから次のステップへ。
**Important な問題:** 修正してから次のステップへ。
**Minor な問題:** 記録して後で対応（ブロックしない）。

### Step 4: 選択肢を提示する

```
実装が完了しました。どうしますか？

1. プッシュしてプルリクエストを作成
2. そのままにしておく（後で自分で処理する）

どれを選びますか？
```

**注意:** ブランチの作成・マージはユーザーが自分で行う。

### Step 5: 選択を実行する

#### 選択肢 1: プッシュして PR を作成

```bash
git push -u origin $(git branch --show-current)

gh pr create --title "<title>" --body "$(cat <<'EOF'
## 概要
<変更内容 2〜3 箇条書き>

## テスト計画
- [ ] <検証ステップ>

## ドキュメント更新
- [ ] 更新したドキュメントの一覧（なければ削除）
EOF
)"
```

#### 選択肢 2: そのままにしておく

報告: 「現在のブランチ `$(git branch --show-current)` に作業内容が残っています。」

## Red Flags

**絶対にしてはいけない:**
- テスト検証をスキップする
- 失敗したテストのまま進む
- ブランチを自動的に作成・切り替え・削除する
- ドキュメント更新を忘れる（変更がある場合）
- コードレビューをスキップする

**常に:**
- 最初にテストを検証する
- ドキュメントの整合性を確認する
- サブエージェントでコードレビューを行う
- ユーザーが選択するまでプッシュしない
