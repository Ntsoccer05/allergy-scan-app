'use client'

import { useTranslations } from 'next-intl'
import type { HistoryItem } from '@/app/history/history.types'

const JUDGMENT_EMOJI: Record<'ng' | 'partial' | 'ok', string> = {
  ng: '🔴',
  partial: '🟡',
  ok: '✅',
}

const JUDGMENT_LABEL: Record<'ng' | 'partial' | 'ok', string> = {
  ng: '含む',
  partial: '一部含む',
  ok: 'なし',
}

type HistoryCardProps = {
  item: HistoryItem
  isOwner?: boolean
  onEdit?: (item: HistoryItem) => void
  onDelete?: (id: string) => Promise<void>
}

export const HistoryCard = ({ item, isOwner = false, onEdit, onDelete }: HistoryCardProps) => {
  const t = useTranslations('history')
  const { judgment, productName, detected, scannedAt, location, memo } = item

  const emoji = JUDGMENT_EMOJI[judgment]
  const label = JUDGMENT_LABEL[judgment]
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-base">
          <span>{emoji}</span>
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <time className="text-xs text-gray-400" dateTime={scannedAt}>
            {formattedDate}
          </time>
          {isOwner && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(item)}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              {t('editButton')}
            </button>
          )}
          {isOwner && onDelete && (
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
        <p className="text-xs text-gray-600 italic">
          {t('memoLabel')}: {memo}
        </p>
      )}

      {detected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {detected.map((allergen) => (
            <li
              key={allergen}
              className="text-sm md:text-sm lg:text-base font-medium bg-red-50 text-red-700 rounded-full px-3 py-1"
            >
              {allergen}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
