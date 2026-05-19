# Task 00130: バックアップコード（デバイス引き継ぎ）

## Metadata

| Field | Value |
|---|---|
| Status | completed |
| Priority | medium |
| Sprint | Week4 |
| Dependencies | 00110_settings_screen / 00120_onboarding_flow（users テーブル・Cookie 認証が稼働済みであること） |
| completed_date | 2026-05-19 |

## Background

機種変更時にアレルギー設定とスキャン履歴を新デバイスへ引き継ぐためのバックアップコード機能。`docs/design/database.md` に `backup_codes` テーブル定義・コードルール（`ALRG-XXXX-XXXX` 形式・O/0・I/1 除外・有効期限7日・1回使用限り）が定義済み。

バックエンド（NestJS）の `backend/src/users/` に BackupCode 関連ファイルを追加し、フロントエンドは設定画面とオンボーディング画面に UI を追加する。

影響ファイル（バックエンド）:
- `backend/src/users/backup-code.controller.ts` — 新規作成
- `backend/src/users/backup-code.service.ts` — 新規作成
- `backend/src/users/backup-code.repository.ts` — 新規作成
- `backend/src/users/users.module.ts` — 変更（BackupCode 関連を DI に追加）
- DB マイグレーション: `backup_codes` テーブルが未作成なら DDL を追加（NULL 許容 / DEFAULT 付き）

影響ファイル（フロントエンド）:
- `frontend/src/app/settings/page.tsx` — 変更（「バックアップコードを発行」ボタン追加）
- `frontend/src/app/onboarding/restore/page.tsx` — 新規作成（引き継ぎコード入力画面）
- `frontend/src/lib/api/backup-code.ts` — API クライアント関数（新規作成）
- `frontend/public/locales/ja/settings.json` — キー追加（backup_code セクション）
- `frontend/public/locales/en/settings.json` — キー追加

## Requirements

### バックエンド

- R1: `POST /users/backup-code` でバックアップコードを発行する（Controller → Service → Repository の層境界を守る）
- R2: コード形式は `ALRG-XXXX-XXXX`（英数字8文字を4文字×2ブロックに分割）、O/0・I/1 は使用しない、大文字英数字のみ
- R3: 発行時に既存の未使用コード（同じ `user_id` の `is_used: false` かつ `expires_at > NOW()`）を `is_used: true` にしてから新コードを発行する（再発行で旧コードが即失効）
- R4: `backup_codes` テーブルへの INSERT は `expires_at = NOW() + INTERVAL '7 days'` で保存する
- R5: `POST /users/restore` でコードを受け取り、`backup_codes` テーブルを照合する
- R6: 照合時に `is_used: true` または `expires_at < NOW()` のコードは 400 を返し `{ message: 'code_invalid' }` を返す（エラーメッセージをフロントで i18n キーに変換できる形式）
- R7: 引き継ぎ成功時は新デバイスの Cookie（リクエスト内の Cookie で識別した `user_id`）を旧 `user_id` のデータに紐づける。具体的には新 `users` レコードを削除し、旧 `users` の Cookie を新デバイスに発行し直す（TBD: generator が安全な引き継ぎ方法を確認）
- R8: `is_used: true` に更新・`used_at = NOW()` を記録してから引き継ぎ完了レスポンスを返す
- R9: ログにコード値そのものを出力しない（`implementation_rules.md` 個人情報制約に準ずる）
- R10: `code` カラムは UNIQUE 制約があるため INSERT 失敗時は再生成をリトライする（最大3回）

### フロントエンド

