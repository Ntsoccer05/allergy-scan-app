---
id: "00330"
title: デプロイ前チェックリスト: DDoS・課金攻撃（Denial of Wallet）対策
status: pending
created: "2026-06-10"
---

## 位置づけ

**本番デプロイの前提条件チェックリスト。** 2026-06-10 時点の判断で「デプロイ時期ではないため
IaC 作成は時期尚早」とした。インフラ構築を始めるタイミングでこのタスクを着手すること。

## 背景（2026-06-10 のレビュー結果）

- アプリ層の対策は実装済み: ThrottlerGuard（OCR 5回/分・barcode 30回/分・全体 100回/分）、
  SCAN_COOLDOWN_MS（3秒）、DailyScanLimitGuard（プラン別 日次上限）
- ただし ThrottlerGuard は**インプロセスメモリのため Lambda インスタンス単位**でしか効かない
  （`throttler.constants.ts` 冒頭コメント参照）。DDoS 対策は API Gateway より手前が本体
- この構成の主リスクは「ダウン」より **Denial of Wallet（Lambda/Gemini/S3 の課金攻撃）**

## チェックリスト（優先順）

- [ ] **API Gateway ステージスロットリング**（rate/burst）を設定し IaC に含める — 全体の天井
- [ ] **AWS WAF rate-based rule**（IP 単位・5分間 N 回）を API GW or CloudFront に装着
      — インスタンス横断の per-IP 制限の本命。マネージドルール（IP reputation 等）も検討
- [ ] **AWS Budgets アラート** + **Gemini API の日次クォータ上限**設定 — 課金攻撃の早期検知と自動ブレーキ
- [ ] 認証不要エンドポイント（`GET /public/history`・`/public/history/digest`）に
      **CloudFront / API GW キャッシュ**（数十秒で十分。digest はポーリング用途）
- [ ] **Lambda reserved concurrency** で同時実行数上限 — コスト上限を物理的に切る最終ライン
- [ ] `GET /scan/presigned-url` への per-user 制限追加 + **S3 ライフサイクル**（孤児オブジェクト削除）
- [ ] **Express `trust proxy` 設定の確認** — API GW 経由では X-Forwarded-For を解釈しないと
      全リクエストが同一 IP に見え、ThrottlerGuard が正規ユーザー間で制限を食い合う
- [ ] RDS 暗号化（`storage_encrypted = true`）— implementation_rules.md の要配慮個人情報要件（再掲）

## 参考

- 設計上の多層防御: `docs/specs/2026-06-05-architecture-redesign.md`（Layer 1 = API Gateway）
- アプリ層レート制限: `backend/src/shared/throttler.constants.ts`
