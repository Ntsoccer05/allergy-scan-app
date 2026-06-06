'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner'
import { useAdminUsers } from '@/hooks/useAdminUsers'

export default function AdminUsersPage() {
  const t = useTranslations('admin')
  const locale = useLocale()
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, changePlan } = useAdminUsers()

  const users = data?.pages.flatMap(p => p.items) ?? []

  const handlePlanChange = async (userId: string, currentPlan: string) => {
    setUpdatingId(userId)
    try {
      await changePlan(userId, currentPlan)
    } finally {
      setUpdatingId(null)
    }
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold">{t('users.pageTitle')}</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4">{t('users.table.id')}</th>
              <th className="pb-2 pr-4">{t('users.table.createdAt')}</th>
              <th className="pb-2 pr-4">{t('users.table.plan')}</th>
              <th className="pb-2">{t('users.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className="border-b">
                <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                  {user.id.slice(0, 8)}...
                </td>
                <td className="py-2 pr-4">
                  {new Date(user.created_at).toLocaleDateString(locale)}
                </td>
                <td className="py-2 pr-4">{user.plan_name}</td>
                <td className="py-2">
                  <button
                    type="button"
                    disabled={updatingId === user.id}
                    onClick={() => void handlePlanChange(user.id, user.plan_name)}
                    className="rounded border px-3 py-1 text-xs disabled:opacity-50"
                  >
                    {user.plan_name === 'free'
                      ? t('users.actions.upgradeToPremium')
                      : t('users.actions.downgradeToFree')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasNextPage && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            {isFetchingNextPage ? t('users.loading') : t('users.loadMore')}
          </button>
        </div>
      )}
    </div>
  )
}
