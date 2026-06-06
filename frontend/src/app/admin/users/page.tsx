'use client'

import { useState } from 'react'
import { useLocale } from 'next-intl'
import { useInfiniteQuery } from '@tanstack/react-query'
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner'
import { getAdminUsers, updateUserPlan } from '@/lib/api/admin.api'

export default function AdminUsersPage() {
  const locale = useLocale()
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['admin-users'],
    queryFn: ({ pageParam }) => getAdminUsers(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.next_cursor ?? undefined,
  })

  const users = data?.pages.flatMap(p => p.items) ?? []

  const handlePlanChange = async (userId: string, currentPlan: string) => {
    const newPlan = currentPlan === 'free' ? 'premium' : 'free'
    setUpdatingId(userId)
    try {
      await updateUserPlan(userId, newPlan)
    } finally {
      setUpdatingId(null)
    }
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold">ユーザー管理</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4">ID</th>
              <th className="pb-2 pr-4">作成日</th>
              <th className="pb-2 pr-4">プラン</th>
              <th className="pb-2">操作</th>
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
                    {user.plan_name === 'free' ? 'Premium に変更' : 'Free に変更'}
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
            {isFetchingNextPage ? '読み込み中...' : 'さらに表示'}
          </button>
        </div>
      )}
    </div>
  )
}
