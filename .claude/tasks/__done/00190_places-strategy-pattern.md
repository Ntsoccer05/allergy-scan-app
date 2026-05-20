# Task 00190: PlacesClient を Strategy パターンで切り替え可能にする

## Metadata

| Field | Value |
|---|---|
| Status | completed |
| Created | 2026-05-20 |
| Completed | 2026-05-20 |
| Priority | medium |
| Sprint | Week4 |
| Dependencies | 00170_google-places-store-name（PlacesClient 実装済み） |

## Background

`backend/src/shared/places.client.ts`（`PlacesClient` クラス）は Google Places Nearby Search API（新版）に直結した具体実装であり、`scan.service.ts` に直接型で注入されている。

Google Places API は有料（月 10,000 回の無料枠超過後は従量課金）であり、開発環境・低コスト運用時に無料の OpenStreetMap Overpass API を使いたいニーズがある。また、Overpass を primary・Google をフォールバックとする hybrid 構成をデフォルトにしたい。

環境変数 `PLACES_PROVIDER=google|overpass|hybrid` で実装を切り替えられる構成にリファクタリングする。

### 定数の置き場（案B採用）

`backend/src/shared/places.constants.ts` を新規作成し、以下をまとめて定義する:
- `PLACES_SEARCH_RADIUS_M = 10`（店舗検索半径 m。屋内 GPS 誤差を考慮し 10m）
- `STORE_CANDIDATES_LIMIT = 5`（候補上位件数）
- `OVERPASS_TIMEOUT_MS = 5000`（Overpass API タイムアウト ms）

インターフェースファイル（`places.interface.ts`）には定数を含めない（型・インターフェース・DI トークンのみ）。

### Overpass API の検索クエリ

```
[out:json][timeout:5];
(
  node["shop"~"convenience|supermarket|grocery"](around:10,{lat},{lng});
);
out body;
```

エンドポイント: `https://overpass-api.de/api/interpreter`（POST）
レスポンスの `elements[].tags.name` が店舗名、`String(elements[].id)` が placeId。

## Requirements

- R1: `backend/src/shared/places.constants.ts` を新規作成する。`PLACES_SEARCH_RADIUS_M = 10`・`STORE_CANDIDATES_LIMIT = 5`・`OVERPASS_TIMEOUT_MS = 5000` を named export として定義する
- R2: `backend/src/shared/places.interface.ts` を新規作成する。`StoreCandidate` 型・`StoreCandidateProvider` インターフェース（`getStoreCandidates(lat: number, lng: number): Promise<StoreCandidate[]>`）・`PLACES_PROVIDER_TOKEN = 'PLACES_PROVIDER_TOKEN'` を export する。定数は含めない
- R3: `backend/src/shared/places.client.ts` を `backend/src/shared/google-places.client.ts` にリネームし、クラス名を `GooglePlacesClient` に変更する。`StoreCandidateProvider` を implements する。`StoreCandidate` 型を `places.interface.ts` から、定数を `places.constants.ts` から import する（ファイル内の重複定義を削除する）
- R4: 旧 `backend/src/shared/places.client.ts` を削除する。他ファイルでの旧パス import を新パスに変更する
- R5: `backend/src/shared/overpass-places.client.ts` を新規作成する。クラス名 `OverpassPlacesClient`、`StoreCandidateProvider` を implements する。Overpass API に POST リクエストを送り、`elements[].tags.name` が文字列の要素のみを `StoreCandidate[]` で返す。エラー・タイムアウト・空 elements は `[]` を返す（例外を投げない。`Logger.warn` でログを残す）
- R6: `backend/src/shared/hybrid-places.client.ts` を新規作成する。クラス名 `HybridPlacesClient`、`StoreCandidateProvider` を implements する。コンストラクタで `OverpassPlacesClient` と `GooglePlacesClient` を DI 注入する。Overpass の結果が空配列の場合のみ Google Places を呼ぶ
- R7: `backend/src/scan/scan.module.ts` に factory provider を追加する。`process.env.PLACES_PROVIDER === 'google'` → `GooglePlacesClient`、`'overpass'` → `OverpassPlacesClient`、それ以外（未設定含む）→ `HybridPlacesClient` を `PLACES_PROVIDER_TOKEN` として provide する。`providers` に 3 クライアントを列挙し、旧 `PlacesClient` を削除する
- R8: `backend/src/scan/scan.service.ts` の注入を `@Inject(PLACES_PROVIDER_TOKEN) private readonly placesClient: StoreCandidateProvider` に変更する。`PlacesClient` への直接依存を削除する
- R9: `as any` / `@ts-ignore` を新規追加しない
- R10: `pnpm --filter backend typecheck` がエラー 0 件で終了する
- R11: `pnpm --filter backend test` が全テスト PASS で終了する（FAIL 0 件）

