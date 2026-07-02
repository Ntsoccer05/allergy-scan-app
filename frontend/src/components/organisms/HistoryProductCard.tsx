'use client'

import { useTranslations, useLocale } from 'next-intl'

type Scan = {
  id: string
  storeName: string | null
  scannedAt: string
}

export type HistoryProductCardProps = {
  productName: string | null
  judgment: 'ng' | 'partial' | 'ok'
  allergens: { contains: string[]; partial: string[] }
  detected: string[]
  thumbnailUrl: string | null
  lightboxSrc: string | null
  scans: Scan[]
  onDetailClick: (scanId: string) => void
  onLightboxOpen: (url: string) => void
  onEdit?: () => void
  onDelete?: (scanId: string) => void
  isSelectMode?: boolean
  isSelected?: boolean
  onSelect?: () => void
  itemUrl?: string | null
  isExpired?: boolean
}

export const HistoryProductCard = ({
  productName,
  judgment,
  allergens,
  detected,
  thumbnailUrl,
  lightboxSrc,
  scans,
  onDetailClick,
  onLightboxOpen,
  onEdit,
  onDelete,
  isSelectMode,
  isSelected,
  onSelect,
  itemUrl,
  isExpired,
}: HistoryProductCardProps) => {
  const t = useTranslations('history')
  const locale = useLocale()
  const firstScan = scans[0]
  if (!firstScan) return null

  const emoji = judgment === 'ng' ? '🔴' : judgment === 'partial' ? '🟡' : '✅'
  const ngItems = detected.filter((a) => allergens.contains.includes(a))
  const partialItems = detected.filter((a) => allergens.partial.includes(a))
  const otherItems = detected.filter(
    (a) => !allergens.contains.includes(a) && !allergens.partial.includes(a),
  )
  const allergenLabel =
    detected.length > 0
      ? [
          ngItems.length > 0 ? `🔴 ${ngItems.join(' · ')}` : null,
          partialItems.length > 0 ? `🟡 ${partialItems.join(' · ')}` : null,
          otherItems.length > 0 ? `${emoji} ${otherItems.join(' · ')}` : null,
        ]
          .filter(Boolean)
          .join('  ')
      : null

  return (
    <li
      className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-colors ${
        isSelectMode && isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-100'
      }`}
    >
      {/* 選択モードのチェックボックス */}
      {isSelectMode && (
        <div
          role="button"
          tabIndex={0}
          className="flex items-center gap-3 px-3 pt-3 cursor-pointer"
          onClick={() => onSelect?.()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect?.() }}
        >
          <input
            type="checkbox"
            readOnly
            checked={isSelected ?? false}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 pointer-events-none"
          />
          <span className="text-sm text-gray-600">{productName ?? t('unnamed')}</span>
        </div>
      )}

      {/* 商品ヘッダー（通常モードのみ） */}
      {!isSelectMode && (
        <>
          {isExpired && (
            <p className="text-xs text-amber-600 px-3 pt-2">{t('expiredTag')}</p>
          )}
          <div
            className="flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => onDetailClick(firstScan.id)}
          >
            {thumbnailUrl ? (
              <button
                type="button"
                aria-label={t('detail.thumbnailAriaLabel')}
                className="shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  if (lightboxSrc) onLightboxOpen(lightboxSrc)
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl}
                  alt=""
                  className="h-14 w-14 rounded-lg object-cover cursor-pointer"
                />
              </button>
            ) : (
              <div className="h-14 w-14 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-2xl">
                🍱
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-900 truncate">
                {productName ?? t('unnamed')}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                {allergenLabel ?? `${emoji} ${t('filter.ok')}`}
              </p>
            </div>

            {/* 編集・削除ボタン（mine のみ） */}
            {(onEdit || onDelete) && (
              <div className="flex items-center gap-0.5 shrink-0">
                {onEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit()
                    }}
                    aria-label={t('detail.editAriaLabel')}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    ✏️
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(firstScan.id)
                    }}
                    aria-label={t('detail.deleteAriaLabel')}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    🗑️
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 店舗リスト */}
          <div className="border-t border-gray-50">
            {scans.map((scan) => (
              <button
                key={scan.id}
                type="button"
                onClick={() => onDetailClick(scan.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-left"
              >
                <span className="text-gray-400">📍</span>
                <span className="flex-1 truncate">
                  {scan.storeName ?? t('location.unknown')}
                </span>
                <time className="text-gray-400 shrink-0">
                  {new Date(scan.scannedAt).toLocaleDateString(locale, {
                    month: 'numeric',
                    day: 'numeric',
                  })}
                </time>
              </button>
            ))}
          </div>

          {/* 楽天リンク（mine のみ） */}
          {itemUrl && (
            <div className="px-3 py-2 bg-gray-50">
              <a
                href={itemUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-red-600 font-medium hover:underline"
              >
                {t('group.rakutenLink')}
              </a>
            </div>
          )}
        </>
      )}
    </li>
  )
}
