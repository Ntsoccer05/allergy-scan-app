import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E テスト設定。
 * CI 環境では `pnpm exec playwright install --with-deps chromium` を先行実行すること。
 *
 * 実行コマンド: pnpm --filter frontend test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3000',
    /** カメラ・マイク・位置情報権限を付与（実デバイス不要のモック前提） */
    permissions: ['camera', 'microphone', 'geolocation'],
    /** モバイルビュー (iPhone 14 相当) */
    viewport: { width: 390, height: 844 },
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /** Desktop Chrome のデフォルト viewport (1280x720) をモバイルビューで上書き */
        viewport: { width: 390, height: 844 },
      },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
