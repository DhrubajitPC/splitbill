import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const BASE = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    baseURL: BASE,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT}`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
