// S8 spike 本地 playwright 配置（testDir 指向本 spike 目录——不进仓 e2e 池；
// 复用 e2e/support 支撑层经相对导入）。运行：
//   pnpm exec playwright test -c spikes/m2-s8-session-ctx/pw.config.ts
import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  timeout: 600_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'off' },
})
