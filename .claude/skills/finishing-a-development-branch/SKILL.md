---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup
---

# 開発ブランチを完了する

## 概要

構造化された選択肢を提示し、選択されたワークフローを処理することで、開発作業の完了をガイドする。

**コアプリンシパル:** テストを検証 → 環境を検出 → 選択肢を提示 → 選択を実行 → クリーンアップ。

**開始時に宣言:** 「finishing-a-development-branch スキルを使ってこの作業を完了します。」

## プロセス

### Step 1: テストを検証する

**選択肢を提示する前に、テストがパスすることを確認:**

```bash
pnpm -r test
# または
pnpm --filter frontend test
pnpm --filter backend test
```

**テストが失敗する場合:**
```
テストが失敗しています（N 件の失敗）。マージ/PR 前に修正が必要です:

[失敗を表示]

テストがパスするまで進めません。
```

止まる。Step 2 に進まない。

**テストがパスする場合:** Step 2 に進む。

### Step 2: 環境を検出する

**選択肢を提示する前にワークスペースの状態を確認:**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
```

| 状態 | メニュー | クリーンアップ |
|------|----------|--------------|
| `GIT_DIR == GIT_COMMON`（通常のリポジトリ）| 標準 4 選択肢 | ワークツリーなし |
| `GIT_DIR != GIT_COMMON`、名前付きブランチ | 標準 4 選択肢 | 出所ベース（Step 6 参照）|
| `GIT_DIR != GIT_COMMON`、デタッチド HEAD | 3 選択肢（マージなし）| クリーンアップなし |

### Step 3: ベースブランチを確認する

```bash
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

または確認: 「このブランチは main から分岐しています — 正しいですか？」

### Step 4: 選択肢を提示する

**通常のリポジトリと名前付きブランチのワークツリー — 正確にこの 4 選択肢を提示:**

```
実装が完了しました。どうしますか？

1. <ベースブランチ> にローカルでマージ
2. プッシュしてプルリクエストを作成
3. ブランチをそのままにしておく（後で自分で処理する）
4. この作業を破棄する

どれを選びますか？
```

**デタッチド HEAD — 正確にこの 3 選択肢を提示:**

```
実装が完了しました。デタッチド HEAD にいます（外部管理のワークスペース）。

1. 新しいブランチとしてプッシュしてプルリクエストを作成
2. そのままにしておく（後で自分で処理する）
3. この作業を破棄する

どれを選びますか？
```

**説明を追加しない** — 選択肢を簡潔に保つ。

### Step 5: 選択を実行する

#### 選択肢 1: ローカルでマージ

```bash
git checkout <base-branch>
git pull
git merge <feature-branch>

# マージ結果のテストを検証
pnpm -r test

# マージ成功後のみ: ブランチを削除
git branch -d <feature-branch>
```

#### 選択肢 2: プッシュして PR を作成

```bash
git push -u origin <feature-branch>

gh pr create --title "<title>" --body "$(cat <<'EOF'
## 概要
<変更内容 2〜3 箇条書き>

## テスト計画
- [ ] <検証ステップ>
EOF
)"
```

**ワークツリーをクリーンアップしない** — PR フィードバックに対応するために必要。

#### 選択肢 3: そのままにしておく

報告: 「ブランチ <name> をそのままにしています。ワークツリーは <path> に保存されています。」

**ワークツリーをクリーンアップしない。**

#### 選択肢 4: 破棄する

**まず確認:**
```
これにより永久に削除されます:
- ブランチ <name>
- すべてのコミット: <commit-list>
- ワークツリー（存在する場合）: <path>

確認するには 'discard' と入力してください。
```

正確な確認を待つ。

### Step 6: ワークスペースのクリーンアップ

**選択肢 1 と 4 のみ。** 選択肢 2 と 3 は常にワークツリーを保存する。

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

**`GIT_DIR == GIT_COMMON` の場合:** 通常のリポジトリ、クリーンアップするワークツリーなし。完了。

**ワークツリーパスが `.worktrees/` または `worktrees/` 配下の場合:** クリーンアップを実行。

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
git worktree remove "$WORKTREE_PATH"
git worktree prune
```

## クイックリファレンス

| 選択肢 | マージ | プッシュ | ワークツリー保持 | ブランチ削除 |
|--------|-------|---------|----------------|------------|
| 1. ローカルでマージ | yes | - | - | yes |
| 2. PR 作成 | - | yes | yes | - |
| 3. そのままに | - | - | yes | - |
| 4. 破棄 | - | - | - | yes（強制）|

## Red Flags

**絶対にしてはいけない:**
- テスト検証をスキップする
- 失敗したテストでマージする
- 確認なしに作業を削除する
- 明示的な依頼なしにforce-pushする
- マージ成功を確認する前にワークツリーを削除する
- ワークツリー内から `git worktree remove` を実行する
- 選択肢 4 で「discard」の入力確認をスキップする

**常に:**
- 選択肢を提示する前にテストを検証する
- 選択肢を提示する前に環境を検出する
- 正確に 4 選択肢を提示する（デタッチド HEAD の場合は 3）
- 選択肢 4 のために入力確認を得る
- 選択肢 1 と 4 のみでワークツリーをクリーンアップ
- ワークツリー削除の前に main リポジトリルートに cd する
- 削除後に `git worktree prune` を実行する
