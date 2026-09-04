import { defineConfig, devices } from '@playwright/test'

/**
 * E2E (§36) contra la web en http://localhost:3000.
 *
 * - Por defecto asume que `pnpm dev` ya está corriendo (web + api + worker con
 *   adapters fake y AUTH_DEV_BYPASS=true).
 * - Con E2E_START_SERVER=true Playwright levanta `pnpm dev` por sí mismo.
 * - Los escenarios marcados con `test.fixme()` se activan cuando la UI final
 *   esté disponible; el smoke de login corre siempre.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const startServer = process.env.E2E_START_SERVER === 'true'

export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: './playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  use: {
    baseURL,
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(startServer
    ? {
        webServer: {
          command: 'pnpm dev',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          cwd: '../..',
        },
      }
    : {}),
})
