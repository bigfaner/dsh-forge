import { defineConfig } from '@playwright/test'

// Playwright _electron e2e baseline for apps/desktop.
// Electron launches per-test via `_electron.launch()`, so no
// webServer/browser bootstrapping is configured here.
//
// Two lanes, ONE serialized worker pool (the single-instance lock
// discipline: parallel workers would race app instances; workers: 1 keeps
// every project sequential, including across project boundaries):
//   desktop-e2e — the M1/M2 journeys under apps/desktop/e2e;
//   forge-m3-e2e — the M3 SC legs under tests/e2e/specs (task 6.2 base),
//     which share the same _electron + isolated-userData conventions.
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
  projects: [
    { name: 'desktop-e2e' },
    { name: 'forge-m3-e2e', testDir: 'tests/e2e/specs' },
  ],
})
