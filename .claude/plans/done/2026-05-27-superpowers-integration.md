# Superpowers スキル統合 実装計画

> **エージェント向け:** このプランを実行する際は `executing-plans` スキルを使用すること。ステップはチェックボックス構文（`- [ ]`）で追跡。

**目標:** superpowers のワークフロースキル群を allergy-scan-app プロジェクトに適用し、Claude Codeによる AI 開発ワークフローを強化する。

**アーキテクチャ:** 各スキルを `.claude/skills/` に配置し、セッション開始時フックで `using-superpowers` スキルを自動注入する。既存スキル（`run-harness-cycle`、`sync-rules`）は変更しない。

**技術スタック:** Claude Code Skill システム、PowerShell (Windows 11)、JSON 設定ファイル

---

## 対象ファイル一覧

| ファイル | 種別 |
|---|---|
| `.claude/skills/using-superpowers/SKILL.md` | 作成 |
| `.claude/skills/brainstorming/SKILL.md` | 作成 |
| `.claude/skills/brainstorming/spec-document-reviewer-prompt.md` | コピー |
| `.claude/skills/writing-plans/SKILL.md` | 作成 |
| `.claude/skills/writing-plans/plan-document-reviewer-prompt.md` | コピー |
| `.claude/skills/executing-plans/SKILL.md` | 作成 |
| `.claude/skills/finishing-a-development-branch/SKILL.md` | 作成 |
| `.claude/skills/systematic-debugging/SKILL.md` | 作成 |
| `.claude/skills/systematic-debugging/root-cause-tracing.md` | コピー |
| `.claude/skills/systematic-debugging/defense-in-depth.md` | コピー |
| `.claude/skills/systematic-debugging/condition-based-waiting.md` | コピー |
| `.claude/skills/verification-before-completion/SKILL.md` | 作成 |
| `.claude/skills/test-driven-development/SKILL.md` | 作成 |
| `.claude/skills/test-driven-development/testing-anti-patterns.md` | コピー |
| `.claude/skills/subagent-driven-development/SKILL.md` | 作成 |
| `.claude/skills/subagent-driven-development/implementer-prompt.md` | コピー |
| `.claude/skills/subagent-driven-development/spec-reviewer-prompt.md` | コピー |
| `.claude/skills/subagent-driven-development/code-quality-reviewer-prompt.md` | コピー |
| `.claude/skills/dispatching-parallel-agents/SKILL.md` | 作成 |
| `.claude/skills/receiving-code-review/SKILL.md` | 作成 |
| `.claude/skills/requesting-code-review/SKILL.md` | 作成 |
| `.claude/skills/requesting-code-review/code-reviewer.md` | コピー |
| `.claude/skills/using-git-worktrees/SKILL.md` | 作成 |
| `.claude/skills/writing-skills/SKILL.md` | 作成 |
| `.claude/hooks/session-start.ps1` | 作成 |
| `.claude/settings.json` | 更新（フック・パーミッション追加） |
| `CLAUDE.md` | 更新（スキル一覧セクション追加） |

---

### Task 1: using-superpowers スキル

**Files:**
- Create: `.claude/skills/using-superpowers/SKILL.md`

- [ ] スキルディレクトリを作成し SKILL.md を書く
- [ ] コミット: `feat: add using-superpowers skill`

---

### Task 2: brainstorming スキル

**Files:**
- Create: `.claude/skills/brainstorming/SKILL.md`
- Copy: `.claude/skills/brainstorming/spec-document-reviewer-prompt.md`

- [ ] SKILL.md を作成（設計ドキュメント保存先を `docs/specs/` に変更）
- [ ] サポートファイルをコピー
- [ ] コミット: `feat: add brainstorming skill`

---

### Task 3: writing-plans スキル

**Files:**
- Create: `.claude/skills/writing-plans/SKILL.md`
- Copy: `.claude/skills/writing-plans/plan-document-reviewer-prompt.md`

- [ ] SKILL.md を作成（プラン保存先を `.claude/plans/pending/` に変更）
- [ ] サポートファイルをコピー
- [ ] コミット: `feat: add writing-plans skill`

---

### Task 4: executing-plans スキル

**Files:**
- Create: `.claude/skills/executing-plans/SKILL.md`

- [ ] SKILL.md を作成
- [ ] コミット: `feat: add executing-plans skill`

