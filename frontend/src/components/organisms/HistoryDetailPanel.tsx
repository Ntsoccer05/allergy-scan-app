'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ImageLightbox } from '@/components/atoms/ImageLightbox'
import type { HistoryGroup } from '@/app/history/history.types'

/** HistoryDetailPanel が受け取る ScanEntry の型 */
type ScanEntryLike = {
  id: string
  scannedAt: string
  location: { store_name: string; lat: number; lng: number } | null
  memo: string | null
  thumbnailUrl?: string | null
  ocrImageUrl?: string | null
  rawText?: string | null
}

type PatchData = {
  product_name?: string | null
  store_name?: string | null
  memo?: string | null
}

type Props = {
  group: HistoryGroup
  selectedScan: ScanEntryLike
  isOpen: boolean
  onClose: () => void
  readonly?: boolean
  onPatch?: (scanId: string, data: PatchData) => Promise<void>
  onDelete?: (scanId: string) => void
}

/** rawText 内のアレルゲン名をグループ別色でハイライトする */
const HighlightedRawText = ({
  text,
  containsAllergens,
  partialAllergens,
  otherAllergens,
}: {
  text: string
  containsAllergens: string[]
  partialAllergens: string[]
  otherAllergens: string[]
}) => {
  const allAllergens = [...containsAllergens, ...partialAllergens, ...otherAllergens]
  if (allAllergens.length === 0) return <>{text}</>
  const escaped = allAllergens.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(pattern)
  return (
    <>
      {parts.map((part, i) => {
        const lower = part.toLowerCase()
        const isContains = containsAllergens.some((a) => a.toLowerCase() === lower)
        const isPartial = !isContains && partialAllergens.some((a) => a.toLowerCase() === lower)
        const isOther = !isContains && !isPartial && otherAllergens.some((a) => a.toLowerCase() === lower)
        if (isContains) {
          return (
            <mark key={i} className="bg-red-100 text-red-900 rounded px-0.5 font-semibold not-italic">
              {part}
            </mark>
          )
        }
        if (isPartial) {
          return (
            <mark key={i} className="bg-amber-100 text-amber-900 rounded px-0.5 font-semibold not-italic">
              {part}
            </mark>
          )
        }
        if (isOther) {
          return (
            <mark key={i} className="bg-gray-100 text-gray-800 rounded px-0.5 font-semibold not-italic">
              {part}
            </mark>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

export const HistoryDetailPanel = ({
  group,
  selectedScan,
  isOpen,
  onClose,
  readonly = false,
  onPatch,
  onDelete,
}: Props) => {
  const t = useTranslations('history')
  const [isEditing, setIsEditing] = useState(false)
  const [rawTextOpen, setRawTextOpen] = useState(true)
  const [productName, setProductName] = useState(group.product.name ?? '')
  const [storeName, setStoreName] = useState(selectedScan.location?.store_name ?? '')
  const [memo, setMemo] = useState(selectedScan.memo ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  if (!isOpen) return null

  const judgmentEmoji =
    group.judgment === 'ng' ? '🔴' : group.judgment === 'partial' ? '🟡' : '✅'
  const judgmentLabel = t(`detail.judgment.${group.judgment}`)
  const displayThumbnail = selectedScan.thumbnailUrl ?? group.product.thumbnailUrl

  // detected を contains / partial / その他 に分類
  const containsGroup = group.detected.filter((a) =>
    group.product.allergens.contains.includes(a),
  )
  const partialGroup = group.detected.filter((a) =>
    group.product.allergens.partial.includes(a),
  )
  // contains でも partial でもないもの（components 由来など）
  const otherGroup = group.detected.filter(
    (a) =>
      !group.product.allergens.contains.includes(a) &&
      !group.product.allergens.partial.includes(a),
  )

  const handleSave = async (): Promise<void> => {
    if (!onPatch) return
    setIsSaving(true)
    try {
      await onPatch(selectedScan.id, {
        product_name: productName || null,
        store_name: storeName || null,
        memo: memo || null,
      })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteClick = (): void => {
    if (!onDelete) return
    const confirmed = window.confirm(t('deleteConfirm'))
    if (!confirmed) return
    onDelete(selectedScan.id)
    onClose()
  }

  return (
    <>
      {lightboxOpen && displayThumbnail && (
        <ImageLightbox
          src={selectedScan.ocrImageUrl ?? displayThumbnail}
          closeAriaLabel={t('detail.close')}
          onClose={() => setLightboxOpen(false)}
        />
      )}
      <div className="fixed inset-0 z-50 flex flex-col">
      {/* オーバーレイ */}
      <div
        className="flex-1 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* パネル本体 */}
      <div className="bg-white rounded-t-2xl overflow-y-auto max-h-[85dvh] shadow-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <span className="font-semibold text-gray-900">{t('detail.title')}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('detail.close')}
            className="text-gray-400 text-lg hover:text-gray-600 p-1"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-4 space-y-4 pb-8">
          {/* サムネイル */}
          {displayThumbnail && (
            <button
              type="button"
              aria-label={t('detail.thumbnailAriaLabel')}
              onClick={() => setLightboxOpen(true)}
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayThumbnail}
                alt=""
                className="h-24 w-24 object-cover rounded-xl shrink-0 cursor-pointer"
              />
            </button>
          )}

          {/* 検出アレルゲン（分類別グループ表示） */}
          {group.detected.length > 0 && (
            <div className="space-y-3">
              {/* 🔴 含む */}
              {containsGroup.length > 0 && (
                <div>
                  <p className="text-sm font-bold text-red-700 mb-1.5">{t('detail.containsLabel')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {containsGroup.map((allergen) => (
                      <span
                        key={allergen}
                        className="rounded-full bg-red-100 border border-red-300 text-red-900 font-medium text-sm px-3 py-1"
                      >
                        {allergen}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* 🟡 一部含む */}
              {partialGroup.length > 0 && (
                <div>
                  <p className="text-sm font-bold text-amber-700 mb-1.5">{t('detail.partialLabel')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {partialGroup.map((allergen) => (
                      <span
                        key={allergen}
                        className="rounded-full bg-amber-100 border border-amber-300 text-amber-900 font-medium text-sm px-3 py-1"
                      >
                        {allergen}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* その他（components 由来など） */}
              {otherGroup.length > 0 && (
                <div>
                  <p className="text-sm font-bold text-gray-600 mb-1.5">{t('detail.otherLabel')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {otherGroup.map((allergen) => (
                      <span
                        key={allergen}
                        className="rounded-full bg-gray-100 border border-gray-300 text-gray-800 font-medium text-sm px-3 py-1"
                      >
                        {allergen}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 編集モード */}
          {isEditing && !readonly ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {t('detail.productName')}
                </label>
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {t('detail.storeName')}
                </label>
                <input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {t('detail.memo')}
                </label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600"
                >
                  {t('detail.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {isSaving ? '...' : t('detail.save')}
                </button>
              </div>
            </div>
          ) : (
            /* 表示モード */
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <span>📍</span>
                <span>{selectedScan.location?.store_name ?? t('location.unknown')}</span>
              </div>
              {selectedScan.memo && (
                <div className="flex items-start gap-2">
                  <span>📝</span>
                  <span>{selectedScan.memo}</span>
                </div>
              )}
              <p className="text-xs text-gray-400">
                {new Date(selectedScan.scannedAt).toLocaleString('ja-JP')}
              </p>
            </div>
          )}

          {/* rawText アコーディオン（アレルゲンハイライト付き） */}
          {selectedScan.rawText && (
            <div>
              <button
                type="button"
                onClick={() => setRawTextOpen((o) => !o)}
                className="text-sm text-blue-600 hover:underline"
              >
                {rawTextOpen ? t('detail.rawTextCollapse') : t('detail.rawTextExpand')}
              </button>
              {rawTextOpen && (
                <p className="mt-2 text-sm leading-7 text-gray-700 bg-gray-50 rounded p-3 whitespace-pre-wrap">
                  <HighlightedRawText
                    text={selectedScan.rawText}
                    containsAllergens={containsGroup}
                    partialAllergens={partialGroup}
                    otherAllergens={otherGroup}
                  />
                </p>
              )}
            </div>
          )}

          {/* ⚠️ 安全設計: 免責文省略禁止（implementation_rules.md §3） */}
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
            ⚠️ {t('detail.caution')}
          </p>

          {/* 編集・削除ボタン（表示モード時のみ・readonlyでは非表示） */}
          {!isEditing && !readonly && (
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700"
              >
                {t('detail.edit')}
              </button>
              <button
                type="button"
                onClick={handleDeleteClick}
                className="flex-1 py-2.5 border border-red-200 rounded-lg text-sm text-red-600"
              >
                {t('detail.delete')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
