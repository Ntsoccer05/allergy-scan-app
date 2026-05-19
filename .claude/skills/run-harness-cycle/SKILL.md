---
name: run-harness-cycle
description: 要求 (1〜数行の自然文 or タスクファイル) を受け取り、planner → generator → evaluator の3エージェント GAN 型ループを自動で回すオーケストレータ。最大1回の修正ループで終了し、それでも基準未達なら修正案を人間に渡す。
---

# Harness Cycle Orchestrator

## ミッション

ユーザーが「この機能を作って」と1〜数行の要求を渡すだけで、planner → generator → evaluator のループが**自動で回る**ようにする。各エージェントは Task ツールで独立コンテキストとして起動する。

## いつ起動するか

ユーザーの要求が以下のいずれかに該当する場合、本スキルを呼び出す:

- 「〜を実装して」「〜を作って」「〜を追加して」など機能追加要求
- 「〜を直して」「〜のバグを修正して」など修正要求
- 既存タスクファイル `.claude/tasks/{連番}_*.md` のパスや連番を渡された場合（planner はスキップして generator から開始）

純粋な質問・調査・読み取り依頼には起動しない。

## 全体フロー

```
[Phase 1] Planning
  ├─ Task ツールで planner 起動
  ├─ 入力: ユーザー要求文 (or 既存タスク参照時はスキップ)
  ├─ 出力: .claude/tasks/{連番}_*.md (1 つ以上)
  └─ ゲート1: タスクファイル内容をユーザーに提示し承認を取る
       └─ 不承認 → planner 再起動 (修正指示付き)

[Phase 2] Generation (各タスクごとに繰り返し)
  ├─ Task ツールで generator 起動
  ├─ 入力: タスクファイルパス
  ├─ ラウンド: 1
  ├─ 出力: 実装変更 + Implementation summary 記入
  └─ generator 完了レポート

[Phase 3] Evaluation
  ├─ Task ツールで evaluator 起動 (独立コンテキスト!)
  ├─ 入力: タスクファイルパス + ラウンド番号
  ├─ 検証: Layer A (E2E) / B (Static) / C (Security) / D (Adversarial) / E (Maintainability)
  ├─ 出力: PASS / FAIL + Review comments への追記
  └─ 分岐:
       ├─ PASS → Phase 5 へ
       ├─ FAIL (ラウンド1) → Phase 4 へ (再実装ループ)
       └─ FAIL (ラウンド2) → Phase 5 へ (修正案を人間に提示)

[Phase 4] Re-generation (1回のみ)
  ├─ Task ツールで generator 再起動
  ├─ 入力: タスクファイルパス + evaluator の Review comments
  ├─ ラウンド: 2
  ├─ 出力: 修正実装
  └─ Phase 3 (evaluator) に戻る (ラウンド2)

[Phase 5] Wrap-up
  ├─ PASS の場合: .claude/tasks/__done/ への移動をユーザーに提示
  ├─ FAIL (ラウンド2) の場合: Review comments の修正案を要約してユーザーに提示
  ├─ 仕様ドキュメント同期推奨があれば sync-spec-docs スキル起動を提案
  ├─ 新パターン・新制約・アーキテクチャ変更を含む実装なら /sync-rules 実行を提案
  └─ 次タスクがあれば Phase 2 に戻る、なければ完了
```

## ゲート設計

完全自動化はしない。**3箇所**でユーザー確認を取る:

| ゲート | タイミング | 目的 |
|-------|----------|------|
| ゲート1 | planner 完了後 | タスクファイルが意図通りか確認 |
| ゲート2 | evaluator FAIL ラウンド2 後 | 修正案を人間で判断 |
| ゲート3 | 全タスク PASS 後 | .claude/tasks/__done/ 移動の最終確認 |

これらを抜くと self-leniency が場所を変えて再発するため、**省略不可**。

## 詳細手順

### Step 1: 入力分類

ユーザーから受け取った文字列を以下に分類:

| 入力 | 動作 |
|------|------|
| 自然文 (機能要求 / バグ修正) | Phase 1 から開始 |
| `.claude/tasks/{連番}_*.md` パス | Phase 2 から開始（planner スキップ）|
| 5桁連番のみ（例: `00010`）| Glob で `.claude/tasks/00010_*.md` を特定し Phase 2 |
| 引数なし | エラー: 要求またはタスク参照を要求 |

### Step 2: Phase 1 - Planning（要求受領時のみ）

