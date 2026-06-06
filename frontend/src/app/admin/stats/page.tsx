'use client'

import { useQuery } from '@tanstack/react-query'
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner'
import { getAdminStats } from '@/lib/api/admin.api'

const STATS_REFETCH_INTERVAL_MS = 60_000

export default function AdminStatsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: getAdminStats,
    refetchInterval: STATS_REFETCH_INTERVAL_MS,
  })

  if (isLoading) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>
  }

  const cards = [
    { label: '総ユーザー数', value: data?.total_users },
    { label: '総スキャン数', value: data?.total_scans },
    { label: '本日のスキャン', value: data?.scans_today },
    { label: 'プレミアム会員', value: data?.active_premium },
  ]

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold">統計情報</h1>
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
