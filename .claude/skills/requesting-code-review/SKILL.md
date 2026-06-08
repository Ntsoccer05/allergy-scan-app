---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
---

# コードレビューを依頼する

タスクを完了したら、問題が連鎖する前にキャッチするためにコードレビューサブエージェントを派遣する。レビュアーは評価のために正確に作られたコンテキストを受け取る — セッションの履歴ではない。

**コアプリンシパル:** 早めにレビュー、頻繁にレビュー。

## レビューを依頼するとき

**必須:**
- サブエージェント駆動開発の各タスク後
- 主要な機能を完了した後
- main にマージする前

**オプションだが価値あり:**
- 詰まったとき（新鮮な視点）
- リファクタリング前（ベースラインチェック）
- 複雑なバグを修正した後

## 依頼方法

**1. git SHA を取得:**
```bash
BASE_SHA=$(git rev-parse HEAD~1)  # または origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. コードレビューサブエージェントを派遣:**

Agent ツールを `general-purpose` タイプで使い、`code-reviewer.md` のテンプレートを埋める

**プレースホルダー:**
- `{DESCRIPTION}` — 何を作ったかの簡単な要約
- `{PLAN_OR_REQUIREMENTS}` — 何をすべきか
- `{BASE_SHA}` — 開始コミット
- `{HEAD_SHA}` — 終了コミット

**3. フィードバックに対応する:**
- Critical な問題は直ちに修正
- Important な問題は進む前に修正
- Minor な問題は後で対応
- レビュアーが間違っていれば（理由を添えて）プッシュバック

## 例

```
[Task 2: verify 関数を追加したばかり]

You: 進む前にコードレビューを依頼します。

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[コードレビューサブエージェントを派遣]
  DESCRIPTION: verifyIndex() と repairIndex() を 4 つの問題タイプで追加
  PLAN_OR_REQUIREMENTS: Task 2 from .claude/plans/pending/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661

[サブエージェントが返す]:
  強み: クリーンなアーキテクチャ、実際のテスト
  問題:
    Important: 進行状況インジケーターが欠けている
    Minor: レポートインターバルのマジックナンバー（100）
  評価: 進んで問題ない

You: [進行状況インジケーターを修正]
[Task 3 に続く]
```

## ワークフローとの統合

**サブエージェント駆動開発:**
- 各タスク後にレビュー
- 問題が積み重なる前にキャッチ
- 次のタスクに移る前に修正

**計画を実行する:**
- 各タスク後または自然なチェックポイントでレビュー
- フィードバックを受け取り、適用し、続ける

**アドホック開発:**
- マージ前にレビュー
- 詰まったときにレビュー

## Red Flags

**絶対にしてはいけない:**
- 「シンプルだから」レビューをスキップ
- Critical な問題を無視する
- 未修正の Important な問題で進む
- 有効な技術的フィードバックに反論する

**レビュアーが間違っている場合:**
- 技術的な理由でプッシュバック
- 機能するコード/テストを見せる
- 確認を求める

テンプレートは `requesting-code-review/code-reviewer.md` を参照。
