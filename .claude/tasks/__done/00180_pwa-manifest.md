# Task 00180: PWA manifest の追加

## Metadata

| Field | Value |
|---|---|
| Status | pending |
| Created | 2026-05-20 |
| Priority | low |
| Sprint | Week4 |
| Dependencies | なし（フロントエンド単独タスク） |

## Background

`frontend/public/` 配下に `manifest.json` が存在しない（`ls frontend/public/` で確認済み）。

`frontend/src/app/layout.tsx` の `<html>` 要素には `<link rel="manifest">` および `<meta name="theme-color">` が存在しない（L1-48 で確認済み）。現在の `metadata` オブジェクト（L20-23）はデフォルト値（`"Create Next App"`）のままで、アプリ名も設定されていない。

`frontend/public/icons/` ディレクトリは存在しない（`ls frontend/public/` で確認済み）。

PWA として機能させるためには manifest.json、テーマカラー meta タグ、および最低限のアイコン（512x512 PNG）が必要である。アイコン画像は本タスクでは placeholder（無地 PNG）で可とし、実際のデザイン済みアイコンの差し替えは後続タスクとする。

Next.js App Router の `metadata` API（`next/head` の代替）と `<link rel="manifest">` の共存方法については `frontend/node_modules/next/dist/docs/` を generator が確認すること（`frontend/AGENTS.md` の警告に従い）。

## Requirements

- R1: `frontend/public/manifest.json` を作成する。含めるべきフィールド: `name`（アレルギースキャンアプリ）、`short_name`（アレスキャン）、`lang`（`ja`）、`start_url`（`/scan`）、`display`（`standalone`）、`theme_color`、`background_color`、`icons`（最低限 `src: /icons/icon-512.png`、`sizes: 512x512`、`type: image/png` の1件）
- R2: `frontend/public/icons/icon-512.png` に 512x512 PNG の placeholder 画像を配置する（内容は問わない。完全な黒塗り・グレー塗りつぶし等でも可）
- R3: `frontend/src/app/layout.tsx` の `<head>` 相当の箇所に `<link rel="manifest" href="/manifest.json">` を追加する。Next.js App Router の実装方式に従うこと（TBD: generator が `node_modules/next/dist/docs/` を参照して適切な方法を選択すること）
- R4: `frontend/src/app/layout.tsx` に `<meta name="theme-color" content="<manifest.json と同じ値>">` を追加する。Next.js App Router の実装方式に従うこと
- R5: `frontend/src/app/layout.tsx` の `metadata.title` を `"アレルギースキャン"` に、`metadata.description` を `"アレルゲンをスキャンして安心・安全な商品選びをサポート"` に変更する
- R6: `as any` / `@ts-ignore` を新規追加しない
- R7: `pnpm --filter frontend typecheck` がエラー 0 件で終了する

## Implementation plan

### Phase 1: manifest.json 作成

`frontend/public/manifest.json` を以下の構造で作成する。`theme_color` / `background_color` は TBD（generator がアプリのカラーパレットを `globals.css` 等から確認して決定すること）。

