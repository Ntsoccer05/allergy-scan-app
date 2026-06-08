import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import fs from 'fs'
import path from 'path'

const SUPPORTED_LOCALES = ['ja', 'en'] as const
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

const DEFAULT_LOCALE: SupportedLocale = 'ja'
const LOCALE_COOKIE = 'NEXT_LOCALE'

const isSupportedLocale = (locale: string): locale is SupportedLocale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(locale)

// import() はturbopackがモジュールキャッシュするためJSONの変更がHMRに反映されない。
// fs.readFileSync はディスクを毎回読むため、dev中のホットリロードが機能する。
const readLocaleFile = (locale: string, namespace: string): Record<string, unknown> => {
  const filePath = path.join(process.cwd(), 'public', 'locales', locale, `${namespace}.json`)
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  // middleware が未設定のため requestLocale は常に undefined。
  // Cookie NEXT_LOCALE をフォールバックとして使う。
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale =
    (requested && isSupportedLocale(requested)) ? requested :
    (cookieLocale && isSupportedLocale(cookieLocale)) ? cookieLocale :
    DEFAULT_LOCALE

  const [
    scanMessages,
    commonMessages,
    settingsMessages,
    onboardingMessages,
    historyMessages,
    authMessages,
  ] = ['scan', 'common', 'settings', 'onboarding', 'history', 'auth'].map((ns) =>
    readLocaleFile(locale, ns),
  )

  return {
    locale,
    messages: {
      scan: scanMessages,
      common: commonMessages,
      settings: settingsMessages,
      onboarding: onboardingMessages,
      history: historyMessages,
      auth: authMessages,
    },
  }
})
