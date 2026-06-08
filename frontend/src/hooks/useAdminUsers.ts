'use client'

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { getAdminUsers, updateUserPlan } from '@/lib/api/admin.api'

export const useAdminUsers = () => {
  const queryClient = useQueryClient()

  const query = useInfiniteQuery({
    queryKey: ['admin-users'],
    queryFn: ({ pageParam }) => getAdminUsers(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.next_cursor ?? undefined,
  })

  const changePlan = async (userId: string, currentPlan: string) => {
    const newPlan = currentPlan === 'premium' ? 'free' : 'premium'
    await updateUserPlan(userId, newPlan)
    await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
  }

  return { ...query, changePlan }
}