- R11: 設定画面の「バックアップコードを発行」ボタンを押すと `POST /users/backup-code` を呼び出し、発行されたコードをモーダルで表示する
- R12: モーダル内に有効期限（発行から7日後の日付）と「⚠️ このコードは他人に見せないでください」警告を表示する（i18n キー経由）
- R13: 「新しいコードを発行」ボタンを押すと確認ダイアログを表示し、承認後に再発行 API を呼ぶ（旧コード失効の説明を含める）
- R14: オンボーディング画面1（`/onboarding`）に「引き継ぎコードをお持ちの方」リンクを追加し、`/onboarding/restore` へ遷移する
- R15: `/onboarding/restore` に `ALRG-[4文字]-[4文字]` 形式の入力フォームを実装する（入力補助: 自動大文字変換、4文字ごとにハイフンを自動挿入）
- R16: 引き継ぎ成功後は Cookie が新しい状態になるため、`localStorage.setItem('onboarding_done', 'true')` をセットし `/scan` へ遷移する
- R17: 引き継ぎ失敗（`code_invalid`）時は i18n キーに変換したエラーメッセージをインラインで表示する
- R18: すべての UIテキストを i18n キーで管理する
- R19: API 通信は `frontend/src/lib/api/backup-code.ts` に集約し、Page コンポーネントは直接 `fetch` しない

## Implementation plan

### Phase 1: バックエンド — Repository / Service / Controller
- `backup-code.repository.ts`: `findActiveByUserId` / `invalidateAllByUserId` / `create` / `findByCode` / `markAsUsed` を実装
- `backup-code.service.ts`: コード生成ロジック（O/0・I/1 除外の文字セット）/ 発行フロー / 引き継ぎフロー を実装。SQL は Repository に委譲
- `backup-code.controller.ts`: `POST /users/backup-code` / `POST /users/restore` を Cookie 認証ガード付きで実装
- `users.module.ts` に BackupCode 関連プロバイダを追加

### Phase 2: バックエンド — DB マイグレーション
- `backup_codes` テーブルが未作成の場合、Prisma スキーマまたは SQL マイグレーションファイルを追加
- `CREATE INDEX backup_codes_code_idx ON backup_codes(code)` を含める（`database.md` 定義通り）

### Phase 3: フロントエンド — API クライアントと設定画面追加
- `frontend/src/lib/api/backup-code.ts` に `issueBackupCode` / `restoreFromCode` 関数を実装
- `frontend/src/app/settings/page.tsx` にバックアップコード発行 UI（モーダル）を追加
- `settings.json` に `backup_code.*` キーを追加

### Phase 4: フロントエンド — 引き継ぎ画面
- `frontend/src/app/onboarding/restore/page.tsx` を新規作成
- コード入力フォーム（自動大文字化・ハイフン自動挿入）
- 送信 → `restoreFromCode()` → 成功/失敗分岐
- `onboarding.json` に `restore.*` キーを追加

## Files to modify

| ファイル | 変更種別 |
|---|---|
| `backend/src/users/backup-code.repository.ts` | 新規作成 |
| `backend/src/users/backup-code.service.ts` | 新規作成 |
| `backend/src/users/backup-code.controller.ts` | 新規作成 |
| `backend/src/users/users.module.ts` | 変更（DI 追加） |
| DB マイグレーションファイル | 新規作成（backup_codes テーブル） |
| `frontend/src/lib/api/backup-code.ts` | 新規作成 |
| `frontend/src/app/settings/page.tsx` | 変更（発行 UI 追加） |
| `frontend/src/app/onboarding/restore/page.tsx` | 新規作成 |
| `frontend/public/locales/ja/settings.json` | 変更（backup_code キー追加） |
| `frontend/public/locales/en/settings.json` | 変更（backup_code キー追加） |
| `frontend/public/locales/ja/onboarding.json` | 変更（restore キー追加） |
| `frontend/public/locales/en/onboarding.json` | 変更（restore キー追加） |

## Tests to add

### バックエンド

- `backend/src/users/__tests__/backup-code.service.spec.ts`
  - 発行されたコードが `ALRG-[A-Z0-9]{4}-[A-Z0-9]{4}` パターンにマッチすることを検証（正規表現）
  - 発行されたコードに O・0・I・1 が含まれないことを検証
  - 再発行時に既存の有効コードが `is_used: true` になることを検証
  - 引き継ぎ時に `is_used: true` のコードで 400 を返すことを検証
  - 引き継ぎ時に `expires_at < NOW()` のコードで 400 を返すことを検証
  - 引き継ぎ成功時に `is_used: true` かつ `used_at` が設定されることを検証

### フロントエンド

- `frontend/src/lib/api/__tests__/backup-code.test.ts`
  - `issueBackupCode` が `POST /users/backup-code` に `credentials: 'include'` で呼ばれることを検証
  - `restoreFromCode` が `POST /users/restore` に `credentials: 'include'` で呼ばれることを検証

