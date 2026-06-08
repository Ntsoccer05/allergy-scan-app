'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const t = useTranslations('auth')
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsPending(true)
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    })
    setDone(true)
    setIsPending(false)
  }

  if (done) {
    return (
      <div className="text-center space-y-4">
        <p className="text-2xl">📧</p>
        <h2 className="font-bold">{t('resetPassword.sentTitle')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('resetPassword.sentBody', { email })}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('resetPassword.description')}</p>
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
      <Button type="submit" className="w-full" disabled={isPending}>
        {t('button.sendResetLink')}
      </Button>
    </form>
  )
}