---

### Task 5: finishing-a-development-branch スキル

**Files:**
- Create: `.claude/skills/finishing-a-development-branch/SKILL.md`

- [ ] SKILL.md を作成
- [ ] コミット: `feat: add finishing-a-development-branch skill`

---

### Task 6: systematic-debugging スキル

**Files:**
- Create: `.claude/skills/systematic-debugging/SKILL.md`
- Copy: `.claude/skills/systematic-debugging/root-cause-tracing.md`
- Copy: `.claude/skills/systematic-debugging/defense-in-depth.md`
- Copy: `.claude/skills/systematic-debugging/condition-based-waiting.md`

- [ ] SKILL.md を作成
- [ ] サポートファイルをコピー
- [ ] コミット: `feat: add systematic-debugging skill`

---

### Task 7: verification-before-completion スキル

**Files:**
- Create: `.claude/skills/verification-before-completion/SKILL.md`

- [ ] SKILL.md を作成
- [ ] コミット: `feat: add verification-before-completion skill`

---

### Task 8: test-driven-development スキル

**Files:**
- Create: `.claude/skills/test-driven-development/SKILL.md`
- Copy: `.claude/skills/test-driven-development/testing-anti-patterns.md`

- [ ] SKILL.md を作成（テストコマンドを pnpm に合わせる）
- [ ] サポートファイルをコピー
- [ ] コミット: `feat: add test-driven-development skill`

---

### Task 9: subagent-driven-development スキル

**Files:**
- Create: `.claude/skills/subagent-driven-development/SKILL.md`
- Copy: `.claude/skills/subagent-driven-development/implementer-prompt.md`
- Copy: `.claude/skills/subagent-driven-development/spec-reviewer-prompt.md`
- Copy: `.claude/skills/subagent-driven-development/code-quality-reviewer-prompt.md`

- [ ] SKILL.md を作成
- [ ] サポートファイルをコピー
- [ ] コミット: `feat: add subagent-driven-development skill`

---

### Task 10: dispatching-parallel-agents スキル

**Files:**
- Create: `.claude/skills/dispatching-parallel-agents/SKILL.md`

- [ ] SKILL.md を作成
- [ ] コミット: `feat: add dispatching-parallel-agents skill`

---

### Task 11: receiving-code-review スキル

**Files:**
- Create: `.claude/skills/receiving-code-review/SKILL.md`

- [ ] SKILL.md を作成
- [ ] コミット: `feat: add receiving-code-review skill`

---

### Task 12: requesting-code-review スキル

**Files:**
- Create: `.claude/skills/requesting-code-review/SKILL.md`
- Copy: `.claude/skills/requesting-code-review/code-reviewer.md`

- [ ] SKILL.md を作成
- [ ] サポートファイルをコピー
- [ ] コミット: `feat: add requesting-code-review skill`

---

### Task 13: using-git-worktrees スキル

**Files:**
- Create: `.claude/skills/using-git-worktrees/SKILL.md`

- [ ] SKILL.md を作成（ワークツリーパスを `.worktrees/` に統一）
- [ ] コミット: `feat: add using-git-worktrees skill`

---

### Task 14: writing-skills スキル

**Files:**
- Create: `.claude/skills/writing-skills/SKILL.md`

- [ ] SKILL.md を作成
- [ ] コミット: `feat: add writing-skills skill`

---

### Task 15: session-start フック（PowerShell）

**Files:**
- Create: `.claude/hooks/session-start.ps1`

- [ ] `using-superpowers` SKILL.md を読み込んでセッションコンテキストに注入する PowerShell スクリプトを作成
- [ ] コミット: `feat: add session-start hook for PowerShell`

---

### Task 16: settings.json 更新

**Files:**
- Modify: `.claude/settings.json`

- [ ] SessionStart フック設定を追加
- [ ] 全スキルの `Skill(*)` パーミッションを追加
- [ ] コミット: `feat: configure hooks and skill permissions`

---

### Task 17: CLAUDE.md 更新

**Files:**
- Modify: `CLAUDE.md`

- [ ] スキル一覧セクションを追加
- [ ] コミット: `docs: add superpowers skills reference to CLAUDE.md`

---

### Task 18: プラン完了処理

- [ ] このプランファイルを `.claude/plans/done/` に移動
- [ ] コミット: `chore: move completed plan to done`
