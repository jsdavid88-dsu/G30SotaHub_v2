import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for glocal30Hub E2E tests.
 * Auto-starts backend (uvicorn) + frontend (vite dev) before running specs.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // tests share DB state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // serialize so DB writes don't collide
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: 'http://127.0.0.1:3030',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'cd ../backend && uvicorn app.main:app --host 127.0.0.1 --port 8000',
      url: 'http://127.0.0.1:8011/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 3000',
      url: 'http://127.0.0.1:3030',
      reuseExistingServer: true,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
})
