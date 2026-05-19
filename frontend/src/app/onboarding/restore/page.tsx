'use client'

import { useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { restoreFromCode } from '@/lib/api/backup-code'
import type { RestoreFromCodeError } from '@/lib/api/backup-code'
import { ONBOARDING_DONE_KEY } from '@/hooks/useOnboarding'

type TranslateFn = (key: string) => string

/** ALRG-XXXX-XXXX 形式に自動整形する（自動大文字変換・ハイフン自動挿入） */
const formatBackupCode = (raw: string): string => {
  // プレフィックス ALRG と区切りハイフンを除いた英数字のみ取り出す
  const upper = raw.toUpperCase()
  // ハイフン以外の英数字を抽出してプレフィックス ALRG を含む整形をする
  const stripped = upper.replace(/[^A-Z0-9]/g, '')

  // ALRG(4) + BLOCK1(4) + BLOCK2(4) = 12文字
  const prefix = stripped.slice(0, 4)
  const block1 = stripped.slice(4, 8)
  const block2 = stripped.slice(8, 12)

  let result = prefix
  if (block1) result += `-${block1}`
  if (block2) result += `-${block2}`
  return result
}

// ⚠️ 安全設計: backend の BACKUP_CODE_PATTERN と一致させること（O/I 除外）
const isValidCodeFormat = (code: string): boolean =>
  /^ALRG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)

export default function RestorePage() {
  const router = useRouter()
  // テンプレートリテラルキーを型安全に扱うためキャストする
  const t = useTranslations('onboarding') as TranslateFn

  const [code, setCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  const handleCodeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const formatted = formatBackupCode(e.target.value)
    // 最大長: ALRG-XXXX-XXXX = 14文字
    if (formatted.length <= 14) {
      setCode(formatted)
    }
    setErrorKey(null)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!isValidCodeFormat(code)) return

    setIsSubmitting(true)
    setErrorKey(null)

    try {
      await restoreFromCode(code)
      // 引き継ぎ成功: onboarding 完了フラグをセットしてスキャン画面へ遷移
      localStorage.setItem(ONBOARDING_DONE_KEY, 'true')
      router.replace('/scan')
    } catch (err) {
      const restoreErr = err as RestoreFromCodeError
      if (restoreErr?.message === 'code_invalid') {
        setErrorKey('code_invalid')
      } else {
        setErrorKey('unknown')
      }
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex flex-col min-h-screen max-w-[480px] mx-auto bg-gray-50 px-6 pt-10">
      <Link
        href="/onboarding"
        className="text-blue-600 text-sm mb-6 hover:underline focus:outline-none inline-block"
      >
        {t('back')}
      </Link>

      <h1 className="text-xl font-bold text-gray-900 mb-2">{t('restore.title')}</h1>
      <p className="text-sm text-gray-600 mb-8">{t('restore.description')}</p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div>
          <input
            type="text"
            value={code}
            onChange={handleCodeChange}
            placeholder={t('restore.codePlaceholder')}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            aria-label={t('restore.codePlaceholder')}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 text-lg font-mono
              tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-500
              focus:border-blue-500 bg-white placeholder:text-gray-400"
          />
        </div>

        {errorKey && (
          <p role="alert" className="text-sm text-red-600 text-center">
            {t(`restore.error.${errorKey}`)}
          </p>
        )}

        <button
          type="submit"
          disabled={!isValidCodeFormat(code) || isSubmitting}
          className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-semibold text-base
            shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
        >
          {isSubmitting ? t('restore.submitting') : t('restore.submitButton')}
        </button>
      </form>
    </main>
  )
}
