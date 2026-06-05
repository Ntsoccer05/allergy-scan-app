'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingOverlay } from '@/components/atoms/LoadingOverlay'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const t = useTranslations('auth')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsPending(true)
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (signUpError) {
        setError(signUpError.message)
        return
      }
      setDone(true)
    } finally {
      setIsPending(false)
    }
  }

  if (done) {
    return (
      <div className="text-center space-y-4">
        <p className="text-2xl">📧</p>
        <h2 className="font-bold">{t('signup.confirmEmailTitle')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('signup.confirmEmailBody', { email })}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <LoadingOverlay isOpen={isPending} message={t('loading.signingUp')} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t('label.email')}</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
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
            minLength={8}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={isPending}>
          {t('button.signUp')}
        </Button>
      </form>
      <p className="text-center text-sm">
        {t('text.haveAccount')}{' '}
        <Link href="/login" className="text-primary hover:underline">
          {t('link.signIn')}
        </Link>
      </p>
    </div>
  )
}