## Completion criteria

- [ ] `POST /users/backup-code` を有効な Cookie 付きで呼ぶと 201 とコードオブジェクト（`{ code: string, expires_at: string }`）を返す
- [ ] 返されたコードが正規表現 `/^ALRG-[A-Z2-9]{4}-[A-Z2-9]{4}$/`（O/0・I/1 を除く文字セット）にマッチする
- [ ] 同じ `user_id` で2回 `POST /users/backup-code` を呼ぶと、1回目のコードが `is_used: true` になる（DB 直接確認またはモックで検証）
- [ ] `POST /users/restore` に有効なコードを送ると 200 を返す
- [ ] `POST /users/restore` に `is_used: true` のコードを送ると 400 と `{ message: 'code_invalid' }` を返す
- [ ] `POST /users/restore` に期限切れコードを送ると 400 と `{ message: 'code_invalid' }` を返す
- [ ] Cookie なしで `POST /users/backup-code` を呼ぶと 401 を返す
- [ ] 設定画面で「バックアップコードを発行」ボタンを押すとモーダルが表示され、`ALRG-XXXX-XXXX` 形式のコードと有効期限が表示される
- [ ] 設定画面の「新しいコードを発行」押下で確認ダイアログが表示される（即再発行しない）
- [ ] `/onboarding/restore` でコードを入力して送信すると `POST /users/restore` が呼ばれる
- [ ] 引き継ぎ成功後に `localStorage.onboarding_done === 'true'` となり `/scan` へ遷移する
- [ ] 引き継ぎ失敗時にエラーメッセージがインライン表示される（画面遷移しない）
- [ ] `backup-code.service.ts` 内の Logger 呼び出しでコード値がそのままログ出力されていない（コードはマスクまたはログ対象外）
- [ ] `pnpm --filter backend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter frontend typecheck` がエラー 0 件で終了する
- [ ] `pnpm --filter backend test` がエラー 0 件で終了する（新規テストを含む）
- [ ] `pnpm --filter frontend test` がエラー 0 件で終了する（新規テストを含む）

## Risks

| リスク | 回避方針 |
|---|---|
| 引き継ぎ時の `user_id` 入れ替えでスキャン履歴・設定の孤立が起きる | Service 内でトランザクションを使い、旧 `user_id` に紐づく全データを新 `user_id` に UPDATE してから旧 users レコードを削除する（TBD: generator が DB FK 制約を確認） |
| コード生成の文字セットが誤り O/0・I/1 が混入する | 文字セットを定数として定義し、ユニットテストで O・0・I・1 が含まれないことを検証する |
| UNIQUE 衝突による INSERT 失敗 | リトライ（最大3回）を Service 層に実装し、3回失敗時は 500 を返す |
| `POST /users/restore` の引き継ぎ後に旧デバイスが同じ Cookie で操作できてしまう | 引き継ぎ成功時に旧 Cookie を無効化する（`users.last_used_at` の監視または Cookie の再発行で新デバイス専用セッションにする。TBD: generator 確認） |

---

## Implementation summary

### Phase 1: バックエンド — Repository / Service / Controller

- `backup-code.constants.ts` 新規作成（L7: 文字セット定数 / L25: パターン正規表現）
- `backup-code.repository.ts` 新規作成（L12-L73: findActiveByUserId / invalidateAllByUserId / create / findByCode / markAsUsed の5メソッド）
- `backup-code.service.ts` 新規作成（L44-L71: issueCode, L78-L136: restoreFromCode, L139-L161: generateCode）
  - リトライループは`_attempt`変数でUNIQUE衝突を最大3回リトライ
  - `restoreFromCode`はトランザクション内でscan_histories/backup_codesのuser_idをUPDATE後、旧usersレコードを削除
  - コード値はログに一切出力しない（要配慮個人情報対応）
- `backup-code.controller.ts` 新規作成（L30-L57: POST /users/backup-code / POST /users/restore）
  - Cookie認証はCOOKIE_NAME確認で実装（UnauthorizedException）
