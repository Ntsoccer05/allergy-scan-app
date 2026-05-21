import { test, expect } from '@playwright/test'

const USERS_INIT_URL = '**/users/init'
const USERS_ME_URL = '**/users/me'
const ALLERGENS_URL = '**/allergens'

const MOCK_USER_WITH_EGG = {
  id: 'test-user',
  allergies: { '卵': { enabled: true, partialAlert: true } },
  locale: 'ja',
  onboarding_done: true,
}

const MOCK_ALLERGENS = [
  {
    category: 'mandatory',
    label: '特定原材料',
    items: [
      {
        name: '卵',
        display_name: '卵（鶏卵）',
        emoji: '🥚',
        display_order: 1,
        judgment_type: 'allergy',
      },
    ],
  },
]

async function setupPage(
  page: import('@playwright/test').Page,
  user = MOCK_USER_WITH_EGG,
) {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding_done', 'true')
  })
  await page.route(USERS_INIT_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ created: false, onboarding_done: true }),
    }),
  )
  await page.route(USERS_ME_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    }),
  )
  await page.route(ALLERGENS_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ALLERGENS),
    }),
  )
}

test.describe('設定画面フロー', () => {
  test('設定画面 (/settings) が表示される', async ({ page }) => {
    await setupPage(page)
    await page.goto('/settings')

    /** settings.json: title = "設定" */
    await expect(page.locator('h1', { hasText: '設定' })).toBeVisible({ timeout: 10_000 })
  })

  test('アレルギートグルのクリックで PUT /api/users/me が呼ばれる', async ({ page }) => {
    await setupPage(page)

    let putCalled = false
    await page.route(USERS_ME_URL, (route) => {
      if (route.request().method() === 'PUT') {
        putCalled = true
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...MOCK_USER_WITH_EGG,
            allergies: { '卵': { enabled: false, partialAlert: false } },
          }),
        })
      } else {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_USER_WITH_EGG),
        })
      }
    })

    await page.goto('/settings')

    /** 設定画面のローディング完了を待機 */
    await expect(page.locator('h1', { hasText: '設定' })).toBeVisible({ timeout: 10_000 })

    /**
     * 「卵（鶏卵）」トグルボタン（aria-label）をクリックする。
     * settings/page.tsx の AllergenToggleRow は `aria-label={item.display_name}` を持つ。
     */
    const eggToggle = page.locator('button[role="switch"][aria-label="卵（鶏卵）"]')
    await expect(eggToggle).toBeVisible({ timeout: 10_000 })
    await eggToggle.click()

    /** debounce 300ms + 保存処理の完了を待機 */
    await page.waitForTimeout(500)

    expect(putCalled).toBe(true)
  })

  test('enabled: true の品目が 1 件以上あるとき予約用テキストセクションが表示される', async ({
    page,
  }) => {
    await setupPage(page)
    await page.goto('/settings')

    /** 設定画面のローディング完了を待機 */
    await expect(page.locator('h1', { hasText: '設定' })).toBeVisible({ timeout: 10_000 })

    /**
     * MOCK_USER_WITH_EGG.allergies['卵'].enabled = true なので
     * ReservationTextSection が表示されるはず。
     * settings.json: reservationText.title = "お店予約用テキスト"
     */
    const reservationTitle = page.locator('h2', { hasText: 'お店予約用テキスト' })
    await expect(reservationTitle).toBeVisible({ timeout: 10_000 })
  })

  test('コピーボタンが DOM に存在する', async ({ page }) => {
    await setupPage(page)
    await page.goto('/settings')

    /** 設定画面のローディング完了を待機 */
    await expect(page.locator('h1', { hasText: '設定' })).toBeVisible({ timeout: 10_000 })

    /**
     * MOCK_USER_WITH_EGG.allergies['卵'].enabled = true のため
     * ReservationTextSection（コピーボタンを含む）が表示される。
     * settings.json: reservationText.copyButton = "コピーする"
     */
    const copyButton = page.locator('button', { hasText: 'コピーする' })
    await expect(copyButton).toBeVisible({ timeout: 10_000 })
  })
})
