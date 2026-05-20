/** カメラズームの設定 */
export const ZOOM_MIN = 1.0
export const ZOOM_MAX = 5.0
export const ZOOM_STEP = 0.1
export const ZOOM_DEFAULT = 1.0

/** フレーム品質チェックの閾値 */
export const THRESHOLDS = {
  brightness: 80,
  blur: 100,
  motion: 10,
  stable: 3,
} as const

/** 連続 OK フレーム数（stable 遷移に必要） */
export const CONSECUTIVE_FRAMES_REQUIRED = 3

/** フレームサンプリング間隔 (ms) — 5fps */
export const FRAME_CHECK_INTERVAL_MS = 200

/** Geolocation API のタイムアウト (ms) */
export const GEO_TIMEOUT_MS = 5000

/** 共有ボタンタップ時の Android バイブレーション時間 (ms) */
export const VIBRATE_SHARE_MS = 50

/**
 * スキャン状態・エラー種別に対応するガイドメッセージ。
 * ScanGuide コンポーネントはここから取得する（コンポーネント内ハードコード禁止）。
 */
export const GUIDE_MESSAGES = {
  idle: 'バーコードまたは原材料欄にかざしてください',
  detecting: '読み取り中...',
  stable: '読み取り中...',
  processing: '確認中...',
  result: '',
  error: {
    dark: '明るい場所に移動してください',
    blur: 'もう少し近づけて再スキャンしてください',
    motion: 'カメラを安定させてください',
    incomplete: 'ラベル全体が映るように離してください',
    confidence_low: 'もう少し近づけて再スキャンしてください',
    api_error: '通信エラーが発生しました。再度お試しください',
  },
} as const
