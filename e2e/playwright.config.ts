// G2 门入口（`pnpm test:e2e`）—— Playwright `_electron` 基座。
// electron.launch({ args: [hostMain] }) 装配随 1.4 落地（apps/host dist main + dev profile）；
// 冒烟骨架组已随 2.14 迁入（specs/smoke-skeleton.spec.ts；台账 = e2e/SMOKE-LEDGER.md）。
// 1.5 起主窗口载自有壳（apps/web dist）——globalSetup 前置构建。
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: './test-results',
  use: { trace: 'retain-on-failure' },
  globalSetup: './global-setup.ts',
})
