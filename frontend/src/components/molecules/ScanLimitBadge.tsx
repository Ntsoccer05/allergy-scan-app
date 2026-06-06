'use client'

type Props = {
  used: number
  limit: number
}

const NEAR_LIMIT_RATIO = 0.8

export const ScanLimitBadge = ({ used, limit }: Props) => {
  const isNearLimit = used >= limit * NEAR_LIMIT_RATIO
  const isAtLimit = used >= limit

  const colorClass = isAtLimit
    ? 'bg-red-600 text-white'
    : isNearLimit
      ? 'bg-yellow-500 text-white'
      : 'bg-black/50 text-white'

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold backdrop-blur-sm ${colorClass}`}
    >
      {used} / {limit}
    </span>
  )
}
