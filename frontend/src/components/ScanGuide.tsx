'use client'

import type { ScanError, ScanState } from '@/app/scan/scan.types'
import { GUIDE_MESSAGES } from '@/app/scan/scan.constants'

type ScanGuideProps = {
  state: ScanState
  error?: ScanError
}

const guideMessage = (state: ScanState, error?: ScanError): string => {
  if (state === 'error' && error !== undefined) {
    return GUIDE_MESSAGES.error[error]
  }
  if (state === 'idle') return GUIDE_MESSAGES.idle
  if (state === 'preview') return GUIDE_MESSAGES.preview
  if (state === 'processing') return GUIDE_MESSAGES.processing
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