## Implementation plan

### Phase 1: 定数ファイル・インターフェースファイル新規作成

`places.constants.ts` に3定数を定義。
`places.interface.ts` に `StoreCandidate`・`StoreCandidateProvider`・`PLACES_PROVIDER_TOKEN` を定義。

### Phase 2: GooglePlacesClient へのリネーム・リファクタリング

`places.client.ts` → `google-places.client.ts` にリネームしクラス名変更。
内部の `StoreCandidate` 型定義・定数定義を削除し import に置き換え。
`StoreCandidateProvider` を implements。
旧 `places.client.ts` を削除し、他ファイルの import パスを更新。

### Phase 3: OverpassPlacesClient 新規作成

`overpass-places.client.ts` を作成。
Overpass クエリを fetch POST で送信。タイムアウトは `AbortController` + `OVERPASS_TIMEOUT_MS`。
`elements[].tags.name` が string の要素のみ `{ name, placeId: String(id) }` で返す。

### Phase 4: HybridPlacesClient 新規作成

`hybrid-places.client.ts` を作成。
`OverpassPlacesClient` → 空配列なら `GooglePlacesClient` の順で呼ぶ。

### Phase 5: scan.module.ts に factory provider 追加

```typescript
{
  provide: PLACES_PROVIDER_TOKEN,
  useFactory: (
    google: GooglePlacesClient,
    overpass: OverpassPlacesClient,
    hybrid: HybridPlacesClient,
  ) => {
    const p = process.env.PLACES_PROVIDER
    if (p === 'google') return google
    if (p === 'overpass') return overpass
    return hybrid  // デフォルト: hybrid
  },
  inject: [GooglePlacesClient, OverpassPlacesClient, HybridPlacesClient],
}
```

### Phase 6: scan.service.ts の注入変更

`@Inject(PLACES_PROVIDER_TOKEN) private readonly placesClient: StoreCandidateProvider` に変更。

### Phase 7: テスト更新

`scan.service.spec.ts`: `PlacesClient` モックを `{ provide: PLACES_PROVIDER_TOKEN, useValue: mockPlaces }` に変更。
`overpass-places.client.spec.ts` を新規作成（正常系・空・エラー・タイムアウト・name なし除外）。
`google-places.client.spec.ts` を新規作成（既存 `places.client.spec.ts` があればリネーム）。

## Files to modify

| ファイル | 変更種別 |
|---|---|
| `backend/src/shared/places.constants.ts` | 新規作成 |
| `backend/src/shared/places.interface.ts` | 新規作成 |
| `backend/src/shared/google-places.client.ts` | 新規作成（`places.client.ts` のリネーム） |
| `backend/src/shared/places.client.ts` | 削除 |
| `backend/src/shared/overpass-places.client.ts` | 新規作成 |
| `backend/src/shared/hybrid-places.client.ts` | 新規作成 |
| `backend/src/scan/scan.module.ts` | 変更（factory provider 追加、旧 PlacesClient 削除） |
| `backend/src/scan/scan.service.ts` | 変更（`@Inject(PLACES_PROVIDER_TOKEN)` に切り替え） |
| `backend/src/scan/scan.service.spec.ts` | 変更（PlacesClient モックを token ベースに更新） |
| `backend/src/shared/overpass-places.client.spec.ts` | 新規作成 |
| `backend/src/shared/google-places.client.spec.ts` | 新規作成（旧 `places.client.spec.ts` があればリネーム） |

## Tests to add

### `overpass-places.client.spec.ts`（新規）

| シナリオ | 期待結果 |
|---|---|
| 正常レスポンス（`elements` に `tags.name` あり） | `StoreCandidate[]` を返す |
| `elements` が空配列 | `[]` を返す |
| HTTP エラー（500） | `[]` を返す（例外なし） |
| fetch がネットワークエラーを throw | `[]` を返す（例外なし） |
| `tags.name` がない要素が含まれる | name ありの要素のみを返す |

### `google-places.client.spec.ts`（既存があればリネーム・なければ新規）

| シナリオ | 期待結果 |
|---|---|
| `GOOGLE_PLACES_API_KEY` 未設定 | `[]` を返す |
| API が正常レスポンス | `StoreCandidate[]` を返す |
| API が HTTP エラー | `[]` を返す |

### `scan.service.spec.ts`（変更）

- `PlacesClient` モックを `{ provide: PLACES_PROVIDER_TOKEN, useValue: mockPlaces }` に変更（既存テストのロジックは変更不要）

