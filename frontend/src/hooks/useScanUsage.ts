'use client'

import { useEffect, useState } from 'react'
import { getScanUsage } from '@/lib/api/scan.api'

type ScanUsage = { used: number; limit: number } | null

export const useScanUsage = (userId: string | undefined): ScanUsage => {
  const [scanUsage, setScanUsage] = useState<ScanUsage>(null)

  useEffect(() => {
    if (!userId) return
    getScanUsage().then(({ used, limit }) => {
      setScanUsage({ used, limit })
    }).catch(() => {
      // 取得失敗時はバッジを非表示にする（スキャン自体は継続可能）
    })
  }, [userId])

  return scanUsage
}
