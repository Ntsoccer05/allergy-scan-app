import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

export default async function ForbiddenPage() {
  const t = await getTranslations('common')

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-7xl font-bold text-muted-foreground">{t('errors.forbidden.code')}</p>
      <h1 className="text-xl font-bold">{t('errors.forbidden.title')}</h1>
      <p className="text-sm text-muted-foreground">{t('errors.forbidden.description')}</p>
      <Link
        href="/scan"
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {t('errors.forbidden.backToScan')}
      </Link>
    </div>
  )
}
