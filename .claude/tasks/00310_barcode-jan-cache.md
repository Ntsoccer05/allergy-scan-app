---
id: "00310"
title: バーコード判定の実効化（自前 JAN キャッシュ + 検出経路の拡充）
status: pending
created: "2026-06-10"
---

## 背景・課題（2026-06-10 実測）

- products テーブルの実績は全件 `hash` 型で、**バーコード経由の商品判定は0件**。Gemini コスト削減効果が出ていない
- 原因1: バーコード検出（ZXing）はカメラかざし中の tick（200ms間隔）でのみ動作し、
  タップ撮影（handleCapture）と画像アップロード（uploadAndScanImage）は OCR 直行
- 原因2: Open Food Facts は日本商品のアレルゲン欄未入力が多く、ヒットしても判定に使えない
  （例: JAN 4901351025420 は OFF に存在するが allergens_tags が空。
  この場合は安全ガードにより found:false → OCR フォールバック済み）

## Requirements

1. **自前 JAN キャッシュ（本命・Gemini コスト削減）**
   - OCR フロー中にバーコード（JAN）も検出できた場合、OCR 結果の allergens / raw_text を
     `jan` キーでも products に UPSERT する（既存の hash UPSERT と併用 or jan を優先）
   - 以降は同じ商品を誰がスキャンしても `POST /scan/barcode` の DB ヒットで判定でき、Gemini 呼び出し不要
   - UPSERT は `ON CONFLICT (id_type, id_value)`（patterns.md パターン3）・scan_count / expires_at 連動
2. **検出経路の拡充**
   - タップ撮影（handleCapture）: キャプチャフレームに対して detectFromImageData を1回実行し、
     JAN が取れたら barcode フロー → found:false なら OCR へ（既存の tick と同じフォールバック）
   - 画像アップロード（uploadAndScanImage）: 同様にバーコード検出を先行させる
3. **計測**
   - barcode ヒット率（DB/OFF/ミス別）をログで集計できるようにする（コスト削減効果の可視化）

## 注意点（安全設計）

- jan キャッシュへの保存は OCR 判定（confidence: high/medium・incomplete: false）の結果のみ
- アレルゲン情報が空の jan 商品はヒット扱いにしない（実装済みの hasNoAllergenInfo ガードを維持）
- 同一 JAN で原材料が変わるリスクは expires_at（scan_count 連動）で既存設計どおり緩和

## 期待効果

- 人気商品ほど2回目以降の Gemini 呼び出しが消える（応答 2.8s → DB ヒットで数百 ms）
- Gemini API 費・日次クォータの消費削減
