'use client'

import type { ScanError, ScanState } from '@/app/scan/scan.types'
import { GUIDE_MESSAGES } from '@/app/scan/scan.constants'

type ScanGuideProps = {
  state: ScanState
  error?: ScanError
}

const guideMessage = (state: ScanState, error?: ScanError): string => {
  if (state === 'error') {
    if (error !== undefined) {
      return GUIDE_MESSAGES.error[error]
    }
    return ''
  }
  if (state === 'idle') return GUIDE_MESSAGES.idle
  if (state === 'detecting') return GUIDE_MESSAGES.detecting
  if (state === 'stable') return GUIDE_MESSAGES.stable
  if (state === 'processing') return GUIDE_MESSAGES.processing
  // state === 'result': 結果表示中はガイドメッセージ不要
  return GUIDE_MESSAGES.result
}

export const ScanGuide = ({ state, error }: ScanGuideProps) => {
  const message = guideMessage(state, error)

  if (!message) return null

  return (
    <div className="bg-black/60 rounded-lg px-4 py-2 text-center">
      <p className="text-white text-sm font-medium">{message}</p>
    </div>
  )
}
