'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { JudgmentBadge } from '@/components/molecules/JudgmentBadge'
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner'
import { usePublicHistory, usePublicHistoryDigest } from '@/hooks/usePublicHistory'
import { useQueryClient } from '@tanstack/react-query'
import type { JudgmentShort } from '@/app/scan/scan.types'

export default function PublicHistoryPage() {
  const t = useTranslations('history')
  const queryClient = useQueryClient()
  const [showUpdateBanner, setShowUpdateBanner] = useState(false)

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = usePublicHistory()

  const { data: digest } = usePublicHistoryDigest()

  const initialDigestRef = useRef<{ count: number; last_updated_at: string | null } | null>(null)
  useEffect(() => {
    if (!digest) return
    if (!initialDigestRef.current) {
      initialDigestRef.current = digest
      return
    }
    const hasChange =
      digest.count !== initialDigestRef.current.count ||
      digest.last_updated_at !== initialDigestRef.current.last_updated_at
    if (hasChange) setShowUpdateBanner(true)
  }, [digest])

  const handleRefresh = () => {
    initialDigestRef.current = digest ?? null
    setShowUpdateBanner(false)
    void queryClient.invalidateQueries({ queryKey: ['public-history'] })
  }

  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
    })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const items = data?.pages.flatMap(page => page.items) ?? []

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-bold">{t('public.title')}</h1>

      {showUpdateBanner && (
        <button
          onClick={handleRefresh}
          className="mb-4 w-full rounded-lg bg-primary/10 px-4 py-3 text-sm font-medium text-primary"
        >
          {t('public.newItems')} — {t('public.refresh')}
        </button>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(item => (
            <div key={item.id} className="rounded-lg border bg-card p-4 shadow-sm">
              {item.thumbnail_url && (
                <img src={item.thumbnail_url} alt="" className="mb-3 h-40 w-full rounded object-cover" />
              )}
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium line-clamp-2">{item.product_name ?? t('unnamed')}</p>
                <JudgmentBadge judgment={item.judgment as JudgmentShort} />
              </div>
              {item.store_name && (
                <p className="mt-1 text-xs text-muted-foreground">📍 {item.store_name}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(item.scanned_at).toLocaleDateString('ja-JP')}
              </p>
            </div>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="py-4 flex justify-center">
        {isFetchingNextPage && <LoadingSpinner size="sm" />}
      </div>
    </div>
  )
}