- `users.module.ts` 変更（L4-L10: BackupCodeController / BackupCodeService / BackupCodeRepository を DI に追加）

### Phase 2: DB マイグレーション

- `prisma/schema.prisma` に `BackupCode` モデル追加（L117-L133）
  - `@unique` on `code`, `onDelete: Cascade` on `user` relation
  - インデックス: `backup_codes_code_idx` / `backup_codes_user_idx`
- `npx prisma generate` で Prisma Client を再生成済み

### Phase 3: フロントエンド — API クライアントと設定画面

- `frontend/src/lib/api/backup-code.ts` 新規作成（issueBackupCode / restoreFromCode）
  - 400時は `{ message: 'code_invalid' }` をthrow、他エラーはError throw
- `frontend/src/app/settings/page.tsx` にバックアップコードセクション（「バックアップコードを発行」ボタン）+ 発行済みコード表示モーダル + 再発行確認ダイアログを追加
- `settings.json` (ja/en) に `backup_code.*` キーを追加

### Phase 4: フロントエンド — 引き継ぎ画面

- `frontend/src/app/onboarding/restore/page.tsx` 新規作成
  - `formatBackupCode` 関数で自動大文字化・ハイフン自動挿入を実装（ALRG-XXXX-XXXX形式）
  - 引き継ぎ成功後: `localStorage.setItem(ONBOARDING_DONE_KEY, 'true')` → `/scan` へ遷移
  - エラー時はインライン表示（画面遷移なし）
- `onboarding.json` (ja/en) に `restore.*` キーを追加

### 手動テスト手順

1. 設定画面を開き「バックアップコードを発行」をタップ → `ALRG-XXXX-XXXX` 形式のモーダルが表示されること
2. 「新しいコードを発行」をタップ → 確認ダイアログが表示されること（即再発行しないこと）
3. 確認ダイアログで「再発行する」 → 新しいコードが発行されること
4. `/onboarding` の「引き継ぎコードをお持ちの方」リンクから `/onboarding/restore` へ遷移できること
5. コード入力フィールドで小文字入力 → 大文字に自動変換・ハイフン自動挿入されること
6. 無効なコードを入力して送信 → インラインエラーメッセージが表示されること（画面遷移なし）

## Plan deviation

- `restoreFromCode` の Service シグネチャから `req: Request` パラメータを削除（実装中にServiceでは不要と判断。ControllerでCookieのuser_id取得を完結させるため）
- タスク定義では「新デバイスの users レコードを削除し、旧 Cookie を発行し直す」方式を TBD としていたが、トランザクション内で `scan_histories` / `backup_codes` の `user_id` を旧IDに付け替えた後、新 `users` レコードを削除して旧 user_id の Cookie を発行し直す方式で実装した

## Review comments — ラウンド 2 再実装完了（2026-05-19）

### 修正内容

1. **[Security/Medium] POST /users/restore レートリミット追加**
   - `backend/src/shared/throttler.constants.ts` に `THROTTLE_RESTORE_TTL` / `THROTTLE_RESTORE_LIMIT`（60秒に5回）を追加
   - `backup-code.controller.ts` の `restore()` メソッドに `@Throttle({ default: { ttl: THROTTLE_RESTORE_TTL, limit: THROTTLE_RESTORE_LIMIT } })` を追加

2. **[Security/Medium] BACKUP_CODE_PATTERN を O/I 除外パターンに修正**
   - `backup-code.constants.ts`: `/^ALRG-[A-Z2-9]{4}-[A-Z2-9]{4}$/` → `/^ALRG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/`
   - `frontend/src/app/onboarding/restore/page.tsx` の `isValidCodeFormat` も同パターンに修正

3. **[Maintainability] テストファイルのマジックナンバー置換**
   - `backup-code.service.spec.ts` 冒頭に `const ONE_DAY_MS = 24 * 60 * 60 * 1000` を定義
   - L124, L144, L171, L211 の `86400000` を `ONE_DAY_MS` / `BACKUP_CODE_EXPIRES_DAYS * ONE_DAY_MS` に置換

4. **[Maintainability] markAsUsed デッドコード削除**
   - `backup-code.repository.ts` から `markAsUsed()` メソッドを削除
   - `backup-code.service.spec.ts` のモック定義からも `markAsUsed` を削除

