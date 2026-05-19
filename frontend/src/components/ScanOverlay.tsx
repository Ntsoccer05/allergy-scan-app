'use client'

import type { ScanState } from '@/app/scan/scan.types'

type ScanOverlayProps = {
  state: ScanState
}

export const ScanOverlay = ({ state }: ScanOverlayProps) => {
  if (state === 'idle' || state === 'result') return null

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* 検出中・安定中: スキャン枠と走査線アニメーション */}
      {(state === 'detecting' || state === 'stable') && (
        <div className="absolute inset-8 border-2 border-white/70 rounded-lg">
          {/* 走査線 */}
          <div className="absolute left-0 right-0 h-0.5 bg-white/80 animate-bounce top-1/2" />
        </div>
      )}

      {/* 処理中: スピナー */}
      {state === 'processing' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="sr-only">処理中</span>
        </div>
      )}

      {/* エラー状態: 枠を赤に */}
      {state === 'error' && (
        <div className="absolute inset-8 border-2 border-red-400/70 rounded-lg" />
      )}
    </div>
  )
}
