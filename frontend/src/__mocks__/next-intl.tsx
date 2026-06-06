/**
 * next-intl の Jest モック。
 * テスト環境で useTranslations が実際のロケールファイルからテキストを返すようにする。
 * NextIntlClientProvider は messages を Context 経由で共有するラッパーとして機能する。
 */
import React, { createContext, useContext } from 'react'

type Messages = Record<string, unknown>

const IntlContext = createContext<Messages>({})

type NextIntlClientProviderProps = {
  locale?: string
  messages?: Messages
  children: React.ReactNode
}

export const NextIntlClientProvider = ({
  messages = {},
  children,
}: NextIntlClientProviderProps) => (
  <IntlContext.Provider value={messages}>{children}</IntlContext.Provider>
)

/** ネストされたキーを `.` で辿る */
const resolvePath = (obj: Messages, path: string): string => {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || typeof current !== 'object') return path
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === 'string' ? current : path
}

export const useTranslations = (namespace?: string) => {
  const messages = useContext(IntlContext)
  const base: unknown = namespace ? messages[namespace] : messages
  const resolvedBase: Messages =
    base !== null && typeof base === 'object' ? (base as Messages) : {}

  const t = (key: string, params?: Record<string, unknown>): string => {
    const template = resolvePath(resolvedBase, key)
    if (!params) return template
    // ICU Message Format の単純な変数補間（{varName} を値で置換）
    return template.replace(/\{(\w+)\}/g, (_, k: string) =>
      k in params ? String(params[k]) : `{${k}}`,
    )
  }
  return t
}
