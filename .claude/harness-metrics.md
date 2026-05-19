# Harness Metrics

## 2026-05-15 tasks/00010_prisma-db-setup.md
- 要求: Week1 バーティカルスライス「バーコードスキャン」DB基盤
- planner ラウンド: 1
- generator ラウンド: 1
- evaluator 結果: PASS (R1)
- Threshold 違反: 動作性 0 / セキュリティ 0 / カバレッジ 0 / 敵対的 0 / 保守性 0
- 人手介入箇所: ゲート1 / ゲート3

## 2026-05-15 tasks/00020_barcode-scan-backend.md
- 要求: Week1 バーティカルスライス「バーコードスキャン」POST /scan/barcode
- planner ラウンド: 1
- generator ラウンド: 1
- evaluator 結果: PASS (R1)
- Threshold 違反: 動作性 0 / セキュリティ 0 / カバレッジ 0 / 敵対的 0 / 保守性 0
- 人手介入箇所: ゲート3
- 繰越し改善: is_high_risk判定精緻化(Low) / throttler未実装(Info)

## 2026-05-15 tasks/00030_ocr-backend.md
- 要求: Week1 バーティカルスライス「OCRスキャン」GET /scan/presigned-url + POST /scan/ocr
- planner ラウンド: 1
- generator ラウンド: 2 (FAIL→再実装)
- evaluator 結果: PASS (R2)
- Threshold 違反: 動作性 0 / セキュリティ 0 / カバレッジ 0 / 敵対的 0 / 保守性 0
- 人手介入箇所: ゲート3
- 繰越し改善: ScanService→PrismaService直注入(UsersRepository欠如・層違反Medium) / フロント incomplete:true未処理(Medium)

## 2026-05-15 tasks/00040_scan-frontend-hooks.md
- 要求: Week1 バーティカルスライス「スキャンフロントエンドHook層」useCamera/useBarcode/useFrameCheck/useScanApi/useScan
- planner ラウンド: 1
- generator ラウンド: 1
- evaluator 結果: PASS (R1)
- Threshold 違反: 動作性 0 / セキュリティ 0 / カバレッジ 0 / 敵対的 0 / 保守性 0
- 人手介入箇所: ゲート3

## 2026-05-15 tasks/00050_scan-frontend-ui.md
- 要求: Week1 バーティカルスライス「スキャンフロントエンドUI」CameraView/ScanGuide/ScanOverlay/ResultCard/BottomNav/ScanPage
- planner ラウンド: 1
- generator ラウンド: 1
- evaluator 結果: PASS (R1)
- Threshold 違反: 動作性 0 / セキュリティ 0 / カバレッジ 0 / 敵対的 0 / 保守性 0
- 人手介入箇所: ゲート3
- 繰越し改善: useScan incomplete:trueフィールド未チェック(Medium) / confidence:low状態のGUIDE_MESSAGES欠如(Medium)
