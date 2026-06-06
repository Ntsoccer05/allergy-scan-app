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

      <Button variant="outline" className="w-full gap-2" onClick={handleGoogleLogin}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
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
