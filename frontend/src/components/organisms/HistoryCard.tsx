'use client'

import { useTranslations } from 'next-intl'
import type { HistoryItem } from '@/app/history/history.types'

const JUDGMENT_EMOJI: Record<'ng' | 'partial' | 'ok', string> = {
  ng: '🔴',
  partial: '🟡',
  ok: '✅',
}

type HistoryCardProps = {
  item: HistoryItem
  isOwner?: boolean
  onEdit?: (item: HistoryItem) => void
  onDelete?: (id: string) => Promise<void>
  isSelectMode?: boolean
  isSelected?: boolean
  onSelect?: (id: string) => void
}

export const HistoryCard = ({ item, isOwner = false, onEdit, onDelete, isSelectMode, isSelected, onSelect }: HistoryCardProps) => {
  const t = useTranslations('history')
  const { judgment, productName, detected, scannedAt, location, memo, thumbnailUrl, isPublic } = item

  const emoji = JUDGMENT_EMOJI[judgment]
  const formattedDate = new Date(scannedAt).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const handleDeleteClick = async () => {
    if (!onDelete) return
    const confirmed = window.confirm(t('deleteConfirm'))
    if (!confirmed) return
    await onDelete(item.id)
  }

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 space-y-2 ${isSelectMode ? 'cursor-pointer' : ''}`}
      onClick={isSelectMode ? () => onSelect?.(item.id) : undefined}
    >
      <div className="flex items-start gap-3">
        {/* 選択モード: チェックボックス */}
        {isSelectMode && (
          <input
            type="checkbox"
            checked={isSelected ?? false}
            onChange={() => onSelect?.(item.id)}
            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0 mt-0.5"
            aria-label={productName ?? item.id}
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {/* サムネイル */}
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={productName ?? ''}
            className="h-16 w-16 rounded object-cover shrink-0"
          />
        ) : (
          <div className="h-16 w-16 rounded bg-muted shrink-0" />
        )}

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-base">
              <span>{emoji}</span>
              {isOwner !== undefined && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-normal ${
                    isPublic
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {isPublic ? t('public_badge') : t('private_badge')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <time className="text-xs text-gray-400" dateTime={scannedAt}>
                {formattedDate}
              </time>
              {isOwner && onEdit && !isSelectMode && (
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                >
                  {t('editButton')}
                </button>
              )}
              {isOwner && onDelete && !isSelectMode && (
                <button
                  type="button"
                  onClick={() => void handleDeleteClick()}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  {t('deleteButton')}
                </button>
              )}
            </div>
          </div>

          {productName && (
            <p className="text-sm text-gray-800 truncate">{productName}</p>
          )}

          {location?.store_name && (
            <p className="text-xs text-gray-500 truncate">
              {t('storeName', { store: location.store_name })}
            </p>
          )}

          {memo && (
            <p className="text-sm text-muted-foreground line-clamp-2">{memo}</p>
          )}
        </div>
      </div>

      {detected.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {detected.map((allergen) => (
            <li
              key={allergen}
              className="text-xs bg-red-50 text-red-700 rounded-full px-2 py-0.5"
            >
              {allergen}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
