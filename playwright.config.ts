import { defineConfig } from '@playwright/test'

// Playwright _electron e2e baseline for apps/desktop.
// Electron launches per-test via `_electron.launch()` in apps/desktop/e2e/**,
// so no webServer/browser bootstrapping is configured here.
export default defineConfig({
  testDir: 'apps/desktop/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
})
