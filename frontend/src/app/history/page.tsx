'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { HistoryCard } from '@/components/organisms/HistoryCard'
import { HistoryDetailModal } from '@/components/organisms/HistoryDetailModal'
import { ThumbnailCameraModal } from '@/components/organisms/ThumbnailCameraModal'
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
  productName: string
  storeName: string
  memo: string
  isPublic: boolean
  thumbnailUrl: string | null
}

const INITIAL_EDIT_FORM: EditFormData = {
  productName: '',
  storeName: '',
  memo: '',
  isPublic: false,
  thumbnailUrl: null,
}

export default function HistoryPage() {
  const t = useTranslations('history')
  const { user } = useAuthContext()
  const userId = user?.id ?? null

  const [activeTab, setActiveTab] = useState<HistoryTab>('mine')
  const [detailItem, setDetailItem] = useState<HistoryItem | null>(null)
  const [editingItem, setEditingItem] = useState<HistoryItem | null>(null)
  const [editForm, setEditForm] = useState<EditFormData>(INITIAL_EDIT_FORM)
  const [showThumbnailCamera, setShowThumbnailCamera] = useState(false)
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

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
    bulkDeleteHistoryMutation,
  } = useHistory()

  const {
    items: othersItems,
    isLoading: othersIsLoading,
    isFetchingNextPage: othersIsFetchingNextPage,
    hasNextPage: othersHasNextPage,
    fetchNextPage: othersFetchNextPage,
  } = useOthersScanned()

  const handleDetailOpen = (item: HistoryItem) => setDetailItem(item)
  const handleDetailClose = () => setDetailItem(null)

  const handleEditOpen = (item: HistoryItem) => {
    setEditingItem(item)
    setEditForm({
      productName: item.productName ?? '',
      storeName: item.location?.store_name ?? '',
      memo: item.memo ?? '',
      isPublic: item.isPublic,
      thumbnailUrl: item.thumbnailUrl,
    })
  }

  const handleEditClose = () => {
    setEditingItem(null)
    setEditForm(INITIAL_EDIT_FORM)
  }

  const handleEditSave = () => {
    if (!editingItem) return
    updateHistoryMutation.mutate(
      {
        id: editingItem.id,
        product_name: editForm.productName || null,
        store_name: editForm.storeName || null,
        memo: editForm.memo || null,
        is_public: editForm.isPublic,
        thumbnail_url: editForm.thumbnailUrl,
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

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds(new Set(myItems.map((item) => item.id)))
  }

  const handleCancelSelect = () => {
    setIsSelectMode(false)
    setSelectedIds(new Set())
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const confirmed = window.confirm(t('select.confirmDelete', { count: selectedIds.size }))
    if (!confirmed) return
    setIsBulkDeleting(true)
    try {
      await bulkDeleteHistoryMutation.mutateAsync([...selectedIds])
      handleCancelSelect()
    } finally {
      setIsBulkDeleting(false)
    }
  }

  return (
    <main className="flex flex-col min-h-screen px-4 pb-20 lg:pb-8 pt-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">{t('title')}</h1>

      {/* みんな/自分 タブ */}
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
          <div className="flex gap-2 mb-4 overflow-x-auto items-center">
            {/* 選択モードバー */}
            {isSelectMode && (
              <>
                <div className="flex items-center gap-3 shrink-0">
                  <button type="button" onClick={handleCancelSelect} className="text-sm text-gray-600">
                    ✕ {t('select.cancel')}
                  </button>
                  <button type="button" onClick={handleSelectAll} className="text-sm text-blue-600">
                    {t('select.selectAll')}
                  </button>
                </div>
                <span className="flex-1 text-right text-sm text-gray-700">
                  {t('select.count', { count: selectedIds.size })}
                </span>
              </>
            )}

            {/* フィルタボタン群（通常モードのみ） */}
            {!isSelectMode && FILTER_TAB_VALUES.map((value) => (
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

            {/* 選択ボタン（通常モードのみ右端に表示） */}
            {!isSelectMode && (
              <button
                type="button"
                onClick={() => setIsSelectMode(true)}
                className="ml-auto shrink-0 text-sm text-blue-600 font-medium"
              >
                {t('select.enter')}
              </button>
            )}
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
                        onOpenDetail={!isSelectMode ? handleDetailOpen : undefined}
                        onEdit={isSelectMode ? undefined : handleEditOpen}
                        onDelete={isSelectMode ? undefined : handleDelete}
                        isSelectMode={isSelectMode}
                        isSelected={selectedIds.has(item.id)}
                        onSelect={handleToggleSelect}
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

          {/* 一括削除バー（選択モード時・画面下部固定） */}
          {isSelectMode && (
            <div className="fixed bottom-16 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3 lg:bottom-0">
              <button
                type="button"
                onClick={() => void handleBulkDelete()}
                disabled={selectedIds.size === 0 || isBulkDeleting}
                className="w-full py-3 rounded-xl bg-red-600 text-white text-sm font-medium
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isBulkDeleting
                  ? t('select.deleting')
                  : t('select.delete', { count: selectedIds.size })}
              </button>
            </div>
          )}
        </>
      )}

      {/* みんなのスキャンタブ */}
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
                          ocrImageUrl: null,
                          isPublic: true,
                          memo: null,
                          rawText: null,
                          scannedAt: item.updated_at,
                        }}
                        onOpenDetail={handleDetailOpen}
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

      {/* 詳細モーダル */}
      {detailItem && (
        <HistoryDetailModal
          item={detailItem}
          isOwner={detailItem.userId === userId}
          onClose={handleDetailClose}
          onEdit={(item) => {
            handleDetailClose()
            handleEditOpen(item)
          }}
          onDelete={async (id) => {
            await handleDelete(id)
            handleDetailClose()
          }}
        />
      )}

      {/* サムネイル再撮影カメラモーダル */}
      {showThumbnailCamera && (
        <ThumbnailCameraModal
          onCapture={(url) => {
            setEditForm((prev) => ({ ...prev, thumbnailUrl: url }))
            setShowThumbnailCamera(false)
          }}
          onClose={() => setShowThumbnailCamera(false)}
        />
      )}

      {/* 編集モーダル */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {t('editModal.title')}
              </h2>
              <button
                type="button"
                onClick={handleEditClose}
                disabled={updateHistoryMutation.isPending}
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-40"
                aria-label={t('editModal.cancel')}
              >
                ✕
              </button>
            </div>

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
                  value={editForm.productName}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, productName: e.target.value }))
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
                  value={editForm.storeName}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, storeName: e.target.value }))
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
                  checked={editForm.isPublic}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, isPublic: e.target.checked }))
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

              {/* サムネイル */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('editModal.thumbnail')}
                </label>
                <div className="flex items-center gap-3">
                  {editForm.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editForm.thumbnailUrl}
                      alt=""
                      className="h-16 w-16 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded bg-gray-100 shrink-0" />
                  )}
                  <button
                    type="button"
                    onClick={() => setShowThumbnailCamera(true)}
                    className="text-sm text-blue-600"
                  >
                    {t('editModal.retake')}
                  </button>
                </div>
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
