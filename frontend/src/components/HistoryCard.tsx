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
}

export const HistoryCard = ({ item }: HistoryCardProps) => {
  const { judgment, productName, detected, scannedAt } = item

  const emoji = JUDGMENT_EMOJI[judgment]
  const label = JUDGMENT_LABEL[judgment]
  const formattedDate = new Date(scannedAt).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-base">
          <span>{emoji}</span>
          <span>{label}</span>
        </div>
        <time className="text-xs text-gray-400" dateTime={scannedAt}>
          {formattedDate}
        </time>
      </div>

      {productName && (
        <p className="text-sm text-gray-800 truncate">{productName}</p>
      )}

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
