'use client'

import { useTranslations } from 'next-intl'
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner'
import { useAdminStats } from '@/hooks/useAdminStats'

export default function AdminStatsPage() {
  const t = useTranslations('admin')
  const { data, isLoading } = useAdminStats()

  if (isLoading) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>
  }

  const cards = [
    { label: t('stats.cards.totalUsers'), value: data?.total_users },
    { label: t('stats.cards.totalScans'), value: data?.total_scans },
    { label: t('stats.cards.todayScans'), value: data?.scans_today },
    { label: t('stats.cards.premiumUsers'), value: data?.active_premium },
  ]

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold">{t('stats.pageTitle')}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(card => (
          <div key={card.label} className="rounded-lg border bg-card p-4 text-center shadow-sm">
            <p className="text-3xl font-bold">{card.value ?? '—'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{card.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
