# Task 00150: オンボーディング完了状態のサーバー側永続化

## Metadata

| Field | Value |
|---|---|
| Status | pending |
| Created | 2026-05-19 |
| Priority | high |
| Sprint | Week4 |
| Dependencies | 00120_onboarding_flow（useOnboarding / useOnboardingGuard が存在すること）、00091_user-id-cookie（Cookie 認証基盤が存在すること） |

## Background

`frontend/src/hooks/useOnboarding.ts` の `completeOnboarding()` は `PUT /users/me` 成功後に
`localStorage.setItem('onboarding_done', 'true')` をセットする（L114）。

`frontend/src/hooks/useOnboardingGuard.ts` は `localStorage.getItem('onboarding_done') !== 'true'`
のみを判定条件としている（L16-L18）。

この結果、以下の問題が発生している:
1. localStorage をクリアした場合（ブラウザキャッシュ削除・別ブラウザ・プライベートモード）に
   `useOnboardingGuard` が `/onboarding` へリダイレクトする
2. ユーザーが全4ステップを再度踏む
3. `completeOnboarding()` が `PUT /users/me` を呼び、サーバー上の既存アレルゲン設定を上書きしてしまう

`backend/prisma/schema.prisma` の `User` モデル（`@@map("users")`）に `onboarding_done` カラムは存在しない。

`frontend/src/app/settings/settings.types.ts` の `UserProfile` 型に `onboarding_done: boolean` フィールドは存在しない。

`backend/src/users/users.controller.ts` には `GET /users/me`・`PUT /users/me`・`DELETE /users/me` の
実装が確認できない（TBD: generator がバックエンドの `/users/me` 実装箇所を確認すること）。

## Requirements

- R1: `backend/prisma/schema.prisma` の `User` モデルに `onboardingDone Boolean @default(false) @map("onboarding_done")` カラムを追加し、Prisma マイグレーションを生成する（`DEFAULT false`・`NOT NULL`）
- R2: `GET /users/me` のレスポンスに `onboarding_done: boolean` を含める（`UserProfile` 型に追加）
- R3: `POST /users/init` のレスポンスに `onboarding_done: boolean` を含める（新規ユーザーは常に `false`）
- R4: `PUT /users/me` のリクエストボディに `onboarding_done?: boolean` を受け付け、`true` が渡された場合に DB に保存する（既存フィールド `allergies`・`locale` の更新ロジックを破壊しない）
- R5: バックエンドの `UsersRepository` に `onboarding_done` の読み書きを追加する（`findById` の返却型・`update` メソッド等）
- R6: `frontend/src/app/settings/settings.types.ts` の `UserProfile` 型に `onboarding_done: boolean` を追加する
- R7: `frontend/src/app/settings/settings.types.ts` の `UpdateUserBody` 型に `onboarding_done?: boolean` を追加する
- R8: `frontend/src/hooks/useOnboarding.ts` の `completeOnboarding()` を改修し、`PUT /users/me` のボディに `{ onboarding_done: true }` を追加する（`localStorage.setItem` と `/scan` への遷移は既存のまま維持する）
- R9: `frontend/src/hooks/useOnboardingGuard.ts` を改修し、以下の2段階判定に変更する
  - `localStorage.getItem('onboarding_done') === 'true'` → 高速パスでそのまま通過（API 呼び出しなし）
  - `localStorage` に値なし → `GET /users/me` を呼んで `onboarding_done` を確認する
    - `true` → `localStorage.setItem('onboarding_done', 'true')` を書いて通過
    - `false` または API エラー → `/onboarding` へリダイレクト
- R10: R9 の `GET /users/me` 呼び出しは `useSettings` フックが既にキャッシュしている場合は重複呼び出しにならないよう実装する（TBD: generator がキャッシュ戦略を判断すること。クライアント側 `src/lib/cache.ts` の流用可）
- R11: `useOnboardingGuard` のフォールバック判定中はリダイレクトを保留し、判定完了後にのみリダイレクト or 通過を確定する（判定中に画面がフラッシュしない）
- R12: `as any`・`@ts-ignore` を新規追加しない
- R13: 新規 UI テキストなし（既存フローの内部ロジック変更のみ）
- R14: `pnpm --filter frontend typecheck` および `pnpm --filter backend typecheck` がエラー 0 件で終了すること
- R15: `pnpm --filter frontend test` および `pnpm --filter backend test` が全テスト PASS で終了すること

