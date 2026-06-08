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
  onOpenDetail?: (item: HistoryItem) => void
  onEdit?: (item: HistoryItem) => void
  onDelete?: (id: string) => Promise<void>
  isSelectMode?: boolean
  isSelected?: boolean
  onSelect?: (id: string) => void
}

export const HistoryCard = ({
  item,
  isOwner = false,
  onOpenDetail,
  onEdit,
  onDelete,
  isSelectMode,
  isSelected,
  onSelect,
}: HistoryCardProps) => {
  const t = useTranslations('history')
  const { judgment, productName, detected, scannedAt, location, memo, thumbnailUrl, isPublic } =
    item

  const emoji = JUDGMENT_EMOJI[judgment]
  const formattedDate = new Date(scannedAt).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onDelete) return
    const confirmed = window.confirm(t('deleteConfirm'))
    if (!confirmed) return
    await onDelete(item.id)
  }

  const handleCardClick = () => {
    if (isSelectMode) {
      onSelect?.(item.id)
    } else {
      onOpenDetail?.(item)
    }
  }

  const isClickable = isSelectMode || (!isSelectMode && !!onOpenDetail)

  return (
    <div
      className={`relative bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 space-y-2 ${
        isClickable ? 'cursor-pointer active:bg-gray-50' : ''
      }`}
      onClick={isClickable ? handleCardClick : undefined}
    >
      {/* 右上アクションボタン（オーナー・通常モードのみ） */}
      {isOwner && !isSelectMode && (onEdit || onDelete) && (
        <div className="absolute top-2 right-2 flex items-center gap-0.5 z-10">
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEdit(item)
              }}
              className="flex items-center justify-center h-9 w-9 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              aria-label={t('detail.editAriaLabel')}
            >
              <span className="text-base leading-none">✏️</span>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => void handleDeleteClick(e)}
              className="flex items-center justify-center h-9 w-9 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              aria-label={t('detail.deleteAriaLabel')}
            >
              <span className="text-base leading-none">🗑️</span>
            </button>
          )}
        </div>
      )}

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

        {/* アクションボタンが表示される場合は右側にパディングを確保 */}
        <div
          className={`flex-1 min-w-0 space-y-1 ${
            isOwner && !isSelectMode && (onEdit || onDelete) ? 'pr-16' : ''
          }`}
        >
          <div className="flex items-center gap-2 font-semibold text-base">
            <span>{emoji}</span>
            {isOwner !== undefined && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-normal ${
                  isPublic ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {isPublic ? t('public_badge') : t('private_badge')}
              </span>
            )}
          </div>

          {productName && (
            <p className="text-sm text-gray-800 truncate">{productName}</p>
          )}

          {location?.store_name && (
            <p className="text-xs text-gray-500 truncate">
              {t('storeName', { store: location.store_name })}
            </p>
          )}

          <time className="block text-xs text-gray-400" dateTime={scannedAt}>
            {formattedDate}
          </time>

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