```json
{
  "name": "アレルギースキャンアプリ",
  "short_name": "アレスキャン",
  "lang": "ja",
  "start_url": "/scan",
  "display": "standalone",
  "theme_color": "<TBD>",
  "background_color": "<TBD>",
  "icons": [
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

影響範囲: `frontend/public/manifest.json`（新規）

### Phase 2: placeholder アイコン配置

`frontend/public/icons/` ディレクトリを作成し、`icon-512.png`（512x512 の PNG）を配置する。
プログラムで生成する場合は Node.js の Canvas API（`canvas` npm パッケージ）等を使用してもよいが、最もシンプルな方法（バイナリエンコードされた最小 PNG を直接 Write）でも可とする（TBD: generator が実装方法を選択すること）。

影響範囲: `frontend/public/icons/icon-512.png`（新規）

### Phase 3: layout.tsx 更新

Next.js App Router における manifest リンクの追加方法を `frontend/node_modules/next/dist/docs/` で確認する。
`metadata` エクスポートオブジェクトへの `manifest` フィールド追加（Next.js 組み込み方式）、または `<head>` に `<link>` タグを直接追加する方式のいずれかを採用する（TBD: generator が選択）。
`metadata.title` / `metadata.description` を更新する。
`theme-color` meta タグを追加する。

影響範囲: `frontend/src/app/layout.tsx`

## Files to modify

| ファイル | 変更種別 |
|---|---|
| `frontend/public/manifest.json` | 新規作成 |
| `frontend/public/icons/icon-512.png` | 新規作成（placeholder PNG） |
| `frontend/src/app/layout.tsx` | 変更（manifest リンク・theme-color meta・metadata.title/description 更新） |

## Tests to add

このタスクは静的ファイルと Next.js メタデータ設定の追加のみであり、unit テストを追加しない。Completion criteria を静的解析・ファイル存在確認・typecheck で代替する。

## Completion criteria

- [ ] `frontend/public/manifest.json` が存在する（`ls frontend/public/manifest.json` で確認）
- [ ] `frontend/public/manifest.json` に `"name"` フィールドが存在する（`grep '"name"' frontend/public/manifest.json` でヒット件数 1 以上）
- [ ] `frontend/public/manifest.json` に `"short_name"` フィールドが存在する（`grep '"short_name"' frontend/public/manifest.json` でヒット件数 1 以上）
- [ ] `frontend/public/manifest.json` に `"start_url": "/scan"` が存在する（`grep '"start_url"' frontend/public/manifest.json` でヒット件数 1 以上）
- [ ] `frontend/public/manifest.json` に `"display": "standalone"` が存在する（`grep '"standalone"' frontend/public/manifest.json` でヒット件数 1 以上）
- [ ] `frontend/public/manifest.json` に `"theme_color"` フィールドが存在する（`grep '"theme_color"' frontend/public/manifest.json` でヒット件数 1 以上）
- [ ] `frontend/public/manifest.json` に `"icons"` フィールドが存在する（`grep '"icons"' frontend/public/manifest.json` でヒット件数 1 以上）
- [ ] `frontend/public/manifest.json` の `icons` に `"src": "/icons/icon-512.png"` が含まれる（`grep '"icon-512.png"' frontend/public/manifest.json` でヒット件数 1 以上）
- [ ] `frontend/public/manifest.json` に `"lang"` フィールドが存在する（`grep '"lang"' frontend/public/manifest.json` でヒット件数 1 以上）
- [ ] `frontend/public/icons/icon-512.png` が存在し、サイズが 0 バイトより大きい（`ls -la frontend/public/icons/icon-512.png` でファイルサイズ確認）
- [ ] `frontend/src/app/layout.tsx` に `manifest` の参照が存在する（manifest リンク追加を示す）（`grep -i "manifest" frontend/src/app/layout.tsx` でヒット件数 1 以上）
- [ ] `frontend/src/app/layout.tsx` に `theme-color` の参照が存在する（`grep "theme-color" frontend/src/app/layout.tsx` でヒット件数 1 以上）
- [ ] `frontend/src/app/layout.tsx` の `metadata.title` が `"Create Next App"` でない（`grep '"Create Next App"' frontend/src/app/layout.tsx` でヒット件数 0）
- [ ] `frontend/src/app/layout.tsx` に `as any` が新規追加されていない（`grep "as any" frontend/src/app/layout.tsx` でヒット件数 0）
- [ ] `pnpm --filter frontend typecheck` がエラー 0 件で終了する

## Risks

| リスク | 回避方針 |
|---|---|
| Next.js App Router の `metadata` API が `manifest` フィールドを `Metadata` 型でサポートしているかバージョン依存 | `frontend/node_modules/next/dist/docs/` を generator が参照して確認すること（`frontend/AGENTS.md` 警告に従う）。サポートしていない場合は `<link rel="manifest">` タグを直接 `layout.tsx` の `<head>` 内に追加する方式に切り替える |
| 512x512 PNG placeholder の生成方法が環境依存（Canvas / ImageMagick 等） | 最小限の有効 PNG バイナリ（1x1 または solid color）を Base64 デコードして Write する方法が最もポータブルであるため、generator はこの方法を優先する |
| `theme_color` / `background_color` の値がアプリのデザインと不一致になる | 現時点では暫定値（例: `#ffffff` / `#000000`）で実装し、デザイン確定後に差し替え可とする。Completion criteria は値の内容ではなくフィールドの存在のみをチェックする |
| `frontend/public/icons/` ディレクトリが git に追跡されないと CI で Missing になる | `icon-512.png` を直接 `Write` ツールで作成するため git 追跡対象になる。`.gitignore` に `icons/` が含まれていないことを generator が確認すること |

# Implementation summary
（generator が記入）

# Plan deviation
（generator が記入）

# Review comments
（evaluator が記入）
