import { defineConfig } from '@playwright/test'

// G2 门入口（`pnpm test:e2e`）—— Playwright `_electron` 基座。
// electron.launch({ args: [hostMain] }) 装配随 1.4 落地（apps/host dist main + dev profile）；
// 本文件先行固定 runner 形状（testDir/超时/产出），冒烟骨架组随 2.14 迁入。
export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: './test-results',
  use: { trace: 'retain-on-failure' },
})
