'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingOverlay } from '@/components/atoms/LoadingOverlay'
import { createClient } from '@/lib/supabase/client'
import { initUser } from '@/lib/api/users.api'

export default function LoginPage() {
  const t = useTranslations('auth')
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/scan'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsPending(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(t('error.invalidCredentials'))
        return
      }
      await initUser()
      router.push(redirect)
    } catch {
      setError(t('error.unknown'))
    } finally {
      setIsPending(false)
    }
  }

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?redirect=${redirect}` },
    })
  }

  return (
    <div className="space-y-6">
      <LoadingOverlay isOpen={isPending} message={t('loading.signingIn')} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t('label.email')}</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t('label.password')}</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={isPending}>
          {t('button.signIn')}
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">{t('label.or')}</span>
        </div>
      </div>

      <Button variant="outline" className="w-full" onClick={handleGoogleLogin}>
        {t('button.signInWithGoogle')}
      </Button>

      <div className="text-center text-sm space-y-1">
        <p>
          <Link href="/reset-password" className="text-primary hover:underline">
            {t('link.forgotPassword')}
          </Link>
        </p>
        <p>
          {t('text.noAccount')}{' '}
          <Link href="/signup" className="text-primary hover:underline">
            {t('link.signUp')}
          </Link>
        </p>
      </div>
    </div>
  )
}