## Implementation plan

### Phase 1: DB マイグレーション（バックエンド）

`backend/prisma/schema.prisma` の `User` モデルに `onboardingDone` フィールドを追加する。
`DEFAULT false` かつ `NOT NULL` のため、既存レコードは全て `false` になる。
マイグレーションファイルを `prisma migrate dev` 相当で生成する。

影響範囲: `backend/prisma/schema.prisma`、`backend/prisma/migrations/` 配下の新規マイグレーションファイル

### Phase 2: バックエンド Repository / Service / Controller 更新

`UsersRepository.findById` の返却型（`UserRecord`）に `onboardingDone: boolean` を追加する。
`UserRecord` を返す全メソッドの `select` 句に `onboardingDone` を追加する。

`GET /users/me` のレスポンス型に `onboarding_done: boolean` を追加する。
`POST /users/init` のレスポンス型（`InitResponse`）に `onboarding_done: boolean` を追加し、
新規ユーザーは `false` を返す。既存ユーザー（Cookie 発行済み）は DB から取得した値を返す。

`PUT /users/me` ハンドラが `onboarding_done: true` を受け取った場合に `update` クエリで `onboarding_done = true` を保存する。
`onboarding_done: false` への上書きは許可しない（一度 true にしたら戻さない安全設計）。

影響範囲: `backend/src/users/users.repository.ts`、`backend/src/users/users.controller.ts`（または `GET/PUT/DELETE /users/me` の実装ファイル・TBD）、関連するテストファイル

### Phase 3: フロントエンド型定義更新

`frontend/src/app/settings/settings.types.ts` の `UserProfile` と `UpdateUserBody` を更新する。
型変更に連動して typecheck エラーが発生する箇所を全て修正する。

影響範囲: `frontend/src/app/settings/settings.types.ts`

### Phase 4: useOnboarding 改修

`completeOnboarding()` の `updateUser()` 呼び出しに `onboarding_done: true` を追加する。

影響範囲: `frontend/src/hooks/useOnboarding.ts`（L113 付近）

### Phase 5: useOnboardingGuard 改修

`localStorage` の高速パスを維持しつつ、未設定時に `getUser()` を呼んでサーバー側の値を確認する。
判定完了まで `status: 'loading'` 状態を保持してリダイレクト保留とする（画面フラッシュ防止）。
API エラー時は安全側に倒して `/onboarding` へリダイレクトする。

影響範囲: `frontend/src/hooks/useOnboardingGuard.ts`

### Phase 6: テスト追加・既存テスト修正

バックエンド: `POST /users/init` の既存テストを `onboarding_done: false` が返ることを検証するように更新する。
`PUT /users/me` で `onboarding_done: true` が保存されることの単体テストを追加する。
`PUT /users/me` で `onboarding_done: false` への上書きが無視されることを検証するテストを追加する。

フロントエンド: `useOnboardingGuard` のテストに以下を追加する。
- `localStorage` なし + `GET /users/me` が `{ onboarding_done: true }` を返す場合 → 通過し `localStorage` が `'true'` になる
- `localStorage` なし + `GET /users/me` が `{ onboarding_done: false }` を返す場合 → `/onboarding` へリダイレクト
- `localStorage` なし + `GET /users/me` が失敗する場合 → `/onboarding` へリダイレクト

`useOnboarding` のテストに以下を追加する。
- `completeOnboarding()` 呼び出し時に `updateUser` が `{ onboarding_done: true }` を含むボディで呼ばれること

## Files to modify

