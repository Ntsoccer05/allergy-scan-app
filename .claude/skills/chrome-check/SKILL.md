---
name: chrome-check
description: 実装・コーディング完了後（コミット前）に必ず実行する Chrome 実機チェック。UI・API・認証・i18n のいずれかを変更した場合に使用。型チェック・ユニットテストが通っても省略不可。
---

# Chrome 実機チェック

> 実装完了後・コミット前に必ず実行する。型チェック・ユニットテストだけでは検出できない
> 「画面表示崩れ・API通信エラー・認証ループ・翻訳欠け」を確認する。

## いつ使うか

以下のいずれかに該当する変更をしたとき → **このスキルを必ず呼び出す:**

| 変更カテゴリ | 例 |
|---|---|
| UI コンポーネント | `*.tsx`, `*.css` の変更 |
| API クライアント | `src/lib/api/**`, `useScan*`, `useHistory*` の変更 |
| 認証・ミドルウェア | `*guard*`, `proxy.ts`, `*auth*`, `*supabase*` の変更 |
| ルーティング | `route.ts`, `app/**/page.tsx` の変更 |
| i18n | `locales/**/*.json` の変更 |
| バックエンド API | Controller / Service / Repository の変更 |

---

## 前提条件

開発サーバーが起動していること。起動確認:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/allergens
```

`200` または `307` が返らない場合は `start` スキルを先に実行。

---

## チェック手順

### Step 1: 変更した画面を開いてスクリーンショット

変更に応じて対象画面を選ぶ（複数該当する場合はすべて実行）:

| 変更した機能 | 確認 URL |
|---|---|
| スキャン機能 | `http://localhost:3000/scan` |
| 履歴機能 | `http://localhost:3000/history` |
| 設定機能 | `http://localhost:3000/settings` |
| 地図機能 | `http://localhost:3000/map` |

```
mcp__chrome-devtools__navigate_page: <対象URL>
mcp__chrome-devtools__take_screenshot
```

**スキャン画面の確認項目:**
- [ ] 撮影ボタン（📷）と画像ファイル選択ボタンが下部に表示されている
- [ ] スキャン使用量バッジ（`N/20` 等）が表示されている
- [ ] ガイドメッセージ（「⚠️ 原材料またはバーコード…」）が表示されている

**履歴画面の確認項目:**
- [ ] 「自分のスキャン」「みんなのスキャン」「システム」タブが表示されている
- [ ] タブ切り替えが動作する（スナップショットで uid を取得してクリック）

```
mcp__chrome-devtools__take_snapshot
mcp__chrome-devtools__click: uid=<みんなのスキャンボタンのuid>
mcp__chrome-devtools__take_screenshot
```

### Step 2: ネットワークエラー確認

```
mcp__chrome-devtools__list_network_requests
```

- [ ] 4xx / 5xx がないこと
- [ ] 意図しない 401 / 403 がないこと

### Step 3: コンソールエラー確認

```
mcp__chrome-devtools__list_console_messages: types=["error"]
```

- [ ] ERROR レベルのメッセージがないこと
- [ ] 未処理の Promise rejection がないこと

---

## 完了報告フォーマット

```
## Chrome 実機チェック完了

| 項目 | 結果 |
|---|---|
| スキャン画面 | ✅ 正常 / ⚠️ 要確認 / — スキップ |
| 履歴画面 | ✅ 正常 / ⚠️ 要確認 / — スキップ |
| 設定画面 | ✅ 正常 / ⚠️ 要確認 / — スキップ |
| ネットワーク 4xx/5xx | ✅ なし / ❌ あり（詳細） |
| コンソール ERROR | ✅ なし / ❌ あり（詳細） |

問題: なし / [問題の詳細と対応]
```

問題があれば修正してから再チェック。問題なければそのままコミットへ進む。
