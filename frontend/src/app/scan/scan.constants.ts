/** 1日あたりのデフォルトスキャン上限（サブスクリプション情報が取得できない場合に使用） */
export const DEFAULT_DAILY_SCAN_LIMIT = 20

/** カメラズームの設定 */
export const ZOOM_MIN = 1.0
export const ZOOM_MAX = 5.0
export const ZOOM_STEP = 0.1
export const ZOOM_DEFAULT = 1.0

/** デバイス種別。タッチ有無とビューポート幅で判定する。 */
export type DeviceType = 'pc' | 'tablet' | 'sp'

export const getDeviceType = (): DeviceType => {
  if (typeof window === 'undefined') return 'sp'
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  if (!hasTouch) return 'pc'               // タッチなし → PC
  if (window.innerWidth >= 1024) return 'pc'   // Tailwind lg ブレークポイント
  if (window.innerWidth >= 768) return 'tablet' // Tailwind md ブレークポイント
  return 'sp'
}

/** フレーム品質チェックの閾値（デバイス別）
 * PC webcam は解像度・フォーカス精度が低いため blur/brightness を大きく緩和
 * SP カメラは高品質なため標準的な閾値
 */
export const THRESHOLDS_BY_DEVICE: Record<
  DeviceType,
  { brightness: number; blur: number; motion: number; stable: number }
> = {
  pc:     { brightness: 50, blur: 15, motion: 45, stable: 3 },
  tablet: { brightness: 60, blur: 35, motion: 25, stable: 3 },
  sp:     { brightness: 70, blur: 60, motion: 22, stable: 3 },
} as const

/** 後方互換用。デバイス判定前のデフォルト（SP 相当）。 */
export const THRESHOLDS = THRESHOLDS_BY_DEVICE.sp

/** 連続 OK フレーム数（stable 遷移に必要） */
export const CONSECUTIVE_FRAMES_REQUIRED = 3

/** フレームサンプリング間隔 (ms) — 5fps */
export const FRAME_CHECK_INTERVAL_MS = 200

/** Geolocation API のタイムアウト (ms) */
export const GEO_TIMEOUT_MS = 5000

/** 共有ボタンタップ時の Android バイブレーション時間 (ms) */
export const VIBRATE_SHARE_MS = 50

/**
 * OCR 送信前リサイズの長辺上限 (px)。
 * ⚠️ 安全設計: 2026-06 の実測検証（7枚×5回×4サイズ vs 原寸）で、1024〜2048px では
 * パッケージ全体を遠目に写した画像の極小文字（製造ライン注意書き「乳成分を使用した設備〜」等）を
 * confidence: high のまま見逃すことが判明。3072px で原寸とほぼ同等（7枚中5枚一致）になるため
 * 5MB 上限（MAX_UPLOAD_SIZE_BYTES）内に収まる最大値として 3072 を採用する。
 * 検証手順: backend/scripts/prompt-consistency-test.ts（IMAGES_DIR で縮小版を指定）
 */
export const OCR_MAX_DIMENSION = 3072

/** OCR 送信用 JPEG 品質 (0〜1)。日本語細字のエッジ保護のため 0.92 に引き上げ。 */
export const OCR_JPEG_QUALITY = 0.92

/** S3 アップロード前に確認するファイルサイズ上限（5MB）。バックエンドの MAX_IMAGE_SIZE_BYTES と同値。 */
export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024

/**
 * OCR 用にアップロードした画像（最大 OCR_MAX_DIMENSION px）を thumbnail_url としても共用するか。
 * true: サムネイル専用の S3 アップロードをスキップ（S3 PUT 1回に削減）。
 * false: 従来の2アップロード方式（サムネイル 300px + OCR 画像 3072px）に戻す。
 */
export const USE_OCR_AS_THUMBNAIL = true

/**
 * スキャン状態・エラー種別に対応するガイドメッセージ。
 * ScanGuide コンポーネントはここから取得する（コンポーネント内ハードコード禁止）。
 */
export const GUIDE_MESSAGES = {
  idle: 'バーコードまたは原材料欄にかざしてください',
  preview: '撮影しました。確定またはやり直しを選んでください',
  processing: '確認中...',
  result: '',
  manual: 'タップして読み取る',
  error: {
    quality_check_failed: '⚠️ 画質を確認してください',
    incomplete: '⚠️ 原材料またはバーコード全体が映るように撮影してください。',
    confidence_low: '⚠️ もう少し近づけて再スキャンしてください',
    api_error: '通信エラーが発生しました。再度お試しください',
    daily_limit_exceeded: '本日の利用上限に達しました。明日またお試しください',
    cooldown: 'しばらく待ってから再度お試しください',
  },
} as const
