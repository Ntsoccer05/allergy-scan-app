'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { HistoryCard } from '@/components/HistoryCard'
import { useHistory } from '@/hooks/useHistory'
import { useOthersScanned } from '@/hooks/useOthersScanned'
import { useOnboardingGuard } from '@/hooks/useOnboardingGuard'
import type { HistoryFilter } from './history.types'

/** 履歴ページのタブ識別子。 */
type HistoryTab = 'mine' | 'others'

const FILTER_TAB_VALUES: HistoryFilter[] = ['all', 'ng', 'partial', 'ok']

export default function HistoryPage() {
  useOnboardingGuard()
  const t = useTranslations('history')

  const [activeTab, setActiveTab] = useState<HistoryTab>('mine')

  const {
    items: myItems,
    isLoading: myIsLoading,
    isFetchingNextPage: myIsFetchingNextPage,
    hasNextPage: myHasNextPage,
    fetchNextPage: myFetchNextPage,
    filter,
    setFilter,
  } = useHistory()

  const {
    items: othersItems,
    isLoading: othersIsLoading,
    isFetchingNextPage: othersIsFetchingNextPage,
    hasNextPage: othersHasNextPage,
    fetchNextPage: othersFetchNextPage,
  } = useOthersScanned()

  return (
    <main className="flex flex-col min-h-screen max-w-120 lg:max-w-3xl mx-auto px-4 pb-20 lg:pb-8 pt-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">{t('title')}</h1>

      {/* みんな/自分 タブ（R1・R10） */}
      <div className="flex gap-2 mb-4 border-b border-gray-200">
        {(['mine', 'others'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500'
            }`}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>

      {/* 自分のスキャンタブ */}
      {activeTab === 'mine' && (
        <>
          {/* フィルタタブ */}
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {FILTER_TAB_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  filter === value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {t(`filter.${value}`)}
              </button>
            ))}
          </div>

          {myIsLoading && (
            <div className="flex justify-center items-center py-12">
              <div
                className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"
                role="status"
                aria-label={t('loading')}
              />
            </div>
          )}

          {!myIsLoading && (
            <>
              {myItems.length === 0 ? (
                <p className="text-center text-gray-400 py-12 text-sm">
                  {t('empty')}
                </p>
              ) : (
                <ul className="space-y-3">
                  {myItems.map((item) => (
                    <li key={item.id}>
                      <HistoryCard item={item} />
                    </li>
                  ))}
                </ul>
              )}

              {myHasNextPage && (
                <button
                  type="button"
                  onClick={() => myFetchNextPage()}
                  disabled={myIsFetchingNextPage}
                  className="mt-6 w-full py-3 rounded-xl border border-gray-300 text-sm text-gray-600
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {myIsFetchingNextPage ? t('loading') : t('loadMore')}
                </button>
              )}
            </>
          )}
        </>
      )}

      {/* みんなのスキャンタブ（R7・R8） */}
      {activeTab === 'others' && (
        <>
          {othersIsLoading && (
            <div className="flex justify-center items-center py-12">
              <div
                className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"
                role="status"
                aria-label={t('loading')}
              />
            </div>
          )}

          {!othersIsLoading && (
            <>
              {othersItems.length === 0 ? (
                <p className="text-center text-gray-400 py-12 text-sm">
                  {t('othersEmpty')}
                </p>
              ) : (
                <ul className="space-y-3">
                  {othersItems.map((item) => (
                    <li key={item.id}>
                      {/* 期限切れタグ（R6・R8） */}
                      {item.is_expired && (
                        <p className="text-xs text-amber-600 mb-1">
                          {t('expiredTag')}
                        </p>
                      )}
                      <HistoryCard
                        item={{
                          id: item.id,
                          userId: '',
                          productId: item.id,
                          productName: item.product_name,
                          judgment: item.judgment,
                          detected: item.detected,
                          thumbnailUrl: null,
                          scannedAt: item.updated_at,
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {othersHasNextPage && (
                <button
                  type="button"
                  onClick={() => othersFetchNextPage()}
                  disabled={othersIsFetchingNextPage}
                  className="mt-6 w-full py-3 rounded-xl border border-gray-300 text-sm text-gray-600
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {othersIsFetchingNextPage ? t('loading') : t('loadMore')}
                </button>
              )}
            </>
          )}
        </>
      )}
    </main>
  )
}
