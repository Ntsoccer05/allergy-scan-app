'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { HistoryCard } from '@/components/organisms/HistoryCard'
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner'
import { useHistory } from '@/hooks/useHistory'
import { useOthersScanned } from '@/hooks/useOthersScanned'
import { useAuthContext } from '@/providers/AuthProvider'
import type { HistoryFilter, HistoryItem } from './history.types'

/** 履歴ページのタブ識別子。 */
type HistoryTab = 'mine' | 'others'

const FILTER_TAB_VALUES: HistoryFilter[] = ['all', 'ng', 'partial', 'ok']

/** 編集モーダルのフォームデータ型。 */
type EditFormData = {
  product_name: string
  store_name: string
  memo: string
  is_public: boolean
}

export default function HistoryPage() {
  const t = useTranslations('history')
  const { user } = useAuthContext()
  const userId = user?.id ?? null

  const [activeTab, setActiveTab] = useState<HistoryTab>('mine')
  const [editingItem, setEditingItem] = useState<HistoryItem | null>(null)
  const [editForm, setEditForm] = useState<EditFormData>({
    product_name: '',
    store_name: '',
    memo: '',
    is_public: false,
  })

  const {
    items: myItems,
    isLoading: myIsLoading,
    isFetchingNextPage: myIsFetchingNextPage,
    hasNextPage: myHasNextPage,
    fetchNextPage: myFetchNextPage,
    filter,
    setFilter,
    updateHistoryMutation,
    deleteHistoryMutation,
  } = useHistory()

  const {
    items: othersItems,
    isLoading: othersIsLoading,
    isFetchingNextPage: othersIsFetchingNextPage,
    hasNextPage: othersHasNextPage,
    fetchNextPage: othersFetchNextPage,
  } = useOthersScanned()

  const handleEditOpen = (item: HistoryItem) => {
    setEditingItem(item)
    setEditForm({
      product_name: item.productName ?? '',
      store_name: item.location?.store_name ?? '',
      memo: item.memo ?? '',
      is_public: item.is_public,
    })
  }

  const handleEditClose = () => {
    setEditingItem(null)
    setEditForm({ product_name: '', store_name: '', memo: '', is_public: false })
  }

  const handleEditSave = () => {
    if (!editingItem) return
    updateHistoryMutation.mutate(
      {
        id: editingItem.id,
        product_name: editForm.product_name || null,
        store_name: editForm.store_name || null,
        memo: editForm.memo || null,
        is_public: editForm.is_public,
      },
      { onSuccess: handleEditClose },
    )
  }

  const handleDelete = async (id: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      deleteHistoryMutation.mutate(id, {
        onSuccess: () => resolve(),
        onError: (err) => reject(err),
      })
    })
  }

  return (
    <main className="flex flex-col min-h-screen px-4 pb-20 lg:pb-8 pt-6">
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
              <LoadingSpinner />
            </div>
          )}

          {!myIsLoading && (
            <>
              {myItems.length === 0 ? (
                <p className="text-center text-gray-400 py-12 text-sm">
                  {t('empty')}
                </p>
              ) : (
                <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                  {myItems.map((item) => (
                    <li key={item.id}>
                      <HistoryCard
                        item={item}
                        isOwner={item.userId === userId}
                        onEdit={handleEditOpen}
                        onDelete={handleDelete}
                      />
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
              <LoadingSpinner />
            </div>
          )}

          {!othersIsLoading && (
            <>
              {othersItems.length === 0 ? (
                <p className="text-center text-gray-400 py-12 text-sm">
                  {t('othersEmpty')}
                </p>
              ) : (
                <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
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
                          thumbnail_url: null,
                          ocr_image_url: null,
                          is_public: true,
                          memo: null,
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

      {/* 編集モーダル */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">
              {t('editModal.title')}
            </h2>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="edit-product-name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {t('editModal.productName')}
                </label>
                <input
                  id="edit-product-name"
                  type="text"
                  value={editForm.product_name}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, product_name: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={200}
                />
              </div>

              <div>
                <label
                  htmlFor="edit-store-name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {t('editModal.storeName')}
                </label>
                <input
                  id="edit-store-name"
                  type="text"
                  value={editForm.store_name}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, store_name: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={100}
                />
              </div>

              <div>
                <label
                  htmlFor="edit-memo"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {t('edit_memo')}
                </label>
                <textarea
                  id="edit-memo"
                  value={editForm.memo}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, memo: e.target.value }))
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                  maxLength={500}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="edit-is-public"
                  type="checkbox"
                  checked={editForm.is_public}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, is_public: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label
                  htmlFor="edit-is-public"
                  className="text-sm font-medium text-gray-700"
                >
                  {t('is_public_label')}
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleEditClose}
                disabled={updateHistoryMutation.isPending}
                className="flex-1 py-2 rounded-xl border border-gray-300 text-sm text-gray-600
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('editModal.cancel')}
              </button>
              <button
                type="button"
                onClick={handleEditSave}
                disabled={updateHistoryMutation.isPending}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateHistoryMutation.isPending ? t('loading') : t('editModal.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