| ファイル | 変更種別 |
|---|---|
| `backend/prisma/schema.prisma` | 変更（`onboardingDone` カラム追加） |
| `backend/prisma/migrations/` | 新規マイグレーションファイル生成 |
| `backend/src/users/users.repository.ts` | 変更（`UserRecord` 型・`findById` の `select`・`update` メソッド追加） |
| `backend/src/users/users.controller.ts`（または `GET/PUT /users/me` 実装ファイル: TBD） | 変更（レスポンス型に `onboarding_done` 追加・`onboarding_done` 保存ロジック追加） |
| `backend/src/users/users.controller.spec.ts` | 変更（`POST /users/init` テストに `onboarding_done: false` の検証を追加） |
| `frontend/src/app/settings/settings.types.ts` | 変更（`UserProfile`・`UpdateUserBody` 型更新） |
| `frontend/src/hooks/useOnboarding.ts` | 変更（`completeOnboarding` のボディに `onboarding_done: true` 追加） |
| `frontend/src/hooks/useOnboardingGuard.ts` | 変更（2段階判定ロジックに改修） |
| `frontend/src/hooks/__tests__/useOnboarding.test.ts` | 変更（`onboarding_done: true` 送信の検証追加） |
| `frontend/src/hooks/__tests__/useOnboardingGuard.test.ts` | 変更（フォールバック3ケース追加） |

## Tests to add

### バックエンド（`users.controller.spec.ts` または GET/PUT/DELETE 担当ファイル）

| シナリオ | 期待結果 |
|----------|----------|
| Cookie なしで `POST /users/init` を呼ぶ | `{ created: true, onboarding_done: false }` を返す |
| Cookie あり（既存ユーザー）で `POST /users/init` を呼ぶ | `{ created: false, onboarding_done: <DBの値> }` を返す |
| `PUT /users/me` に `{ onboarding_done: true }` を渡す | `UsersRepository.update` が `onboardingDone: true` で呼ばれる |
| `PUT /users/me` に `{ onboarding_done: false }` を渡す | `UsersRepository.update` が `onboardingDone: false` で呼ばれない（無視される） |
| `GET /users/me` で既存ユーザー（`onboarding_done: true`）を取得 | レスポンスに `onboarding_done: true` が含まれる |

### フロントエンド（`useOnboardingGuard.test.ts`）

| シナリオ | 期待結果 |
|----------|----------|
| `localStorage` なし・`getUser()` が `{ onboarding_done: true }` を返す | リダイレクトなし・`localStorage.getItem('onboarding_done')` が `'true'` になる |
| `localStorage` なし・`getUser()` が `{ onboarding_done: false }` を返す | `router.replace('/onboarding')` が呼ばれる |
| `localStorage` なし・`getUser()` が reject する | `router.replace('/onboarding')` が呼ばれる |
| `localStorage` あり（`'true'`） | `getUser()` が呼ばれない（高速パス） |

### フロントエンド（`useOnboarding.test.ts`）

| シナリオ | 期待結果 |
|----------|----------|
| `completeOnboarding()` 呼び出し | `updateUser` が `{ ..., onboarding_done: true }` を含むボディで呼ばれる |

## Completion criteria

