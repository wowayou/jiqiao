import { defineConfig, devices } from '@playwright/test'

// 两种宽度：桌面 1440、手机 390（PLAN 第 7 节第 5 条）。e2e 前须先 npm run build。
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 2,
  webServer: {
    command: 'npm run preview -- --port 5183 --strictPort',
    url: 'http://localhost:5183',
    reuseExistingServer: false,
  },
  use: { baseURL: 'http://localhost:5183' },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile-390',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
})
