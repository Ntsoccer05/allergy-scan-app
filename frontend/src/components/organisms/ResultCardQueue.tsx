'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ScanJob } from '@/hooks/useScanQueue'
import { updateTodayScanItem } from '@/hooks/useScanQueue'
import { useScanApi } from '@/hooks/useScanApi'
import { ResultCard } from './ResultCard'
import type { PlaceCandidatesResponse } from '@/lib/api/places.api'

type PatchHistoryData = {
  product_name?: string | null
  store_name?: string | null
  memo?: string | null
  thumbnail_url?: string | null
}

type Props = {
  doneJobs: ScanJob[]
  allJobs: ScanJob[]
  onDismiss: (id: string) => void
  geolocation: { lat: number; lng: number } | null
  onFetchPlaceCandidates?: (query?: string) => Promise<PlaceCandidatesResponse | null>
  onRegisterLocation?: (storeName: string, placeId?: string, address?: string, storeLat?: number, storeLng?: number) => void
  onPatchHistory?: (data: PatchHistoryData) => void
}

export const ResultCardQueue = ({
  doneJobs,
  allJobs,
  onDismiss,
  geolocation,
  onFetchPlaceCandidates,
  onRegisterLocation,
  onPatchHistory,
}: Props) => {
  const t = useTranslations('scan')
  const { patchLocation, patchHistoryFields } = useScanApi()
  const [activeTabId, setActiveTabId] = useState<string | null>(
    doneJobs.length > 0 ? (doneJobs[doneJobs.length - 1]?.id ?? null) : null,
  )

  // 新しいジョブが完了するたびに最新の完了ジョブをアクティブタブにする
  useEffect(() => {
    const latest = doneJobs[doneJobs.length - 1]
    if (latest) setActiveTabId(latest.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneJobs.length])

  if (doneJobs.length === 0) return null

  const activeJob = doneJobs.find((j) => j.id === activeTabId) ?? doneJobs[0]
  const activeIndex = doneJobs.findIndex((j) => j.id === activeJob?.id)

  /** キューパスの場所登録: activeJob.result.history_id を使い直接 API 呼び出し + localStorage 更新 */
  const handleRegisterLocation = useCallback(
    (storeName: string, placeId?: string, address?: string, storeLat?: number, storeLng?: number): void => {
      if (!activeJob) return
      const historyId = activeJob.result?.history_id
      const lat = storeLat ?? geolocation?.lat
      const lng = storeLng ?? geolocation?.lng
      if (historyId && lat !== undefined && lng !== undefined) {
        void patchLocation(historyId, {
          store_name: storeName,
          lat,
          lng,
          ...(address !== undefined ? { address } : {}),
          ...(placeId !== undefined ? { place_id: placeId } : {}),
        })
      } else {
        onRegisterLocation?.(storeName, placeId, address, storeLat, storeLng)
      }
      updateTodayScanItem(activeJob.id, {
        storeName: storeName || null,
        address: address ?? null,
      })
    },
    [activeJob, geolocation, patchLocation, onRegisterLocation],
  )

  /** キューパスの履歴パッチ: history_id を直接使って API を呼び + localStorage も更新 */
  const handlePatchHistory = useCallback(
    (data: PatchHistoryData): void => {
      if (!activeJob) return
      const historyId = activeJob.result?.history_id
      if (historyId) {
        void patchHistoryFields(historyId, data)
      } else {
        // history_id がない場合は親の onPatchHistory にフォールバック
        onPatchHistory?.(data)
      }
      const updates: Parameters<typeof updateTodayScanItem>[1] = {}
      if (data.store_name !== undefined) updates.storeName = data.store_name
      if (data.thumbnail_url !== undefined) updates.thumbnailUrl = data.thumbnail_url
      if (data.product_name !== undefined) updates.productName = data.product_name
      if (Object.keys(updates).length > 0) {
        updateTodayScanItem(activeJob.id, updates)
      }
    },
    [activeJob, onPatchHistory, patchHistoryFields],
  )

  // タブバー: 複数ジョブがあるときのみ ResultCard 内に注入する
  const tabBarNode = allJobs.length > 1 ? (
    <div className="shrink-0 border-b border-gray-100">
      {/* サムネイルタブ一覧 */}
      <div className="flex gap-2 overflow-x-auto px-3 pt-2 pb-2">
        {allJobs.map((job, index) => {
          const isDone = job.state === 'done' || job.state === 'error'
          const isActive = job.id === activeTabId

          return (
            <button
              key={job.id}
              type="button"
              disabled={!isDone}
              onClick={() => setActiveTabId(job.id)}
              className={`relative flex-shrink-0 rounded-xl overflow-hidden transition-all
                ${isActive ? 'ring-2 ring-blue-500' : 'ring-1 ring-gray-200'}
                ${!isDone ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              aria-label={t('queue.tabLabel', { n: index + 1 })}
            >
              {isDone && job.capturedImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={job.capturedImageUrl}
                  alt=""
                  className="h-10 w-10 object-cover"
                />
              ) : (
                <div className="h-10 w-10 bg-gray-200 flex items-center justify-center">
                  <span className="text-base">🔄</span>
                </div>
              )}
              {/* 番号バッジ */}
              <div className="absolute top-0 right-0 bg-black/60 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-bl-md leading-none">
                {index + 1}
              </div>
              {isActive && (
                <div className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-500" />
              )}
            </button>
          )
        })}
      </div>

      {/* ◀ N/M ▶ ナビゲーション */}
      {doneJobs.length > 1 && (
        <div className="flex items-center justify-between px-6 py-1.5 border-t border-gray-50">
          <button
            type="button"
            onClick={() => activeIndex > 0 && setActiveTabId(doneJobs[activeIndex - 1].id)}
            disabled={activeIndex <= 0}
            className="text-gray-500 text-base px-2 py-0.5 disabled:opacity-30"
            aria-label={t('queue.prevResult')}
          >
            ◀
          </button>
          <span className="text-gray-500 text-xs font-medium">
            {t('queue.resultCount', { current: activeIndex + 1, total: doneJobs.length })}
          </span>
          <button
            type="button"
            onClick={() => activeIndex < doneJobs.length - 1 && setActiveTabId(doneJobs[activeIndex + 1].id)}
            disabled={activeIndex >= doneJobs.length - 1}
            className="text-gray-500 text-base px-2 py-0.5 disabled:opacity-30"
            aria-label={t('queue.nextResult')}
          >
            ▶
          </button>
        </div>
      )}
    </div>
  ) : null

  return (
    <div className="absolute inset-x-0 bottom-0 z-20">
      {/* アクティブな結果カード（タブバーは ResultCard 内に注入） */}
      {activeJob?.result && (
        <ResultCard
          key={activeJob.id}
          result={{ type: 'ocr', data: activeJob.result }}
          onReset={() => onDismiss(activeJob.id)}
          onDiscard={() => onDismiss(activeJob.id)}
          geolocation={geolocation}
          onFetchPlaceCandidates={onFetchPlaceCandidates}
          onRegisterLocation={handleRegisterLocation}
          onPatchHistory={handlePatchHistory}
          onRetakeThumbnail={() => {}}
          thumbnailUrl={activeJob.capturedImageUrl ?? null}
          tabBar={tabBarNode}
        />
      )}
      {activeJob?.state === 'error' && (
        <div className="bg-white rounded-t-2xl px-6 py-8 text-center">
          <p className="text-red-600 text-sm mb-4">{activeJob.error}</p>
          <button
            type="button"
            onClick={() => onDismiss(activeJob.id)}
            className="text-sm text-gray-500 underline"
          >
            {t('queue.dismiss')}
          </button>
        </div>
      )}
    </div>
  )
}