## Completion criteria

- [ ] `backend/src/shared/places.constants.ts` が存在する（ファイル存在確認）
- [ ] `places.constants.ts` に `PLACES_SEARCH_RADIUS_M` が存在する（`grep "PLACES_SEARCH_RADIUS_M" backend/src/shared/places.constants.ts` でヒット 1 以上）
- [ ] `places.constants.ts` に `STORE_CANDIDATES_LIMIT` が存在する（`grep "STORE_CANDIDATES_LIMIT" backend/src/shared/places.constants.ts` でヒット 1 以上）
- [ ] `places.constants.ts` に `OVERPASS_TIMEOUT_MS` が存在する（`grep "OVERPASS_TIMEOUT_MS" backend/src/shared/places.constants.ts` でヒット 1 以上）
- [ ] `backend/src/shared/places.interface.ts` が存在する（ファイル存在確認）
- [ ] `places.interface.ts` に `StoreCandidateProvider` が存在する（`grep "StoreCandidateProvider" backend/src/shared/places.interface.ts` でヒット 1 以上）
- [ ] `places.interface.ts` に `PLACES_PROVIDER_TOKEN` が存在する（`grep "PLACES_PROVIDER_TOKEN" backend/src/shared/places.interface.ts` でヒット 1 以上）
- [ ] `places.interface.ts` に数値リテラルが存在しない（`grep "[0-9]\{2,\}" backend/src/shared/places.interface.ts` でヒット 0）
- [ ] `backend/src/shared/google-places.client.ts` が存在する（ファイル存在確認）
- [ ] `google-places.client.ts` に `implements StoreCandidateProvider` が存在する（`grep "implements StoreCandidateProvider" backend/src/shared/google-places.client.ts` でヒット 1 以上）
- [ ] 旧 `backend/src/shared/places.client.ts` が存在しない（ファイル不在確認）
- [ ] `backend/src/shared/overpass-places.client.ts` が存在する（ファイル存在確認）
- [ ] `overpass-places.client.ts` に `implements StoreCandidateProvider` が存在する（`grep "implements StoreCandidateProvider" backend/src/shared/overpass-places.client.ts` でヒット 1 以上）
- [ ] `overpass-places.client.ts` に `overpass-api.de` が存在する（`grep "overpass-api.de" backend/src/shared/overpass-places.client.ts` でヒット 1 以上）
- [ ] `backend/src/shared/hybrid-places.client.ts` が存在する（ファイル存在確認）
- [ ] `hybrid-places.client.ts` に `implements StoreCandidateProvider` が存在する（`grep "implements StoreCandidateProvider" backend/src/shared/hybrid-places.client.ts` でヒット 1 以上）
- [ ] `hybrid-places.client.ts` に `OverpassPlacesClient` の参照が存在する（`grep "OverpassPlacesClient" backend/src/shared/hybrid-places.client.ts` でヒット 1 以上）
- [ ] `hybrid-places.client.ts` に `GooglePlacesClient` の参照が存在する（`grep "GooglePlacesClient" backend/src/shared/hybrid-places.client.ts` でヒット 1 以上）
- [ ] `scan.module.ts` に `PLACES_PROVIDER_TOKEN` の参照が存在する（`grep "PLACES_PROVIDER_TOKEN" backend/src/scan/scan.module.ts` でヒット 1 以上）
- [ ] `scan.module.ts` に `PLACES_PROVIDER` 環境変数の参照が存在する（`grep "PLACES_PROVIDER" backend/src/scan/scan.module.ts` でヒット 1 以上）
- [ ] `scan.module.ts` に旧 `PlacesClient` の直接参照が存在しない（`grep "'PlacesClient'" backend/src/scan/scan.module.ts` でヒット 0）
- [ ] `scan.service.ts` に `PLACES_PROVIDER_TOKEN` を使った `@Inject` が存在する（`grep "PLACES_PROVIDER_TOKEN" backend/src/scan/scan.service.ts` でヒット 1 以上）
- [ ] `scan.service.ts` に `PlacesClient` の直接型参照が存在しない（`grep ": PlacesClient" backend/src/scan/scan.service.ts` でヒット 0）
- [ ] `PLACES_SEARCH_RADIUS_M` の定義が `places.constants.ts` のみに存在する（`grep -r "PLACES_SEARCH_RADIUS_M\s*=" backend/src/` でヒットが `places.constants.ts` の 1 件のみ）
- [ ] `overpass-places.client.spec.ts` が存在し全テスト PASS する
- [ ] `pnpm --filter backend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter backend test` が全テスト PASS で終了する（FAIL 0 件）

## Risks

