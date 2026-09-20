import { defineConfig } from '@playwright/test'

// Electron shell e2e. Every spec launches the real app bundle, and the shell
// claims a single-instance lock (F1) — so specs must run serially in one
// worker or parallel launches knock each other out with ERR_SINGLE_INSTANCE.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
})
