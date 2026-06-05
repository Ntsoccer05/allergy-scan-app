'use client'

type Props = {
  used: number
  limit: number
}

const NEAR_LIMIT_RATIO = 0.8

export const ScanLimitBadge = ({ used, limit }: Props) => {
  const isNearLimit = used >= limit * NEAR_LIMIT_RATIO
  const isAtLimit = used >= limit
  return (
    <span
      className={`text-xs font-medium ${isAtLimit ? 'text-destructive' : isNearLimit ? 'text-yellow-600' : 'text-muted-foreground'}`}
    >
      {used}/{limit}
    </span>
  )
}