| リスク | 回避方針 |
|---|---|
| `scan.service.spec.ts` の既存テストが `PlacesClient` を直接 `providers` に登録している | generator が Read して `{ provide: PLACES_PROVIDER_TOKEN, useValue: mockPlaces }` に変更すること |
| 旧 `places.client.ts` を削除した後に import 漏れがある | `grep -r "places.client" backend/src/` で全参照を事前確認してから削除すること |
| `HybridPlacesClient` のコンストラクタ DI が circular dependency になる | Overpass/Google は互いを参照しない設計のため発生しない |

# Implementation summary

## Phase 1: 定数ファイル・インターフェースファイル新規作成
- `backend/src/shared/places.constants.ts` (新規): `PLACES_SEARCH_RADIUS_M=10`, `STORE_CANDIDATES_LIMIT=5`, `OVERPASS_TIMEOUT_MS=5000` を named export
- `backend/src/shared/places.interface.ts` (新規): `StoreCandidate` 型・`StoreCandidateProvider` インターフェース・`PLACES_PROVIDER_TOKEN` を export。数値リテラルなし

## Phase 2: GooglePlacesClient へのリネーム・リファクタリング
- `backend/src/shared/google-places.client.ts` (新規): 旧 `places.client.ts` をリネームしクラス名を `GooglePlacesClient` に変更。`StoreCandidateProvider` を implements。定数・型を各専用ファイルから import
- 旧 `backend/src/shared/places.client.ts` を削除

## Phase 3: OverpassPlacesClient 新規作成
- `backend/src/shared/overpass-places.client.ts` (新規): Overpass API（POST）で `convenience|supermarket|grocery` を検索。`AbortController` + `OVERPASS_TIMEOUT_MS` でタイムアウト。`tags.name` が文字列の要素のみ返す。エラー・タイムアウト・空 elements は `[]`

## Phase 4: HybridPlacesClient 新規作成
- `backend/src/shared/hybrid-places.client.ts` (新規): Overpass primary → Google fallback。Overpass 結果が空のときのみ Google を呼ぶ

## Phase 5: scan.module.ts に factory provider 追加
- `backend/src/scan/scan.module.ts` (変更): `GooglePlacesClient`, `OverpassPlacesClient`, `HybridPlacesClient` を providers に追加。`PLACES_PROVIDER` 環境変数で切り替える factory provider を追加。旧 `PlacesClient` を削除

## Phase 6: scan.service.ts の注入変更
- `backend/src/scan/scan.service.ts` (変更): `@Inject(PLACES_PROVIDER_TOKEN) private readonly placesClient: StoreCandidateProvider` に変更。旧 `PlacesClient` 直接依存を削除

## Phase 7: テスト更新・新規作成
- `backend/src/scan/scan.service.spec.ts` (変更): `{ provide: PlacesClient, ... }` を `{ provide: PLACES_PROVIDER_TOKEN, ... }` に変更（2箇所）
- `backend/src/shared/google-places.client.spec.ts` (新規): APIキー未設定・正常・HTTPエラー・ネットワークエラー の4シナリオ
- `backend/src/shared/overpass-places.client.spec.ts` (新規): 正常・空配列・HTTPエラー・ネットワークエラー・name なし除外 の5シナリオ

# Plan deviation

none

# Review comments

## 自動評価（2026-05-20 20:27） - ラウンド 1

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 0）

### Threshold 達成状況
- 1. 動作性: ✅（Completion criteria 25/25 通過、typecheck 0件、unit 124件全 PASS）
- 2. セキュリティ: ✅（Medium 以上 0 件）
- 3. カバレッジ: ✅（新規ロジック全経路に spec あり: overpass 5シナリオ・google 4シナリオ・scan.service PlacesClient 連携 4シナリオ）
- 4. 敵対的観点: ✅（Critical/High 0 件）
- 5. 保守性: ✅（層違反 0 / アンチパターン 0 / マジックナンバー 0 / 冗長コメント 0）

### 改善提案（次タスク繰越し可）
- [保守性] `STORE_CANDIDATES_LIMIT` は Overpass クライアントから参照されていない。Overpass は OSM 側の `out body` で全件返すため適用できないが、将来 Overpass 結果の上限を制御したい場合は `STORE_CANDIDATES_LIMIT` を適用するとよい（現状の設計として問題はなく、Low 情報扱い）。
- [セキュリティ] Overpass API はパブリックサーバーのため、高負荷時にレート制限・タイムアウトが発生する可能性がある。`OVERPASS_TIMEOUT_MS=5000` で AbortController を設定済みだが、本番運用では Overpass インスタンスの自己ホスト or キャッシュ層追加を検討する（Info）。
