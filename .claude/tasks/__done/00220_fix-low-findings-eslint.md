# Task 00220: evaluator Low 指摘・ESLint 警告の解消

## Metadata

| Field | Value |
|---|---|
| Status | completed |
| Priority | medium |
| Sprint | Week4 補完 |
| Created | 2026-05-20 |
| Dependencies | 00160_sns-share-web-share-api（ResultCard・buildShareContent が存在すること）, 00200_reservation-text-section（ReservationTextSection が存在すること） |

## Background

評価ラウンドで積み残された Low 指摘と ESLint 警告が 3 件ある。

### 修正対象 1: `vibrateIfAndroid(50)` のマジックナンバー
- **ファイル**: `frontend/src/components/ResultCard.tsx`（L164）
- `handleShare` 内で `vibrateIfAndroid(50)` を直呼びしている。`50` に意図がなくコード上の根拠が読み取れない。
- 定数は `frontend/src/app/scan/scan.constants.ts` に集約する規約だが（`coding_rules.md`）、`VIBRATE_SHARE_MS` は未定義。
- 同ファイルの L319 に `vibrateIfAndroid(30)`（閉じるボタン）があり、これは別用途のため今回対象外（generator が判断）。

### 修正対象 2: `buildShareContent` 内の日本語ハードコード
- **ファイル**: `frontend/src/components/ResultCard.tsx`（L57–L66）
- `buildShareContent` は `title: 'アレルギースキャンアプリ'` と `text: \`...(アレルギースキャンアプリ調べ)\`` を日本語固定で返す（L63–L65）。
- `buildShareContent` はコンポーネント外のモジュールスコープ関数のため `useTranslations()` を呼べないが、コンポーネント内で `t()` を使って翻訳済み文字列を引数として渡す設計に変更することで解消できる。
- `frontend/public/locales/ja/scan.json` と `frontend/public/locales/en/scan.json` には `appTitle` キーが未定義。追加が必要。

### 修正対象 3: `ReservationTextSection.tsx` の ESLint `react-hooks/set-state-in-effect` 警告
- **ファイル**: `frontend/src/app/settings/ReservationTextSection.tsx`（L47–L49）
- `useEffect` 内で `setText(generatedText)` を直接呼んでいる。`react-hooks/set-state-in-effect` ルールがこのパターンに警告を出す。
- 警告の意図: 副作用内での state 更新は無限ループや不要な再レンダリングを招きやすいため。
- このユースケース（allergies/locale 変化時にユーザー編集を自動リセット）では、`key` prop を使ってコンポーネント自体をリセットする方式、または `useEffect` の依存変化を `useRef` で検知して更新をスキップする方式が代替となる。具体的な実装方法は generator が判断する。

## Requirements

