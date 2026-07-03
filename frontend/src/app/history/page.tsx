'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { HistoryProductCard } from '@/components/organisms/HistoryProductCard'
import { HistoryDetailPanel } from '@/components/organisms/HistoryDetailPanel'
import { ThumbnailCameraModal } from '@/components/organisms/ThumbnailCameraModal'
import { ConfirmDialog } from '@/components/atoms/ConfirmDialog'
import { ImageLightbox } from '@/components/atoms/ImageLightbox'
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner'
import { useHistory } from '@/hooks/useHistory'
import { useOthersScanned } from '@/hooks/useOthersScanned'
import { useSystemProducts } from '@/hooks/useSystemProducts'
import { useAuthContext } from '@/providers/AuthProvider'
import { haversineDistanceKm } from '@/lib/geo.utils'
import { HISTORY_TAB_STORAGE_KEY, GEO_SORT_TIMEOUT_MS } from './history.constants'
import type { HistoryGroup, HistoryFilter, PatchHistoryBody, OthersProductItem, SystemProductItem } from './history.types'

/** 履歴ページのタブ識別子。 */
type HistoryTab = 'mine' | 'others' | 'system'

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

/** 詳細モーダルの対象（グループ + 対象スキャン行）。 */
type DetailTarget = {
  group: HistoryGroup
  scan: HistoryGroup['scans'][number]
}

/** 編集モーダルの対象（スキャン ID + 編集対象フィールド）。 */
type EditTarget = {
  scanId: string
  productName: string | null
  storeName: string | null
  memo: string | null
  thumbnailUrl: string | null
}

