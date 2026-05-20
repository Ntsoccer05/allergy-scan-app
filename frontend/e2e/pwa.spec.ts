import { test, expect } from '@playwright/test'

const USERS_INIT_URL = '**/users/init'
const USERS_ME_URL = '**/users/me'

const MOCK_USER = {
  id: 'test-user',
  allergies: {},
  locale: 'ja',
  onboarding_done: true,
}

async function setupPage(page: import('@playwright/test').Page) {
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
      body: JSON.stringify(MOCK_USER),
    }),
  )
}

test.describe('PWA インストール条件確認', () => {
  test('GET /manifest.json が HTTP 200 を返す', async ({ page }) => {
    const response = await page.request.get('/manifest.json')
    expect(response.status()).toBe(200)
  })

  test('manifest.json レスポンスに theme_color キーが存在する', async ({ page }) => {
    const response = await page.request.get('/manifest.json')
    expect(response.status()).toBe(200)

    const body = await response.json() as Record<string, unknown>
    expect(body).toHaveProperty('theme_color')
    expect(typeof body['theme_color']).toBe('string')
  })

  test('スキャン画面の <head> に meta[name="theme-color"] が存在する', async ({ page }) => {
    await setupPage(page)
    await page.goto('/scan')

    /**
     * Next.js の Viewport export が <meta name="theme-color"> を
     * <head> 内に挿入する（layout.tsx の viewport 設定を参照）。
     */
    const metaThemeColor = page.locator('meta[name="theme-color"]')
    await expect(metaThemeColor).toBeAttached({ timeout: 10_000 })
  })
})