## 自動評価（2026-05-19 17:00） - ラウンド 1

### 総合判定
**FAIL** （Critical: 0 / High: 0 / Medium: 2 / Low: 2）

### Threshold 達成状況
- 1. 動作性: ✅ （Completion criteria 全項目 unit test レベルで確認済み。typecheck 0件。unit tests: backend 81件/frontend 132件 全合格）
- 2. セキュリティ: ❌（Medium 2件 — レートリミット未設定 / パターン定義の不整合）
- 3. カバレッジ: ⚠️ 算出不能（settings/page.tsx バックアップコードセクションのコンポーネントテスト未作成）
- 4. 敵対的観点: ✅（IDOR なし。ブルートフォースは 40bit エントロピーで現実的脅威ではない）
- 5. 保守性: ❌（テストファイル内マジックナンバー 86400000 が4箇所 / `markAsUsed` が未使用デッドコード）

### 不合格理由

#### 【種別】Security — Medium: POST /users/restore に専用レートリミット未設定
**【再現手順】**
1. 前提: `POST /users/restore` はグローバルThrottler（60秒100回）のみ
2. 攻撃スクリプト: `for i in $(seq 1 100); do curl -s -X POST http://localhost:3001/users/restore -H 'Content-Type: application/json' -d '{"code":"ALRG-ABCD-EFGH"}'; done`
3. 60秒で100リクエストが通過する。コードの有効期限7日間で最大1,008,000リクエストが可能

**【期待される修正案】**
- `backend/src/shared/throttler.constants.ts` に以下を追加:
  ```typescript
  /** POST /users/restore: コードブルートフォース防止（60秒に5回） */
  export const THROTTLE_RESTORE_TTL = 60 * SEC_TO_MS;
  export const THROTTLE_RESTORE_LIMIT = 5;
  ```
- `backend/src/users/backup-code.controller.ts` の `restore` メソッドに `@Throttle` デコレーターを追加:
  ```typescript
  @Post('restore')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: THROTTLE_RESTORE_TTL, limit: THROTTLE_RESTORE_LIMIT } })
  async restore(...) { ... }
  ```
- 参照: `.claude/rules/implementation_rules.md` §バックエンド実装の制約

#### 【種別】Security — Medium: BACKUP_CODE_PATTERN が O/I を許容しており生成コードと不整合
**【再現手順】**
1. `BACKUP_CODE_PATTERN = /^ALRG-[A-Z2-9]{4}-[A-Z2-9]{4}$/` は `O`（オー）と `I`（アイ）を含むコードをバリデーション通過とする
2. `generateCode()` ではO/I を除外しているため、実際にO/Iを含むコードは生成されない
3. ユーザーが `ALRG-OABC-DEFG` を入力した場合、`RestoreDto` バリデーションを通過し `findByCode` に渡されて `code_invalid` となる（エラー自体は正しい）
4. ただしO/0・I/1 の視覚混同を防ぐ設計意図と矛盾しており、入力補助の一貫性が崩れる

**【期待される修正案】**
- `backend/src/users/backup-code.constants.ts` の `BACKUP_CODE_PATTERN` を文字セット定義と一致させる:
  ```typescript
  // ❌ 現状: O, I を許容
  export const BACKUP_CODE_PATTERN = /^ALRG-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
  
  // ✅ 修正案: O, I を除外（BACKUP_CODE_CHARSETと一致）
  export const BACKUP_CODE_PATTERN = /^ALRG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
  ```
- `frontend/src/app/onboarding/restore/page.tsx` の `isValidCodeFormat` も同じパターンに更新する
- 参照: タスク R2「O/0・I/1 は使用しない、大文字英数字のみ」

#### 【種別】Maintainability — テストファイル内マジックナンバー 86400000 が4箇所
**【再現手順】**
- `backend/src/users/__tests__/backup-code.service.spec.ts` L124, L144, L171, L211 に `86400000` が直書きされている

