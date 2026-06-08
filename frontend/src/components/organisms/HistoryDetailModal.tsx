'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { HistoryItem } from '@/app/history/history.types'

const JUDGMENT_EMOJI: Record<'ng' | 'partial' | 'ok', string> = {
  ng: '🔴',
  partial: '🟡',
  ok: '✅',
}

const LABEL_SECTION_KEYWORDS = [
  '原材料名', 'アレルギー物質', '栄養成分', '保存方法',
  '賞味期限', '製造者', '販売者', '内容量', '名称', '原産国',
]
const formatRawText = (text: string): string => {
  let result = text
  for (const kw of LABEL_SECTION_KEYWORDS) {
    result = result.replace(new RegExp(`([^\n])(${kw})`, 'g'), '$1\n$2')
  }
  return result
}

type HistoryDetailModalProps = {
  item: HistoryItem
  isOwner: boolean
  onClose: () => void
  onEdit: (item: HistoryItem) => void
  onDelete: (id: string) => Promise<void>
}

export const HistoryDetailModal = ({
  item,
  isOwner,
  onClose,
  onEdit,
  onDelete,
}: HistoryDetailModalProps) => {
  const t = useTranslations('history')
  const [rawTextOpen, setRawTextOpen] = useState(false)
  const { judgment, productName, detected, scannedAt, location, memo, thumbnailUrl, isPublic, rawText } =
    item

  const emoji = JUDGMENT_EMOJI[judgment]
  const formattedDate = new Date(scannedAt).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const handleDeleteClick = async () => {
    const confirmed = window.confirm(t('deleteConfirm'))
    if (!confirmed) return
    await onDelete(item.id)
    onClose()
  }

  const handleEditClick = () => {
    onEdit(item)
    onClose()
  }

  return (
    // onClick={onClose} を外容器に置かない — スクロール中の誤クローズを防止
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* オーバーレイ: タップのみで閉じる（onClick は backdrop div に限定） */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* ボトムシート */}
      <div
        className="relative bg-white rounded-t-2xl shadow-xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー：右上に ✕ ボタン */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{emoji}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                isPublic ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {isPublic ? t('public_badge') : t('private_badge')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label={t('detail.close')}
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* サムネイル + 商品名 */}
          <div className="flex items-start gap-3">
            {thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailUrl}
                alt={productName ?? ''}
                className="h-20 w-20 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="h-20 w-20 rounded-lg bg-gray-100 shrink-0" />
            )}
            <div className="flex-1 min-w-0 space-y-1">
              <p className="font-semibold text-gray-900 break-words">
                {productName ?? t('unnamed')}
              </p>
              {location?.store_name && (
                <p className="text-sm text-gray-500">
                  {t('storeName', { store: location.store_name })}
                </p>
              )}
              <time className="text-xs text-gray-400" dateTime={scannedAt}>
                {formattedDate}
              </time>
            </div>
          </div>

          {/* 検出アレルゲン */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">{t('detail.detected')}</p>
            {detected.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {detected.map((allergen) => (
                  <li
                    key={allergen}
                    className="text-sm bg-red-50 text-red-700 rounded-full px-3 py-1"
                  >
                    {allergen}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">{t('detail.noDetected')}</p>
            )}
          </div>

          {/* 原材料テキスト（raw_text） */}
          {rawText && (
            <div>
              <button
                type="button"
                onClick={() => setRawTextOpen((prev) => !prev)}
                className="text-sm text-blue-600 underline text-left"
                aria-expanded={rawTextOpen}
              >
                {rawTextOpen ? t('detail.rawTextCollapse') : t('detail.rawTextExpand')}
              </button>
              {rawTextOpen && (
                <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-2 whitespace-pre-wrap">
                  {formatRawText(rawText)}
                </p>
              )}
            </div>
          )}

          {/* メモ */}
          {memo && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">{t('detail.memo')}</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{memo}</p>
            </div>
          )}
        </div>

        {/* アクションボタン（オーナーのみ） */}
        {isOwner && (
          <div className="flex gap-3 px-4 pb-8 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={handleEditClick}
              className="flex-1 py-3 rounded-xl border border-gray-300 text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              aria-label={t('detail.editAriaLabel')}
            >
              {t('detail.edit')}
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteClick()}
              className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
              aria-label={t('detail.deleteAriaLabel')}
            >
              {t('detail.delete')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
