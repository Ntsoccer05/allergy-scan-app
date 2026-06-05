'use client'

type Props = {
  used: number
  limit: number
}

export const ScanLimitBadge = ({ used, limit }: Props) => {
  const isNearLimit = used >= limit * 0.8
  const isAtLimit = used >= limit
  return (
    <span
      className={`text-xs font-medium ${isAtLimit ? 'text-destructive' : isNearLimit ? 'text-yellow-600' : 'text-muted-foreground'}`}
    >
      {used}/{limit}
    </span>
  )
}