/** 判定フィルタチップ（自分のスキャン / みんなのスキャン 共通）。 */
const FilterChips = ({
  value,
  onChange,
  labels,
}: {
  value: HistoryFilter
  onChange: (filter: HistoryFilter) => void
  labels: (filter: HistoryFilter) => string
}) => (
  <>
    {FILTER_TAB_VALUES.map((filter) => (
      <button
        key={filter}
        type="button"
        onClick={() => onChange(filter)}
        className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          value === filter ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
        }`}
      >
        {labels(filter)}
      </button>
    ))}
  </>
)

/** 商品名検索 + 店舗名フィルタ入力（自分のスキャン / みんなのスキャン 共通）。 */
const SearchFields = ({
  search,
  onChange,
  productPlaceholder,
  storePlaceholder,
}: {
  search: { q: string; store: string }
  onChange: (search: { q: string; store: string }) => void
  productPlaceholder: string
  storePlaceholder: string
}) => (
  <div className="flex gap-2 mb-4">
    <input
      type="search"
      value={search.q}
      onChange={(e) => onChange({ ...search, q: e.target.value })}
      placeholder={productPlaceholder}
      aria-label={productPlaceholder}
      className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg
        focus:outline-none focus:border-blue-400"
    />
    <input
      type="search"
      value={search.store}
      onChange={(e) => onChange({ ...search, store: e.target.value })}
      placeholder={storePlaceholder}
      aria-label={storePlaceholder}
      className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg
        focus:outline-none focus:border-blue-400"
    />
  </div>
)

export default function HistoryPage() {
  const t = useTranslations('history')
  const { user } = useAuthContext()
  const userId = user?.id ?? null
  const isAdmin = (user?.app_metadata as { role?: string } | undefined)?.role === 'admin'

  const [activeTab, setActiveTab] = useState<HistoryTab>('mine')

  // リロード後もタブ選択を維持する（SSR ハイドレーション不一致を避けるため useEffect で復元）
  useEffect(() => {
    if (localStorage.getItem(HISTORY_TAB_STORAGE_KEY) === 'others') {
      setActiveTab('others')
    }
  }, [])

  const handleTabChange = (tab: HistoryTab): void => {
    setActiveTab(tab)
    localStorage.setItem(HISTORY_TAB_STORAGE_KEY, tab)
  }

  // 近い順ソート（00320-C）: 現在地基準のクライアントソート。読み込み済みアイテムにのみ適用される
  // null = ソート指定なし（APIのデフォルト順 = 新しい順）
  const [sortMode, setSortMode] = useState<'newest' | 'nearest' | null>(null)
  const [sortOrigin, setSortOrigin] = useState<{ lat: number; lng: number } | null>(null)

  const handleSortNewest = (): void => {
    // ON なら OFF（null）に、OFF なら ON に切り替える
    setSortMode((prev) => (prev === 'newest' ? null : 'newest'))
  }

  const handleSortNearest = (): void => {
    if (sortMode === 'nearest') {
      // ON → OFF
      setSortMode(null)
      return
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSortOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setSortMode('nearest')
      },
      () => {
        // 現在地が取れない場合は変更しない
      },
      { timeout: GEO_SORT_TIMEOUT_MS },
    )
  }

  /** SP/tablet の <select> からの並び順変更ハンドラ。 */
  const handleSortChange = (value: string): void => {
    if (value === 'nearest') {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setSortOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          setSortMode('nearest')
        },
        () => { setSortMode(null) },
        { timeout: GEO_SORT_TIMEOUT_MS },
      )
      return
    }
    setSortMode(value === 'newest' ? 'newest' : null)
  }
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null)
  const [othersDetailGroup, setOthersDetailGroup] = useState<HistoryGroup | null>(null)
  const [systemDetailGroup, setSystemDetailGroup] = useState<HistoryGroup | null>(null)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [editForm, setEditForm] = useState<EditFormData>(INITIAL_EDIT_FORM)
  const [showThumbnailCamera, setShowThumbnailCamera] = useState(false)
  const [isSelectMode, setIsSelectMode] = useState(false)
  /**
   * 選択中のグループキー（各グループの scans[0].id を識別子として使用）。
   * スキャンID単位ではなくグループ単位で選択し、削除時に全スキャンIDへ展開する。
   */
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  /** ゴミ箱ボタンで削除確認中のスキャン ID。null のとき非表示。 */
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  /** 一括削除の確認ダイアログを表示するか。 */
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  /** ライトボックスで拡大表示するサムネイル URL。null のとき非表示。 */
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const {
    items: myItems,
    isLoading: myIsLoading,
    isFetchingNextPage: myIsFetchingNextPage,
    hasNextPage: myHasNextPage,
    fetchNextPage: myFetchNextPage,
    filter,
    setFilter,
    search,
    setSearch,
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
    filter: othersFilter,
    setFilter: setOthersFilter,
    search: othersSearch,
    setSearch: setOthersSearch,
  } = useOthersScanned()

  const {
    items: systemItems,
    isLoading: systemIsLoading,
    isFetchingNextPage: systemIsFetchingNextPage,
    hasNextPage: systemHasNextPage,
    fetchNextPage: systemFetchNextPage,
    filter: systemFilter,
    setFilter: setSystemFilter,
    search: systemSearch,
    setSearch: setSystemSearch,
  } = useSystemProducts()

  const displayedMyItems = useMemo<HistoryGroup[]>(() => {
    if (sortMode !== 'nearest' || !sortOrigin) return myItems
    return [...myItems].sort((a, b) => {
      const locA = a.scans[0]?.location
      const locB = b.scans[0]?.location
      if (!locA?.lat || !locA?.lng) return 1
      if (!locB?.lat || !locB?.lng) return -1
      const dA = haversineDistanceKm(sortOrigin.lat, sortOrigin.lng, locA.lat, locA.lng)
      const dB = haversineDistanceKm(sortOrigin.lat, sortOrigin.lng, locB.lat, locB.lng)
      return dA - dB
    })
  }, [myItems, sortMode, sortOrigin])

  const handleDetailOpen = (group: HistoryGroup, scan: HistoryGroup['scans'][number]) =>
    setDetailTarget({ group, scan })
  const handleDetailClose = () => setDetailTarget(null)

  const othersItemToGroup = (item: OthersProductItem): HistoryGroup => ({
    product: {
      id: item.id,
      name: item.product_name,
      allergens: item.allergens,
      thumbnailUrl: item.thumbnail_url,
      itemUrl: null,
    },
    judgment: item.judgment,
    detected: item.detected,
    scans: [{
      id: item.id,
      scannedAt: item.updated_at,
      location: item.store_name ? { store_name: item.store_name, lat: 0, lng: 0 } : null,
      memo: null,
      thumbnailUrl: item.thumbnail_url,
      ocrImageUrl: null,
      rawText: item.raw_text,
    }],
    latestScanAt: item.updated_at,
  })

  const systemItemToGroup = (item: SystemProductItem): HistoryGroup => ({
    product: {
      id: item.id,
      name: item.product_name,
      allergens: {
        contains: item.allergens_contains,
        partial: item.allergens_partial,
        components: [],
      },
      thumbnailUrl: item.thumbnail_url,
      itemUrl: null,
    },
    judgment: item.judgment,
    detected: [...item.allergens_contains, ...item.allergens_partial],
    scans: [{
      id: item.id,
      scannedAt: item.updated_at,
      location: null,
      memo: `JANコード： ${item.jan_code}`,
      thumbnailUrl: item.thumbnail_url,
      ocrImageUrl: null,
      rawText: null,
    }],
    latestScanAt: item.updated_at,
  })

  const handleDetailPatch = async (
    scanId: string,
    data: { product_name?: string | null; store_name?: string | null; memo?: string | null },
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      updateHistoryMutation.mutate(
        { id: scanId, ...data },
        { onSuccess: () => resolve(), onError: (err) => reject(err) },
      )
    })
  }

  const handleEditOpen = (group: HistoryGroup) => {
    const firstScan = group.scans[0]
    if (!firstScan) return
    const currentThumbnailUrl = firstScan.thumbnailUrl ?? group.product.thumbnailUrl
    setEditTarget({
      scanId: firstScan.id,
      productName: group.product.name,
      storeName: firstScan.location?.store_name ?? null,
      memo: firstScan.memo,
      thumbnailUrl: currentThumbnailUrl,
    })
    setEditForm({
      productName: group.product.name ?? '',
      storeName: firstScan.location?.store_name ?? '',
      memo: firstScan.memo ?? '',
      isPublic: false,
      thumbnailUrl: currentThumbnailUrl,
    })
  }

  const handleEditClose = () => {
    setEditTarget(null)
    setEditForm(INITIAL_EDIT_FORM)
  }

  const handleEditSave = () => {
    if (!editTarget) return
    updateHistoryMutation.mutate(
      {
        id: editTarget.scanId,
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

  const handleToggleSelect = (groupKey: string) => {
    setSelectedGroupKeys((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedGroupKeys(
      new Set(displayedMyItems.map((g) => g.scans[0]?.id).filter(Boolean) as string[]),
    )
  }

  const handleCancelSelect = () => {
    setIsSelectMode(false)
    setSelectedGroupKeys(new Set())
  }

  const executeBulkDelete = async () => {
    setShowBulkDeleteConfirm(false)
    setIsBulkDeleting(true)
    // グループキーに紐づく全スキャンIDを展開して一括削除する
    const allScanIds = displayedMyItems
      .filter((g) => g.scans[0]?.id && selectedGroupKeys.has(g.scans[0].id))
      .flatMap((g) => g.scans.map((s) => s.id))
    try {
      await bulkDeleteHistoryMutation.mutateAsync(allScanIds)
      handleCancelSelect()
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const handleBulkDelete = () => {
    if (selectedGroupKeys.size === 0) return
    setShowBulkDeleteConfirm(true)
  }

  return (
    <main className="flex flex-col min-h-screen px-4 pb-20 lg:pb-8 pt-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">{t('title')}</h1>

      {/* みんな/自分/システム タブ（whitespace-nowrap + flex-1 で折り返し防止） */}
      <div className="flex mb-4 border-b border-gray-200">
        {(['mine', 'others'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => handleTabChange(tab)}
            className={`flex-1 text-center whitespace-nowrap px-2 py-2 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500'
            }`}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
        {isAdmin && (
          <button
            type="button"
            onClick={() => handleTabChange('system')}
            className={`flex-1 text-center whitespace-nowrap px-2 py-2 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'system'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500'
            }`}
          >
            {t('tabs.system')}
          </button>
        )}
      </div>

      {/* 自分のスキャンタブ */}
      {activeTab === 'mine' && (
        <>
          {/* 選択モードバー（共通） */}
          {isSelectMode && (
            <div className="flex items-center gap-3 mb-4">
              <button type="button" onClick={handleCancelSelect} className="text-sm text-gray-600">
                ✕ {t('select.cancel')}
              </button>
              <button type="button" onClick={handleSelectAll} className="text-sm text-blue-600">
                {t('select.selectAll')}
              </button>
              <span className="flex-1 text-right text-sm text-gray-700">
                {t('select.count', { count: selectedGroupKeys.size })}
              </span>
            </div>
          )}

          {!isSelectMode && (
            <>
              {/* SP/tablet: セレクト式（横スクロールなし）*/}
              <div className="flex gap-2 mb-4 items-center lg:hidden">
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as HistoryFilter)}
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400"
                >
                  {FILTER_TAB_VALUES.map((f) => (
                    <option key={f} value={f}>{t(`filter.${f}`)}</option>
                  ))}
                </select>
                <select
                  value={sortMode ?? ''}
                  onChange={(e) => handleSortChange(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400"
                >
                  <option value="">{t('sort.default')}</option>
                  <option value="newest">{t('sort.newest')}</option>
                  <option value="nearest">{t('sort.nearest')}</option>
                </select>
                <button
                  type="button"
                  onClick={() => setIsSelectMode(true)}
                  className="shrink-0 text-sm text-blue-600 font-medium"
                >
                  {t('select.enter')}
                </button>
              </div>

              {/* PC: チップ式（lg+） */}
              <div className="hidden lg:flex gap-2 mb-4 items-center">
                <FilterChips
                  value={filter}
                  onChange={setFilter}
                  labels={(f) => t(`filter.${f}`)}
                />
                <button
                  type="button"
                  onClick={handleSortNewest}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    sortMode === 'newest' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {t('sort.newest')}
                </button>
                <button
                  type="button"
                  onClick={handleSortNearest}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    sortMode === 'nearest' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {t('sort.nearest')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsSelectMode(true)}
                  className="ml-auto shrink-0 text-sm text-blue-600 font-medium"
                >
                  {t('select.enter')}
                </button>
              </div>
            </>
          )}

          {/* 商品名検索 + 店舗名フィルタ（選択モード中は非表示） */}
          {!isSelectMode && (
            <SearchFields
              search={search}
              onChange={setSearch}
              productPlaceholder={t('search.productPlaceholder')}
              storePlaceholder={t('search.storePlaceholder')}
            />
          )}

          {myIsLoading && (
            <div className="flex justify-center items-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {!myIsLoading && (
            <>
              {displayedMyItems.length === 0 ? (
                <p className="text-center text-gray-400 py-12 text-sm">
                  {t('empty')}
                </p>
              ) : (
                <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                  {displayedMyItems.map((group) => {
                    const firstScan = group.scans[0]
                    if (!firstScan) return null
                    const firstScanId = firstScan.id
                    const isSelected = selectedGroupKeys.has(firstScanId)
                    const displayThumbnail = firstScan.thumbnailUrl ?? group.product.thumbnailUrl
                    const lightboxSrc = firstScan.ocrImageUrl ?? displayThumbnail

                    return (
                      <HistoryProductCard
                        key={`${group.product.id ?? 'no-id'}-${group.latestScanAt}`}
                        productName={group.product.name}
                        judgment={group.judgment}
                        allergens={group.product.allergens}
                        detected={group.detected}
                        thumbnailUrl={displayThumbnail}
                        lightboxSrc={lightboxSrc}
                        scans={group.scans.map((s) => ({
                          id: s.id,
                          storeName: s.location?.store_name ?? null,
                          scannedAt: s.scannedAt,
                        }))}
                        onDetailClick={(scanId) => {
                          const scan = group.scans.find((s) => s.id === scanId) ?? firstScan
                          handleDetailOpen(group, scan)
                        }}
                        onLightboxOpen={(url) => setLightboxUrl(url)}
                        onEdit={!isSelectMode ? () => handleEditOpen(group) : undefined}
                        onDelete={!isSelectMode ? (scanId) => setDeleteConfirmId(scanId) : undefined}
                        isSelectMode={isSelectMode}
                        isSelected={isSelected}
                        onSelect={() => handleToggleSelect(firstScanId)}
                        itemUrl={group.product.itemUrl}
                      />
                    )
                  })}
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
                disabled={selectedGroupKeys.size === 0 || isBulkDeleting}
                className="w-full py-3 rounded-xl bg-red-600 text-white text-sm font-medium
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isBulkDeleting
                  ? t('select.deleting')
                  : t('select.delete', { count: selectedGroupKeys.size })}
              </button>
            </div>
          )}
        </>
      )}

      {/* みんなのスキャンタブ */}
      {activeTab === 'others' && (
        <>
          {/* 判定フィルタ */}
          {/* SP/tablet: セレクト式 */}
          <div className="flex gap-2 mb-4 lg:hidden">
            <select
              value={othersFilter}
              onChange={(e) => setOthersFilter(e.target.value as HistoryFilter)}
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400"
            >
              {FILTER_TAB_VALUES.map((f) => (
                <option key={f} value={f}>{t(`filter.${f}`)}</option>
              ))}
            </select>
          </div>
          {/* PC: チップ式 */}
          <div className="hidden lg:flex gap-2 mb-4 items-center">
            <FilterChips
              value={othersFilter}
              onChange={setOthersFilter}
              labels={(f) => t(`filter.${f}`)}
            />
          </div>
          <SearchFields
            search={othersSearch}
            onChange={setOthersSearch}
            productPlaceholder={t('search.productPlaceholder')}
            storePlaceholder={t('search.storePlaceholder')}
          />

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
                    <HistoryProductCard
                      key={item.id}
                      productName={item.product_name}
                      judgment={item.judgment}
                      allergens={{ contains: item.allergens.contains, partial: item.allergens.partial }}
                      detected={item.detected}
                      thumbnailUrl={item.thumbnail_url}
                      lightboxSrc={item.thumbnail_url}
                      scans={[{
                        id: item.id,
                        storeName: item.store_name,
                        scannedAt: item.updated_at,
                      }]}
                      onDetailClick={() => setOthersDetailGroup(othersItemToGroup(item))}
                      onLightboxOpen={(url) => setLightboxUrl(url)}
                      isExpired={item.is_expired}
                    />
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

      {/* システムタブ（admin のみ） */}
      {activeTab === 'system' && isAdmin && (
        <>
          {/* フィルタ: SP/tablet はセレクト式 */}
          <div className="flex gap-2 mb-4 lg:hidden">
            <select
              value={systemFilter}
              onChange={(e) => setSystemFilter(e.target.value as HistoryFilter)}
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400"
            >
              {FILTER_TAB_VALUES.map((f) => (
                <option key={f} value={f}>{t(`filter.${f}`)}</option>
              ))}
            </select>
          </div>
          {/* PC: チップ式 */}
          <div className="hidden lg:flex gap-2 mb-4 items-center">
            <FilterChips
              value={systemFilter}
              onChange={setSystemFilter}
              labels={(f) => t(`filter.${f}`)}
            />
          </div>

          {/* 商品名検索 */}
          <div className="flex gap-2 mb-4">
            <input
              type="search"
              value={systemSearch}
              onChange={(e) => setSystemSearch(e.target.value)}
              placeholder={t('system.searchPlaceholder')}
              aria-label={t('system.searchPlaceholder')}
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg
                focus:outline-none focus:border-blue-400"
            />
          </div>

          {systemIsLoading && (
            <div className="flex justify-center items-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {!systemIsLoading && (
            <>
              {systemItems.length === 0 ? (
                <p className="text-center text-gray-400 py-12 text-sm">
                  {t('system.empty')}
                </p>
              ) : (
                <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                  {systemItems.map((item) => (
                    <HistoryProductCard
                      key={item.id}
                      productName={item.product_name}
                      judgment={item.judgment}
                      allergens={{
                        contains: item.allergens_contains,
                        partial: item.allergens_partial,
                      }}
                      detected={[...item.allergens_contains, ...item.allergens_partial]}
                      thumbnailUrl={item.thumbnail_url}
                      lightboxSrc={item.thumbnail_url}
                      scans={[{
                        id: item.id,
                        storeName: null,
                        scannedAt: item.updated_at,
                      }]}
                      onDetailClick={() => setSystemDetailGroup(systemItemToGroup(item))}
                      onLightboxOpen={(url) => setLightboxUrl(url)}
                    />
                  ))}
                </ul>
              )}

              {systemHasNextPage && (
                <button
                  type="button"
                  onClick={() => systemFetchNextPage()}
                  disabled={systemIsFetchingNextPage}
                  className="mt-6 w-full py-3 rounded-xl border border-gray-300 text-sm text-gray-600
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {systemIsFetchingNextPage ? t('loading') : t('loadMore')}
                </button>
              )}
            </>
          )}
        </>
      )}

      {/* 詳細パネル（自分のスキャン用） */}
      {detailTarget && (
        <HistoryDetailPanel
          group={detailTarget.group}
          selectedScan={detailTarget.scan}
          isOpen={true}
          onClose={handleDetailClose}
          onPatch={handleDetailPatch}
          onDelete={(scanId) => {
            void handleDelete(scanId)
            handleDetailClose()
          }}
          onTogglePublic={(scanId, isPublic) => {
            updateHistoryMutation.mutate({ id: scanId, is_public: isPublic })
          }}
        />
      )}

      {/* 詳細パネル（みんなのスキャン用・readonly） */}
      {othersDetailGroup && (
        <HistoryDetailPanel
          group={othersDetailGroup}
          selectedScan={othersDetailGroup.scans[0]!}
          isOpen={true}
          onClose={() => setOthersDetailGroup(null)}
          readonly
        />
      )}

      {/* 詳細パネル（システム用・readonly） */}
      {systemDetailGroup && (
        <HistoryDetailPanel
          group={systemDetailGroup}
          selectedScan={systemDetailGroup.scans[0]!}
          isOpen={true}
          onClose={() => setSystemDetailGroup(null)}
          readonly
        />
      )}

      {/* 1件削除確認ダイアログ */}
      {deleteConfirmId && (
        <ConfirmDialog
          message={t('deleteConfirm')}
          confirmLabel={t('deleteButton')}
          cancelLabel={t('editModal.cancel')}
          isDanger
          onConfirm={() => {
            void handleDelete(deleteConfirmId)
            setDeleteConfirmId(null)
          }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      {/* 一括削除確認ダイアログ */}
      {showBulkDeleteConfirm && (
        <ConfirmDialog
          message={t('select.confirmDelete', { count: selectedGroupKeys.size })}
          confirmLabel={t('select.delete', { count: selectedGroupKeys.size })}
          cancelLabel={t('editModal.cancel')}
          isDanger
          onConfirm={() => void executeBulkDelete()}
          onCancel={() => setShowBulkDeleteConfirm(false)}
        />
      )}

      {/* サムネイル再撮影カメラモーダル */}
      {showThumbnailCamera && (
        <ThumbnailCameraModal
          onCapture={(s3Url, _localDataUrl) => {
            setEditForm((prev) => ({ ...prev, thumbnailUrl: s3Url }))
            setShowThumbnailCamera(false)
          }}
          onClose={() => setShowThumbnailCamera(false)}
        />
      )}

      {/* 編集モーダル */}
      {editTarget && (
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
                  <span className="ml-1 text-red-500" aria-hidden="true">*</span>
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
                  required
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
                disabled={updateHistoryMutation.isPending || editForm.productName.trim() === ''}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium
                  disabled:opacity-50 disabled:cursor-default"
              >
                {updateHistoryMutation.isPending ? t('loading') : t('editModal.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* サムネイル拡大ライトボックス */}
      {lightboxUrl && (
        <ImageLightbox
          src={lightboxUrl}
          closeAriaLabel={t('detail.close')}
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </main>
  )
}
