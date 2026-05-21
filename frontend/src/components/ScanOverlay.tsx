'use client'

import { useTranslations } from 'next-intl'
import type { ScanState } from '@/app/scan/scan.types'

type ScanOverlayProps = {
  state: ScanState
  partialRawText?: string | null
}

export const ScanOverlay = ({ state, partialRawText }: ScanOverlayProps) => {
  const t = useTranslations('camera')

  if (state === 'idle' || state === 'result') return null

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* 検出中・安定中: スキャン枠と走査線アニメーション */}
      {(state === 'detecting' || state === 'stable') && (
        <div className="absolute inset-8 border-2 border-white/70 rounded-lg">
          <div className="absolute left-0 right-0 h-0.5 bg-white/80 animate-bounce top-1/2" />
        </div>
      )}

      {/* 処理中: 撮影完了メッセージ + スピナー */}
      {state === 'processing' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/75">
          {/* 撮影完了チェックマーク */}
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-white/15 border-2 border-white/50">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-8 h-8"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="flex flex-col items-center gap-1 text-center px-6">
            <p className="text-white text-lg font-bold">{t('processingTitle')}</p>
            {partialRawText ? (
            <div className="max-h-20 overflow-y-auto w-full">
              <p className="text-white/70 text-[11px] leading-relaxed text-center break-all whitespace-pre-wrap">
                {partialRawText}
              </p>
            </div>
          ) : (
            <p className="text-white/80 text-sm">{t('processingSubtitle')}</p>
          )}
          </div>
          {/* スピナー */}
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* エラー状態: 枠を赤に */}
      {state === 'error' && (
        <div className="absolute inset-8 border-2 border-red-400/70 rounded-lg" />
      )}
    </div>
  )
}
