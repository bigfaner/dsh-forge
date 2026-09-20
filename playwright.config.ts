import { defineConfig } from '@playwright/test'

// Playwright _electron e2e baseline for apps/desktop.
// Electron launches per-test via `_electron.launch()` in apps/desktop/e2e/**,
// so no webServer/browser bootstrapping is configured here.
export default defineConfig({
  testDir: 'apps/desktop/e2e',
  // Single-instance lock: parallel workers would launch two shells sharing
  // the default userData dir; the loser quits with ERR_SINGLE_INSTANCE.
  // Electron launches must be strictly sequential.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
})
