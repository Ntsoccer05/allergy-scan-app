'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { AuthLayout } from '@/components/templates/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingOverlay } from '@/components/atoms/LoadingOverlay'

function UpdatePasswordContent() {
  const t = useTranslations('auth')
  const router = useRouter()
  const searchParams = useSearchParams()

  const [isExchanging, setIsExchanging] = useState(true)
  const [exchangeError, setExchangeError] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) {
      setExchangeError(true)
      setIsExchanging(false)
      return
    }
    supabase.auth.exchangeCodeForSession(code)
      .then(({ error: err }) => {
        if (err) setExchangeError(true)
      })
      .catch(() => setExchangeError(true))
      .finally(() => setIsExchanging(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError(t('updatePassword.error.mismatch'))
      return
    }
    setError(null)
    setIsPending(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }
      setDone(true)
      setTimeout(() => router.push('/scan'), 2000)
    } finally {
      setIsPending(false)
    }
  }

  if (isExchanging) {
    return (
      <AuthLayout>
        <LoadingOverlay isOpen message={t('updatePassword.verifying')} />
      </AuthLayout>
    )
  }

  if (exchangeError) {
    return (
      <AuthLayout>
        <div className="text-center space-y-4">
          <p className="text-4xl">⚠️</p>
          <h2 className="font-bold">{t('updatePassword.error.invalidLink')}</h2>
          <p className="text-sm text-muted-foreground">{t('updatePassword.error.linkExpired')}</p>
          <Button className="w-full" onClick={() => router.push('/reset-password')}>
            {t('updatePassword.retryLink')}
          </Button>
        </div>
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="text-center space-y-4">
          <p className="text-4xl">✅</p>
          <h2 className="font-bold">{t('updatePassword.successTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('updatePassword.successBody')}</p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <LoadingOverlay isOpen={isPending} message={t('updatePassword.updating')} />
      <div className="space-y-6">
        <h2 className="text-center font-bold">{t('updatePassword.title')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">{t('updatePassword.label.newPassword')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t('updatePassword.label.confirmPassword')}</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={isPending}>
            {t('updatePassword.button.submit')}
          </Button>
        </form>
      </div>
    </AuthLayout>
  )
}

export default function UpdatePasswordPage() {
  const t = useTranslations('auth')
  return (
    <Suspense
      fallback={
        <AuthLayout>
          <LoadingOverlay isOpen message={t('updatePassword.verifying')} />
        </AuthLayout>
      }
    >
      <UpdatePasswordContent />
    </Suspense>
  )
}