**【期待される修正案】**
- `backup-code.constants.ts` に定数を追加するか、テスト内ローカル定数として定義する:
  ```typescript
  const ONE_DAY_MS = 24 * 60 * 60 * 1000
  // 使用例
  expiresAt: new Date(Date.now() + ONE_DAY_MS),
  expiresAt: new Date(Date.now() - ONE_DAY_MS),
  const futureDate = new Date(Date.now() + BACKUP_CODE_EXPIRES_DAYS * ONE_DAY_MS)
  ```
- 参照: `.claude/rules/coding_rules.md` 「マジックナンバー直書き禁止」

#### 【種別】Maintainability — BackupCodeRepository.markAsUsed がデッドコード
**【再現手順】**
- `backup-code.repository.ts` に `markAsUsed(id: string)` が定義されているが呼び出し箇所が存在しない
- `restoreFromCode` ではトランザクション内の `tx.backupCode.update` を直接使用している（理由: Prisma トランザクション境界の維持）

**【期待される修正案】**
- `markAsUsed` を削除するか、トランザクション引数を受け取る `markAsUsedTx(tx, id)` に変更してService内から呼ぶ形に統一する:
  ```typescript
  // option A: 削除（トランザクション内直接 update を維持）
  // option B: Prismaトランザクションクライアントを引数に取る形に変更
  async markAsUsed(prismaOrTx: PrismaClient | Prisma.TransactionClient, id: string): Promise<void> {
    await prismaOrTx.backupCode.update({ where: { id }, data: { isUsed: true, usedAt: new Date() } })
  }
  ```
- 参照: `.claude/rules/dry_principles.md`

### 改善提案（PASS 時 / 次タスク繰越し可）
- [Security/Info] `POST /users/backup-code` への専用スロットリング追加（現状 60秒100回グローバル）も検討すること
- [Maintainability/Low] `settings/page.tsx` のバックアップコードセクション（モーダル表示・再発行確認ダイアログ）の React Testing Library テストを追加することを推奨（R11〜R13の動作保証）
- [Maintainability/Low] `restore/page.tsx` の `as RestoreFromCodeError` 型アサーションは型安全性的に許容範囲だが、`instanceof` チェックやtype guardの利用も検討

## 自動評価（2026-05-19 17:15） - ラウンド 2

### 総合判定
**PASS** （Critical: 0 / High: 0 / Medium: 0 / Low: 1）

### Threshold 達成状況
- 1. 動作性: ✅（typecheck 0件、backend 81件 全合格、frontend 132件 全合格）
- 2. セキュリティ: ✅（Medium 以上 0件 — レートリミット追加済み / BACKUP_CODE_PATTERN 修正済み）
- 3. カバレッジ: ⚠️ 算出不能（settings/page.tsx バックアップコードセクションのコンポーネントテスト未作成。自動 FAIL にはしない）
- 4. 敵対的観点: ✅（IDOR なし / `oldUserId === newUserId` 自己 restore 防止済み / randomBytes % 32 バイアスなし）
- 5. 保守性: ✅（`markAsUsed` 削除済み / マジックナンバー `86400000` → `ONE_DAY_MS` 置換済み / BACKUP_CODE_PATTERN と CHARSET 一致）

### 改善提案（次タスク繰越し可）
- [Maintainability/Low] `backup-code.service.spec.ts` L110 に `BACKUP_CODE_EXPIRES_DAYS * 24 * 60 * 60 * 1000` が残存（`ONE_DAY_MS` を使えば `BACKUP_CODE_EXPIRES_DAYS * ONE_DAY_MS` に統一できる）
- [Security/Info] 引き継ぎ後に旧デバイスが旧Cookie（旧user_id）のまま操作可能な問題（Tasks Risks欄のTBD）は未解決。`users.last_used_at` の監視またはセッション世代管理の追加を今後のタスクで検討すること
- [Maintainability/Low] `settings/page.tsx` バックアップコードセクション（モーダル・再発行確認ダイアログ）の React Testing Library テストを次スプリントで追加推奨

### 検査範囲外（人手レビュー推奨）
- E2E（Playwright MCP）: 開発サーバー未起動のため UI 操作シナリオは未実施。手動テスト手順（Implementation summary 参照）で確認すること
- DB マイグレーション実行確認: Prisma スキーマ変更は確認済みだが `prisma migrate deploy` の実行結果は環境依存のため人手確認推奨
