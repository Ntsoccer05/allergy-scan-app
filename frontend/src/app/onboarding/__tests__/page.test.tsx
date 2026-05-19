import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import OnboardingPage from '../page'
import { useOnboarding, ONBOARDING_DONE_KEY } from '@/hooks/useOnboarding'
import type { AllergenGroup, AllergySettings } from '@/app/settings/settings.types'

jest.mock('@/hooks/useOnboarding')
const mockUseOnboarding = useOnboarding as jest.MockedFunction<typeof useOnboarding>

const mockRouterReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}))

jest.mock('next/link', () => {
  const MockLink = ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
  MockLink.displayName = 'MockLink'
  return MockLink
})

const onboardingJa = {
  step1: {
    title: 'アレルギースキャンへようこそ',
    description: '説明テキスト',
    start: 'はじめる',
    restore: '引き継ぎコードをお持ちの方',
  },
  step2: {
    title: 'アレルゲンを選択してください',
    description: '説明',
    next: '次へ',
    showMore: 'もっと見る',
    showLess: '閉じる',
    category: {
      mandatory: '特定原材料',
      recommended: '準ずるもの',
    },
  },
  step3: {
    title: '「一部含む」警告について',
    description: '説明',
    next: '次へ',
    partialAlertLabel: '一部含む警告',
    partialAlertDescription: '「一部に〜を含む」表示でも警告する',
  },
  step4: {
    title: 'ご利用前にご確認ください',
    disclaimer: '免責文',
    important1: '重要事項1',
    important2: '重要事項2',
    important3: '重要事項3',
    agree: '同意してはじめる',
  },
  back: '← 戻る',
  loading: '読み込み中...',
  error: {
    initFailed: '初期化に失敗しました',
    saveFailed: '設定の保存に失敗しました',
  },
}

const makeAllergenGroups = (): AllergenGroup[] => [
  {
    category: 'mandatory',
    label: '特定原材料',
    items: [
      {
        name: '乳',
        display_name: '乳',
        emoji: '🥛',
        display_order: 8,
        judgment_type: 'allergy',
      },
    ],
  },
]

const makeDefaultHook = (overrides?: Partial<ReturnType<typeof useOnboarding>>) => ({
  step: 1,
  allergenGroups: makeAllergenGroups(),
  selectedAllergies: {} as AllergySettings,
  isLoading: false,
  error: null,
  canProceedStep2: false,
  goNext: jest.fn(),
  goBack: jest.fn(),
  handleToggleAllergen: jest.fn(),
  handleToggleCaution: jest.fn(),
  handleTogglePartial: jest.fn(),
  completeOnboarding: jest.fn().mockResolvedValue(undefined),
  ...overrides,
})

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: jest.fn<string | null, [string]>((key) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value
    }),
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

const renderWithI18n = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={{ onboarding: onboardingJa }}>
      {ui}
    </NextIntlClientProvider>,
  )

beforeEach(() => {
  jest.clearAllMocks()
  localStorageMock.clear()
  localStorageMock.getItem.mockImplementation((_key: string) => null)
  mockUseOnboarding.mockReturnValue(makeDefaultHook())
})

