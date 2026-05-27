---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace exists via native tools or git worktree fallback
---

# Git ワークツリーを使う

## 概要

作業が隔離されたワークスペースで行われることを保証する。プラットフォームのネイティブワークツリーツールを優先する。ネイティブツールが利用できない場合のみ、手動の git ワークツリーにフォールバックする。

**コアプリンシパル:** 先に既存の隔離を検出する。次にネイティブツールを使う。次に git にフォールバックする。ハーネスと戦わない。

**開始時に宣言:** 「using-git-worktrees スキルを使って隔離されたワークスペースをセットアップします。」

## Step 0: 既存の隔離を検出する

**何かを作成する前に、既に隔離されたワークスペースにいるか確認する。**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

**サブモジュールガード:** `GIT_DIR != GIT_COMMON` は git サブモジュール内でも真になる。「ワークツリーに既にいる」と結論付ける前に、サブモジュールにいないことを確認:

```bash
# これがパスを返す場合、ワークツリーではなくサブモジュールにいる — 通常のリポジトリとして扱う
git rev-parse --show-superproject-working-tree 2>/dev/null
```

**`GIT_DIR != GIT_COMMON`（サブモジュールでない）の場合:** 既にリンクされたワークツリーにいる。Step 3（プロジェクトセットアップ）にスキップ。

**`GIT_DIR == GIT_COMMON`（またはサブモジュール内）の場合:** 通常のリポジトリチェックアウトにいる。

ユーザーに同意を求める:

> 「隔離されたワークツリーをセットアップしましょうか？現在のブランチへの変更から保護されます。」

ユーザーが同意を断った場合、その場で作業して Step 3 にスキップ。

## Step 1: 隔離されたワークスペースを作成する

### 1a. ネイティブワークツリーツール（優先）

`EnterWorktree`、`WorktreeCreate`、`/worktree` コマンド、または `--worktree` フラグのようなツールがある場合、それを使って Step 3 にスキップ。

### 1b. Git ワークツリーフォールバック

Step 1a が適用されない場合のみ使用。

#### ディレクトリ選択

この優先順位に従う:

1. **指示でワークツリーディレクトリの設定を確認。** あれば使う。

2. **既存のプロジェクトローカルワークツリーディレクトリを確認:**
   ```bash
   ls -d .worktrees 2>/dev/null    # 優先（隠し）
   ls -d worktrees 2>/dev/null     # 代替
   ```
   見つかれば使う。両方ある場合、`.worktrees` が優先。

3. **何も指定がなければ、** プロジェクトルートの `.worktrees/` をデフォルトに。

#### 安全検証（プロジェクトローカルディレクトリのみ）

**ワークツリーを作成する前にディレクトリが無視されていることを必ず確認:**

```bash
git check-ignore -q .worktrees 2>/dev/null || echo "未無視 — .gitignore に追加が必要"
```

**.gitignore に追加されていない場合:** .gitignore に追加してコミットしてから進む。

**重要な理由:** ワークツリーの内容を誤ってリポジトリにコミットするのを防ぐ。

#### ワークツリーを作成する

```bash
project=$(basename "$(git rev-parse --show-toplevel)")
BRANCH_NAME="feature/<feature-name>"

# プロジェクトローカルの場合
git worktree add ".worktrees/$BRANCH_NAME" -b "$BRANCH_NAME"
cd ".worktrees/$BRANCH_NAME"
```

**サンドボックスフォールバック:** `git worktree add` がパーミッションエラーで失敗した場合、サンドボックスがワークツリー作成をブロックしたとユーザーに伝え、現在のディレクトリで作業する。

## Step 3: プロジェクトセットアップ

適切なセットアップを自動検出して実行:

```bash
# Node.js / pnpm（このプロジェクトの標準）
if [ -f package.json ]; then pnpm install; fi
```

## Step 4: クリーンなベースラインを確認する

ワークスペースがクリーンな状態で始まることを確認するためにテストを実行:

```bash
pnpm -r test
# または
pnpm --filter frontend test && pnpm --filter backend test
```

**テストが失敗する場合:** 失敗を報告し、進むか調査するか確認する。

**テストがパスする場合:** 準備完了を報告する。

### 報告

```
ワークツリーが <full-path> に準備できました
テストがパスしています（N テスト、0 件の失敗）
<feature-name> を実装する準備ができました
```

## クイックリファレンス

| 状況 | アクション |
|------|-----------|
| 既にリンクされたワークツリーにいる | 作成をスキップ（Step 0）|
| サブモジュール内にいる | 通常のリポジトリとして扱う（Step 0 ガード）|
| ネイティブワークツリーツールが利用可能 | それを使う（Step 1a）|
| ネイティブツールなし | Git ワークツリーフォールバック（Step 1b）|
| `.worktrees/` が存在 | 使う（無視されていることを確認）|
| `worktrees/` が存在 | 使う（無視されていることを確認）|
| 両方存在 | `.worktrees/` を使う |
| どちらも存在しない | デフォルトで `.worktrees/` |
| ディレクトリが無視されていない | .gitignore に追加してコミット |
| 作成時のパーミッションエラー | サンドボックスフォールバック、その場で作業 |
| ベースラインでテストが失敗 | 失敗を報告して確認する |

## Red Flags

**絶対にしてはいけない:**
- Step 0 が既存の隔離を検出したのにワークツリーを作成する
- ネイティブワークツリーツール（例: `EnterWorktree`）があるのに `git worktree add` を使う
- プロジェクトローカルで無視されていることを確認せずにワークツリーを作成する
- ベースラインテストの確認をスキップする
- 失敗したテストで確認なしに進む

**常に:**
- 最初に Step 0 の検出を実行する
- git フォールバックよりネイティブツールを優先する
- プロジェクトローカルのディレクトリが無視されていることを確認する
- クリーンなテストベースラインを確認する
