'use client'

import { JudgmentShort } from '@/app/scan/scan.types'

type Props = {
  judgment: JudgmentShort
  className?: string
}

const JUDGMENT_CONFIG: Record<JudgmentShort, { label: string; className: string }> = {
  ng: {
    label: '🔴 NG',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  partial: {
    label: '🟡 注意',
    className: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  },
  ok: {
    label: '✅ なし',
    className: 'bg-green-50 text-green-800 border-green-200',
  },
}

export const JudgmentBadge = ({ judgment, className = '' }: Props) => {
  const config = JUDGMENT_CONFIG[judgment]
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config.className} ${className}`}
    >
      {config.label}
    </span>
  )
}