describe('OnboardingPage', () => {
  describe('ルートガード', () => {
    it('onboarding_done === "true" の場合 /scan へ router.replace される', async () => {
      localStorageMock.getItem.mockImplementation((key) =>
        key === ONBOARDING_DONE_KEY ? 'true' : null,
      )

      renderWithI18n(<OnboardingPage />)

      await waitFor(() => {
        expect(mockRouterReplace).toHaveBeenCalledWith('/scan')
      })
    })

    it('onboarding_done が未セットの場合はリダイレクトしない', async () => {
      renderWithI18n(<OnboardingPage />)

      await waitFor(() => {
        expect(screen.getByText('はじめる')).toBeInTheDocument()
      })

      expect(mockRouterReplace).not.toHaveBeenCalled()
    })
  })

  describe('画面1: ようこそ', () => {
    it('[はじめる]ボタンが表示される', () => {
      renderWithI18n(<OnboardingPage />)
      expect(screen.getByRole('button', { name: 'はじめる' })).toBeInTheDocument()
    })

    it('「引き継ぎコードをお持ちの方」リンクが表示される', () => {
      renderWithI18n(<OnboardingPage />)
      expect(screen.getByRole('link', { name: '引き継ぎコードをお持ちの方' })).toBeInTheDocument()
    })

    it('「引き継ぎコードをお持ちの方」リンクが /onboarding/restore を指す', () => {
      renderWithI18n(<OnboardingPage />)
      const link = screen.getByRole('link', { name: '引き継ぎコードをお持ちの方' })
      expect(link).toHaveAttribute('href', '/onboarding/restore')
    })

    it('[はじめる]ボタンを押すと goNext が呼ばれる', () => {
      const goNext = jest.fn()
      mockUseOnboarding.mockReturnValue(makeDefaultHook({ goNext }))

      renderWithI18n(<OnboardingPage />)
      fireEvent.click(screen.getByRole('button', { name: 'はじめる' }))

      expect(goNext).toHaveBeenCalledTimes(1)
    })
  })

  describe('画面2: アレルゲン選択', () => {
    it('0品目選択時は[次へ]が disabled である', () => {
      mockUseOnboarding.mockReturnValue(makeDefaultHook({ step: 2, canProceedStep2: false }))

      renderWithI18n(<OnboardingPage />)
      const nextButton = screen.getByRole('button', { name: '次へ' })
      expect(nextButton).toBeDisabled()
    })

    it('1品目以上選択後は[次へ]が活性化する', () => {
      mockUseOnboarding.mockReturnValue(makeDefaultHook({ step: 2, canProceedStep2: true }))

      renderWithI18n(<OnboardingPage />)
      const nextButton = screen.getByRole('button', { name: '次へ' })
      expect(nextButton).not.toBeDisabled()
    })

    it('アレルゲントグルボタンをクリックすると handleToggleAllergen が呼ばれる', () => {
      const handleToggleAllergen = jest.fn()
      mockUseOnboarding.mockReturnValue(makeDefaultHook({ step: 2, handleToggleAllergen }))

      renderWithI18n(<OnboardingPage />)
      const toggle = screen.getByRole('switch', { name: '乳' })
      fireEvent.click(toggle)

      expect(handleToggleAllergen).toHaveBeenCalledWith('乳')
    })
  })

  describe('画面3: 一部含む警告設定', () => {
    it('enabled な品目のみ表示される', () => {
      mockUseOnboarding.mockReturnValue(
        makeDefaultHook({
          step: 3,
          selectedAllergies: {
            乳: { enabled: true, partialAlert: false },
          },
        }),
      )

      renderWithI18n(<OnboardingPage />)
      // 乳が enabled なので表示される
      expect(screen.getByRole('switch', { name: /乳/ })).toBeInTheDocument()
    })

    it('disabled の品目は表示されない', () => {
      mockUseOnboarding.mockReturnValue(
        makeDefaultHook({
          step: 3,
          selectedAllergies: {
            乳: { enabled: false, partialAlert: false },
          },
        }),
      )

      renderWithI18n(<OnboardingPage />)
      // 乳は enabled: false なので partialAlert スイッチは表示されない
      expect(screen.queryByTestId('partial-乳')).toBeNull()
    })
  })

  describe('画面4: 免責同意', () => {
    it('免責文と[同意してはじめる]ボタンが表示される', () => {
      mockUseOnboarding.mockReturnValue(makeDefaultHook({ step: 4 }))

      renderWithI18n(<OnboardingPage />)
      expect(screen.getByText('免責文')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: '同意してはじめる' }),
      ).toBeInTheDocument()
    })

    it('[同意してはじめる]ボタン押下で completeOnboarding が呼ばれる', async () => {
      const completeOnboarding = jest.fn().mockResolvedValue(undefined)
      mockUseOnboarding.mockReturnValue(makeDefaultHook({ step: 4, completeOnboarding }))

      renderWithI18n(<OnboardingPage />)
      fireEvent.click(screen.getByRole('button', { name: '同意してはじめる' }))

      expect(completeOnboarding).toHaveBeenCalledTimes(1)
    })

    it('戻るボタンを押しても completeOnboarding は呼ばれない', () => {
      const completeOnboarding = jest.fn()
      const goBack = jest.fn()
      mockUseOnboarding.mockReturnValue(makeDefaultHook({ step: 4, completeOnboarding, goBack }))

      renderWithI18n(<OnboardingPage />)
      fireEvent.click(screen.getByRole('button', { name: '← 戻る' }))

      expect(completeOnboarding).not.toHaveBeenCalled()
      expect(goBack).toHaveBeenCalledTimes(1)
    })
  })

  describe('ローディング状態', () => {
    it('isLoading が true のとき読み込み中テキストが表示される', () => {
      mockUseOnboarding.mockReturnValue(makeDefaultHook({ isLoading: true }))

      renderWithI18n(<OnboardingPage />)
      expect(screen.getByText('読み込み中...')).toBeInTheDocument()
    })
  })
})
