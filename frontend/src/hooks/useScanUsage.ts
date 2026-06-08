'use client'

import { useCallback, useEffect, useState } from 'react'
import { getScanUsage } from '@/lib/api/scan.api'

type ScanUsage = { used: number; limit: number } | null

type UseScanUsageReturn = {
  scanUsage: ScanUsage
  refreshScanUsage: () => void
}

export const useScanUsage = (userId: string | undefined): UseScanUsageReturn => {
  const [scanUsage, setScanUsage] = useState<ScanUsage>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!userId) return
    getScanUsage().then(({ used, limit }) => {
      setScanUsage({ used, limit })
    }).catch(() => {
      // 取得失敗時はバッジを非表示にする（スキャン自体は継続可能）
    })
  }, [userId, tick])

  const refreshScanUsage = useCallback(() => setTick((n) => n + 1), [])

  return { scanUsage, refreshScanUsage }
}