- [ ] `backend/prisma/schema.prisma` の `User` モデルに `onboardingDone Boolean @default(false) @map("onboarding_done")` が存在する（`grep "onboarding_done" backend/prisma/schema.prisma` でヒット）
- [ ] `backend/prisma/migrations/` 配下に `onboarding_done` カラム追加の SQL を含む新規マイグレーションファイルが存在する（`grep -r "onboarding_done" backend/prisma/migrations/` でヒット）
- [ ] `backend/src/users/users.repository.ts` の `UserRecord` 型に `onboardingDone: boolean` が存在する（`grep "onboardingDone" backend/src/users/users.repository.ts` でヒット）
- [ ] `GET /users/me` レスポンスに `onboarding_done` フィールドが含まれる（バックエンドの `GET /users/me` ハンドラファイルで `grep "onboarding_done"` でヒット）
- [ ] `POST /users/init` レスポンスに `onboarding_done` フィールドが含まれる（`grep "onboarding_done" backend/src/users/users.controller.ts` でヒット）
- [ ] `PUT /users/me` のハンドラで `onboarding_done: true` を受け取った場合に DB 更新ロジックが通る（ハンドラファイルで `grep "onboarding_done"` でヒット）
- [ ] `PUT /users/me` のハンドラで `onboarding_done: false` を無視するガードが実装されている（ハンドラファイルで `onboarding_done` を `true` 時のみ更新するコードが確認できる）
- [ ] `frontend/src/app/settings/settings.types.ts` の `UserProfile` 型に `onboarding_done: boolean` が存在する（`grep "onboarding_done" frontend/src/app/settings/settings.types.ts` でヒット）
- [ ] `frontend/src/app/settings/settings.types.ts` の `UpdateUserBody` 型に `onboarding_done?: boolean` が存在する（`grep "onboarding_done" frontend/src/app/settings/settings.types.ts` でヒット）
- [ ] `frontend/src/hooks/useOnboarding.ts` の `completeOnboarding()` 内の `updateUser()` 呼び出しに `onboarding_done: true` が含まれる（`grep "onboarding_done" frontend/src/hooks/useOnboarding.ts` でヒット）
- [ ] `frontend/src/hooks/useOnboardingGuard.ts` に `getUser` の import が存在する（`grep "getUser" frontend/src/hooks/useOnboardingGuard.ts` でヒット）
- [ ] `localStorage` が `'true'` の場合に `getUser()` を呼ばない分岐が `useOnboardingGuard.ts` に存在する（`grep "localStorage" frontend/src/hooks/useOnboardingGuard.ts` でヒット件数が 1 件以上）
- [ ] `useOnboardingGuard.ts` のテストで「`localStorage` なし・`onboarding_done: true` 返却 → 通過」ケースが PASS する（`pnpm --filter frontend test -- --testPathPattern useOnboardingGuard` で新規追加テストが合格）
- [ ] `useOnboardingGuard.ts` のテストで「`localStorage` なし・`onboarding_done: false` 返却 → `/onboarding` リダイレクト」ケースが PASS する
- [ ] `useOnboardingGuard.ts` のテストで「`localStorage` なし・`getUser()` reject → `/onboarding` リダイレクト」ケースが PASS する
- [ ] `useOnboarding.test.ts` のテストで「`completeOnboarding()` が `onboarding_done: true` を含むボディで `updateUser` を呼ぶ」ケースが PASS する
- [ ] `backend/src/users/users.controller.spec.ts` で `POST /users/init` が `onboarding_done: false` を返すテストが PASS する
- [ ] `pnpm --filter backend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter backend test` が全テスト PASS で終了する（FAIL 0 件）
- [ ] `pnpm --filter frontend test` が全テスト PASS で終了する（FAIL 0 件）
- [ ] `backend/src/users/users.controller.ts`（および関連ファイル）に `as any` が新規追加されていない（`grep "as any" backend/src/users/` でヒット件数 0）
- [ ] `frontend/src/hooks/useOnboardingGuard.ts` に `as any` が存在しない（`grep "as any" frontend/src/hooks/useOnboardingGuard.ts` でヒット件数 0）

## Risks

| リスク | 回避方針 |
|---|---|
| `GET /users/me`・`PUT /users/me`・`DELETE /users/me` のバックエンド実装ファイルが `users.controller.ts` 以外に存在するか不明（コードベース上に確認できなかった） | generator が `grep -r "users/me" backend/src/` で実装箇所を特定すること。未実装の場合は `users.controller.ts` に `@Get('me')`・`@Put('me')`・`@Delete('me')` を追加する |
| `onboarding_done: false` への上書きを許可すると、設定画面での `PUT /users/me` 呼び出しがフラグをリセットしてしまう | ハンドラで `onboarding_done === true` のときのみ DB 更新する（`false` は無視）。または `UpdateUserBody` の `onboarding_done` を `true` のみ受け付ける literal 型 `true` とする |
| `useOnboardingGuard` の `GET /users/me` フォールバックが `useSettings` と重複呼び出しになる | `src/lib/cache.ts` のクライアントキャッシュ（TTL 2時間）を使い同一セッション内で重複呼び出しを防ぐ。または `useSettings` が先に呼ばれている場合のみ流用する（TBD: generator が実装戦略を選択すること） |
| `useOnboardingGuard` の判定中（`loading` 状態）に画面がフラッシュする | 判定完了前はリダイレクトも通過も行わず `null` を返すか、ローディング状態を `status` として返すことで呼び出し元ページが描画を遅延できるようにする |
| マイグレーション適用前に既存ユーザーが `GET /users/me` を叩くと `onboarding_done` が `null` になる可能性 | `DEFAULT false` が SQL レベルで設定されているため、マイグレーション適用後は全既存レコードが `false` になる。Prisma の型は `Boolean` だが `null` に備えて `onboardingDone ?? false` のフォールバックをリポジトリ層で実装する |
