'use client'

import { LoadingSpinner } from './LoadingSpinner'

type Props = {
  isOpen: boolean
  message?: string
}

export const LoadingOverlay = ({ isOpen, message }: Props) => {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
      <LoadingSpinner size="lg" />
      {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}
