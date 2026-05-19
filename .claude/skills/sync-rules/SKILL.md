---
name: sync-rules
description: 実装変更後に .claude/rules/ と CLAUDE.md を実装と整合した状態に保つ。新パターン・新制約・アーキテクチャ変更を検出してルールファイルを更新する。run-harness-cycle の evaluator PASS 後または手動で実行する。
---

# sync-rules スキル

## いつ起動するか

以下の場面で呼び出す:

- `run-harness-cycle` で evaluator PASS した直後（実装が確定したとき）
- 手動で大きな実装変更を加えた後
- `.claude/rules/` が実装と乖離していると気づいたとき

純粋な質問・調査・タスクファイル生成には起動しない。

## 使い方

```
/sync-rules                                    # 最新の git diff を対象
/sync-rules tasks/00060_history-backend.md    # 特定タスクを対象
```

## フロー

```
[Step 1] Agent(rules-syncer) を起動
  入力:
    - git diff --name-only HEAD の変更ファイル一覧
    - タスクファイルパス（引数指定時はそのファイルの Implementation summary も渡す）

[Step 2] レポート受領・ユーザーへ提示
  - 「更新あり」ファイルと変更内容を一覧表示
  - 「人手レビュー推奨」があれば強調表示

[Step 3] 完了
  - 変更なしの場合: 「ルールはすでに最新です」と報告
  - 変更ありの場合: 変更内容の要約を報告
```

## Agent 起動例

```
Task ツール起動:
  subagent_type: rules-syncer
  description: ".claude/rules/ と CLAUDE.md の同期"
  prompt: |
    以下の実装変更を受けて .claude/rules/ と CLAUDE.md を更新してください。

    変更ファイル一覧:
    <git diff --name-only HEAD の出力>

    実装サマリ:
    <タスクファイルの Implementation summary（あれば）>

    タスクファイル: <パス（あれば）>
```

## run-harness-cycle との連携

`run-harness-cycle` の Phase 5（Wrap-up）で evaluator PASS 後に以下を提案する:

```
「ルールファイルの同期が必要な場合は /sync-rules を実行してください」
```

ハーネスが自動起動するのではなく、ユーザーが判断して手動実行する設計とする。
（全タスクで必須ではないため自動化しない。規模の大きな実装変更後のみ推奨）

## 注意事項

- `rules-syncer` は実装コードを一切変更しない
- `CLAUDE.md` の「絶対に守る設計原則」セクションは更新対象外
- ルールの**削除・廃止**は自動化しない（人手レビューが必要）
