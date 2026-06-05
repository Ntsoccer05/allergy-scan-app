'use client'

import { useEffect, useState } from 'react'
import { getUser } from '@/lib/api/users.api'
import { DEFAULT_DAILY_SCAN_LIMIT } from '@/app/scan/scan.constants'

type ScanUsage = { used: number; limit: number } | null

export const useScanUsage = (userId: string | undefined): ScanUsage => {
  const [scanUsage, setScanUsage] = useState<ScanUsage>(null)

  useEffect(() => {
    if (!userId) return
    getUser().then((u) => {
      const limit = u.subscription?.daily_scan_limit ?? DEFAULT_DAILY_SCAN_LIMIT
      // daily_scan_used は未実装のため used=0 を仮置き（TODO: userDailyScans API 追加後に差し替え）
      setScanUsage({ used: 0, limit })
    }).catch(() => {
      // 取得失敗時はバッジを非表示にする（スキャン自体は継続可能）
    })
  }, [userId])

  return scanUsage
}