```
Task ツール起動:
  subagent_type: planner
  description: "要求の詳細仕様化"
  prompt: |
    以下の要求をタスクテンプレート形式の詳細タスクファイルに展開してください。
    Completion criteria は必ず evaluator が機械的に検証可能な箇条書きにすること。

    要求: <ユーザー入力>
```

planner からのレポートを受け取り、生成されたタスクファイルパスを抽出。

**ゲート1 実施**:
- タスクファイル内容をユーザーに提示
- 「このタスクで実装を進めてよいですか？(yes / 修正指示 / cancel)」と確認

### Step 3: Phase 2 - Generation（各タスクごと）

タスクファイルが複数ある場合は順次処理:

```
Task ツール起動:
  subagent_type: generator
  description: "Sprint 単位の実装"
  prompt: |
    以下のタスクファイルを実装してください。ラウンド1。
    タスク: <タスクファイルパス>
```

generator のレポートから `Status: completed` を確認。`pending` のままなら Phase 5 でユーザー判断。

### Step 4: Phase 3 - Evaluation

**重要**: evaluator は必ず独立コンテキストで起動する。Task ツールでサブエージェント起動すれば自動で独立コンテキストになる。

```
Task ツール起動:
  subagent_type: evaluator
  description: "Quality Gate & Adversarial Review"
  prompt: |
    以下のタスクの実装変更を検証してください。ラウンド <1 or 2>。
    Layer A〜E 全て実施。
    タスク: <タスクファイルパス>
```

evaluator のレポートから `総合判定: PASS / FAIL` を抽出。

### Step 5: Phase 4 - Re-generation（FAIL ラウンド1 のみ、1回限り）

```
Task ツール起動:
  subagent_type: generator
  description: "Sprint 単位の再実装"
  prompt: |
    以下のタスクは evaluator から FAIL を受けました。ラウンド2の再実装を行ってください。
    タスクファイルの Review comments セクションに違反詳細と修正案が記載されています。
    タスク: <タスクファイルパス>
```

完了後、Phase 3 (evaluator) に戻ってラウンド2 で再採点。
ラウンド2 でも FAIL の場合は **再実装しない**。Phase 5 へ。

### Step 6: Phase 5 - Wrap-up

| 状態 | 動作 |
|------|------|
| PASS（ラウンド1 or 2）| ゲート3: `.claude/tasks/__done/` 移動の確認 |
| FAIL（ラウンド2）| ゲート2: Review comments の修正案を要約してユーザーに提示 |
| Generator 未完（pending 据置）| エラー詳細をユーザーに提示し、判断を仰ぐ |

仕様ドキュメント同期推奨が generator レポートにあれば、`sync-spec-docs` スキル起動を提案。
新パターン・新制約・アーキテクチャ変更を含む実装の場合は `/sync-rules` 実行を提案（自動起動しない。ユーザーが判断）。
複数タスクがある場合、未処理の次タスクで Phase 2 から繰り返し。

## メトリクス記録（任意・推奨）

`.claude/harness-metrics.md` に以下を append:

```markdown
## YYYY-MM-DD HH:mm <タスクファイル名>
- 要求: <ユーザー入力 or タスク参照>
- planner ラウンド: 1 | N
- generator ラウンド: 1 | 2
- evaluator 結果: PASS (R1) | PASS (R2) | FAIL (R2)
- Threshold 違反: 動作性 N / セキュリティ N / カバレッジ N / 敵対的 N / 保守性 N
- 所要トークン: 推定 N
- 人手介入箇所: ゲート1 / ゲート2 / ゲート3
```

ハーネスエンジニアリングの基礎データになる。

## 例外処理

| 状況 | 対処 |
|------|------|
| planner がタスク生成失敗 | エラー詳細をユーザーに提示、本スキル終了 |
| generator が pending 据置 | typecheck / unit 失敗詳細をユーザーに提示、ゲート判断 |
| evaluator が「max iterations exceeded」を返す | エラー詳細をユーザーに提示、手動介入を促す |
| Playwright MCP 未接続 | evaluator が Layer A をスキップした旨を明示し続行 |
| ユーザーが途中で cancel | 進行中のタスクファイル状態を保存して終了 |

## 絶対禁止

- planner / generator / evaluator を Task ツール以外で起動する（独立コンテキストにならず self-leniency が漏れる）
- evaluator FAIL ラウンド2 後の再実装ループ
- ゲート1〜3 のスキップ
- generator と evaluator を同一プロンプトで連続起動（コンテキスト汚染）
