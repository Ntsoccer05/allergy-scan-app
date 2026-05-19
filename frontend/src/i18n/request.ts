import { getRequestConfig } from 'next-intl/server'

const SUPPORTED_LOCALES = ['ja', 'en'] as const
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

const DEFAULT_LOCALE: SupportedLocale = 'ja'

const isSupportedLocale = (locale: string): locale is SupportedLocale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(locale)

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale =
    requested !== undefined && isSupportedLocale(requested)
      ? requested
      : DEFAULT_LOCALE

  const [
    scanMessages,
    commonMessages,
    settingsMessages,
    onboardingMessages,
    historyMessages,
  ] = await Promise.all([
    import(`../../public/locales/${locale}/scan.json`).then((m) => m.default),
    import(`../../public/locales/${locale}/common.json`).then((m) => m.default),
    import(`../../public/locales/${locale}/settings.json`).then((m) => m.default),
    import(`../../public/locales/${locale}/onboarding.json`).then(
      (m) => m.default,
    ),
    import(`../../public/locales/${locale}/history.json`).then((m) => m.default),
  ])

  return {
    locale,
    messages: {
      ...scanMessages,
      common: commonMessages,
      settings: settingsMessages,
      onboarding: onboardingMessages,
      history: historyMessages,
    },
  }
})
