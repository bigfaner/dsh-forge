// 环境独占型 e2e 串行硬规则配置（forge-aggregate-bundle 1.33——用户裁定 2026-11-22：
// 「不要并行——串行为配置固化级硬规则」）。
//
// 覆盖对象 = tests/forge/bundle-* 四旅程套件（bundle-install-fullchain /
// bundle-preset-forge-session / bundle-solo-install / bundle-uninstall-fallback）：
// 共享隔离 home（FORGE_COMBO_DSH_HOME）/ profile 正装 / 宿主拉起独占态的集成套件。
//
// 串行语义（Playwright 侧对应 vitest singleWorker/fileParallelism=false 的等价物）：
// - workers: 1——单 worker 进程，文件间零并行（vitest singleWorker 等价）；
// - fullyParallel: false——文件内用例顺序执行（vitest fileParallelism=false 等价）。
//
// 硬规则边界：
// - 串行固化在本配置文件——`pnpm test:e2e:bundle`（唯一合法入口）任何载体（本地/CI/
//   runner）均不可并行；`--workers=N` CLI 覆盖属纪律违例，不在配置层防御范围
//   （spec 侧套件互斥锁 acquireSuiteLock 为第二道防线，见 tests/forge/bundle/support.ts）。
// - 主配置（playwright.config.ts desktop-journeys 项目）以 testIgnore 排除本组套件——
//   任何入口跑主配置都不会把环境独占套件拉进并行分派，防回潮。
// - 套件互斥锁 + fail-fast + commit charge 预检（1.15 交付面）零回退：锁等待上界
//   SUITE_HOOK_TIMEOUT_MS 固化在 spec beforeAll，跨配置双跑仍互斥不互踩。
import { defineConfig } from '@playwright/test'
// fix-10 TMP 自愈同径：config 模块加载期（早于 worker spawn）显式执行（幂等，仅首个生效）。
import { applyE2eTmpRedirect } from './global-setup.js'

applyE2eTmpRedirect()

export default defineConfig({
  testDir: '../tests',
  testMatch: /tests[\\/]forge[\\/]bundle-[^\\/]+[\\/].+\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: './test-results-bundle-serial',
  use: { trace: 'retain-on-failure' },
  globalSetup: './global-setup.ts',
})
