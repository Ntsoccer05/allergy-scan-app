'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: Props) {
  const t = useTranslations('common')

  useEffect(() => {
    // エラーを外部モニタリングに送る場合はここに追加
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-4xl">⚠️</p>
      <h1 className="text-xl font-bold">{t('errors.unexpected.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('errors.unexpected.description')}</p>
      <Button onClick={reset}>{t('errors.unexpected.retry')}</Button>
    </div>
  )
}