- R1: `frontend/src/app/scan/scan.constants.ts` に `VIBRATE_SHARE_MS = 50` を `number` 型定数として定義する
- R2: `frontend/src/components/ResultCard.tsx` の `handleShare` 内の `vibrateIfAndroid(50)` を `vibrateIfAndroid(VIBRATE_SHARE_MS)` に変更する。`VIBRATE_SHARE_MS` を `scan.constants.ts` からインポートする
- R3: `buildShareContent` 関数のシグネチャを `(result: ScanResult, title: string) => { title: string; text: string }` に変更し、本体内の `'アレルギースキャンアプリ'` ハードコードを `title` 引数に置き換える
- R4: `ResultCard` コンポーネント内の `buildShareContent` 呼び出しを `buildShareContent(result, t('appTitle'))` に変更する（`t` は `useTranslations('result')` ではなく `scan` スコープから取得する必要がある場合は generator が判断して調整する）
- R5: `frontend/public/locales/ja/scan.json` に `appTitle: 'アレルギースキャンアプリ'` キーを追加する
- R6: `frontend/public/locales/en/scan.json` に `appTitle: 'Allergy Scan App'` キーを追加する
- R7: `frontend/src/app/settings/ReservationTextSection.tsx` の `react-hooks/set-state-in-effect` 警告を解消するようリファクタリングする。実装方法は generator が判断するが、既存の Completion criteria（allergies/locale 変化時に textarea がリセットされること）を壊さないこと
- R8: `as any` / `@ts-ignore` を新規追加しない
- R9: `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- R10: `pnpm --filter frontend test` が全 PASS で終了する（既存テスト含む）

## Implementation plan

### Phase 1: 定数追加と `vibrateIfAndroid(50)` 置換

`frontend/src/app/scan/scan.constants.ts` に `VIBRATE_SHARE_MS` を追加する。
`frontend/src/components/ResultCard.tsx` で `VIBRATE_SHARE_MS` をインポートし、`vibrateIfAndroid(50)` を置換する。

影響範囲: `scan.constants.ts`（末尾追加のみ）、`ResultCard.tsx`（インポート追加・L164 1箇所）

### Phase 2: `buildShareContent` の引数追加と i18n キー追加

`buildShareContent` のシグネチャに `title: string` を追加し、ハードコード文字列を除去する。
コンポーネント内の呼び出しを `buildShareContent(result, t('appTitle'))` に更新する。
`useTranslations` の namespace 選択（`'result'` vs `'scan'`）は generator が現在のコードを確認して判断する（TBD: generator 確認）。
`frontend/public/locales/ja/scan.json` と `en/scan.json` に `appTitle` キーを追加する。

影響範囲: `ResultCard.tsx`（関数シグネチャ変更・呼び出し変更）、2 つのロケールファイル（キー追加）

### Phase 3: `ReservationTextSection.tsx` の ESLint 警告解消

`react-hooks/set-state-in-effect` 警告を解消する。候補:
- `key` prop 方式: 親コンポーネント（`settings/page.tsx`）から渡す `key` を `allergies` や `locale` のハッシュにして、変化時にコンポーネントを再マウントする
- `useRef` で前回値を記憶し、変化があった場合のみ `setState` を呼ぶ（linter が警告を出さないかどうかは generator が確認する）
- `useReducer` + `key` 方式

実装後、既存テスト（`ReservationTextSection.test.tsx`）が引き続き PASS することを確認する。

影響範囲: `ReservationTextSection.tsx`（state 管理リファクタリング）、`settings/page.tsx`（`key` prop 追加の場合のみ）

### Phase 4: 既存テストの整合性確認・修正

`buildShareContent` のシグネチャ変更に伴い `ResultCard.test.tsx` に影響が出る可能性がある。generator が確認して必要な修正を行う（TBD: generator 確認）。

## Files to modify

| ファイル | 変更種別 |
|---|---|
| `frontend/src/app/scan/scan.constants.ts` | 変更（`VIBRATE_SHARE_MS` 定数追加） |
| `frontend/src/components/ResultCard.tsx` | 変更（定数使用・`buildShareContent` シグネチャ変更・`appTitle` i18n 化） |
| `frontend/public/locales/ja/scan.json` | 変更（`appTitle` キー追加） |
| `frontend/public/locales/en/scan.json` | 変更（`appTitle` キー追加） |
| `frontend/src/app/settings/ReservationTextSection.tsx` | 変更（ESLint 警告解消リファクタリング） |
| `frontend/src/app/settings/page.tsx` | 変更（`key` prop 追加の場合のみ。TBD: generator 確認） |
| `frontend/src/components/ResultCard.test.tsx` | 変更（`buildShareContent` シグネチャ変更に伴う修正。TBD: generator 確認） |

## Tests to add

新規テストは原則不要（既存テストがリファクタリング後も PASS することを確認するのみ）。
ただし以下の場合は修正が必要:

- `ResultCard.test.tsx` に `buildShareContent` を直接呼ぶテストが存在する場合 → シグネチャ変更に合わせて修正する
- `ReservationTextSection.test.tsx` に `useEffect` の依存挙動を検証するテストが存在する場合 → リファクタリング後も同じ振る舞いを期待するテストが PASS することを確認する

## Completion criteria

- [ ] `frontend/src/app/scan/scan.constants.ts` に `VIBRATE_SHARE_MS` が定義されている（`grep -c 'VIBRATE_SHARE_MS' frontend/src/app/scan/scan.constants.ts` が 1 以上）
- [ ] `frontend/src/components/ResultCard.tsx` に `vibrateIfAndroid(50)` が存在しない（`grep -c 'vibrateIfAndroid(50)' frontend/src/components/ResultCard.tsx` が 0）
- [ ] `frontend/src/components/ResultCard.tsx` に `vibrateIfAndroid(VIBRATE_SHARE_MS)` が存在する（`grep -c 'VIBRATE_SHARE_MS' frontend/src/components/ResultCard.tsx` が 1 以上）
- [ ] `frontend/src/components/ResultCard.tsx` の `buildShareContent` 定義に `'アレルギースキャンアプリ'` 日本語文字列が存在しない（`grep -c 'アレルギースキャンアプリ' frontend/src/components/ResultCard.tsx` が 0）
- [ ] `frontend/public/locales/ja/scan.json` に `appTitle` キーが存在する（`grep -c 'appTitle' frontend/public/locales/ja/scan.json` が 1 以上）
- [ ] `frontend/public/locales/en/scan.json` に `appTitle` キーが存在する（`grep -c 'appTitle' frontend/public/locales/en/scan.json` が 1 以上）
- [ ] `frontend/public/locales/en/scan.json` の `appTitle` 値が `"Allergy Scan App"` である（`grep '"appTitle": "Allergy Scan App"' frontend/public/locales/en/scan.json` でヒット 1 以上）
- [ ] `npx eslint --max-warnings=0 frontend/src/app/settings/ReservationTextSection.tsx` がエラー・警告 0 件で終了する
- [ ] `ReservationTextSection` でアレルギーを toggle した後に textarea が新しい自動生成テキストにリセットされることを検証するテストが PASS する（既存テスト `ReservationTextSection.test.tsx` の該当ケース）
- [ ] `frontend/src/components/ResultCard.tsx` に `as any` が存在しない（`grep -c 'as any' frontend/src/components/ResultCard.tsx` が 0）
- [ ] `frontend/src/app/settings/ReservationTextSection.tsx` に `as any` が存在しない（`grep -c 'as any' frontend/src/app/settings/ReservationTextSection.tsx` が 0）
- [ ] `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter frontend test` が全 PASS で終了する（FAIL 0 件）

## Risks

| リスク | 回避方針 |
|---|---|
| `useTranslations` の namespace が `'result'` になっており `appTitle` キーが `scan.json` のトップレベルに置かれる場合、`t('appTitle')` で取れない可能性がある | generator が `useTranslations` の namespace を確認し、`t` の呼び出し先 namespace に合わせて `appTitle` キーを配置する（例: namespace が `'result'` なら `result.appTitle`）。TBD: generator 確認 |
| `buildShareContent` 呼び出し箇所が `ResultCard.test.tsx` にもある場合、引数追加で typecheck エラーが発生する | generator が test ファイルを確認し、シグネチャ変更に合わせて修正する |
| `ReservationTextSection` を `key` prop でリセットする方式を採用した場合、`settings/page.tsx` への影響が発生する | 変更範囲を最小にするため、コンポーネント内完結で解消できる方式（`useRef` 等）を優先する。`key` 方式を採用する場合は `settings/page.tsx` の修正も必要なことをコメントに明記する |
| ESLint 警告解消のリファクタリングで `ReservationTextSection.test.tsx` が壊れる | リファクタリング後に `pnpm --filter frontend test -- --testPathPattern ReservationTextSection` を確認する |

## Implementation summary

（generator が記入）

## Plan deviation

（generator が記入）
