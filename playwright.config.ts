import { defineConfig, devices } from '@playwright/test'

// 两种宽度：桌面 1440、手机 390（PLAN 第 7 节第 5 条）。e2e 前须先 npm run build。
// 并行工作的多个工作区各用各的端口：E2E_PORT=5190 npm run e2e
const port = Number(process.env.E2E_PORT ?? 5183)

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 2,
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile-390',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
})
