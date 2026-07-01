'use client'

import { useTranslations } from 'next-intl'
import type { ScanJob } from '@/hooks/useScanQueue'

type Props = {
  job: ScanJob
  isActive: boolean
  onClick: () => void
}

export const ScanJobChip = ({ job, isActive, onClick }: Props) => {
  const t = useTranslations('scan')
  const stateLabel =
    job.state === 'uploading' ? t('queue.uploading') :
    job.state === 'analyzing' ? t('queue.analyzing') :
    job.state === 'done' ? t('queue.done') :
    t('queue.error')

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-shrink-0 rounded-xl px-3 py-2 text-xs font-medium text-white backdrop-blur-sm transition-all
        ${isActive ? 'bg-white/30 ring-2 ring-white' : 'bg-black/40'}
        ${job.state === 'error' ? 'bg-red-500/70' : ''}`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span>{stateLabel}</span>
      </div>
      {/* 進捗バー */}
      {(job.state === 'uploading' || job.state === 'analyzing') && (
        <div className="h-1 w-20 rounded-full bg-white/30 overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-300"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      )}
      {(job.state === 'uploading' || job.state === 'analyzing') && (
        <div className="text-white/80 mt-0.5">{job.progress}%</div>
      )}
    </button>
  )
}
