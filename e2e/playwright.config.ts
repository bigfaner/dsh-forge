// G2 门入口（`pnpm test:e2e`）—— Playwright `_electron` 基座。
// electron.launch({ args: [hostMain] }) 装配随 1.4 落地（apps/host dist main + dev profile）；
// 冒烟骨架组已随 2.14 迁入（specs/smoke-skeleton.spec.ts；台账 = e2e/SMOKE-LEDGER.md）。
// 1.5 起主窗口载自有壳（apps/web dist）——globalSetup 前置构建。
import { defineConfig, devices } from '@playwright/test'
// fix-10 fallback（goal ③）：config 模块加载期（早于 worker spawn）显式执行 TMP 重定向，
// 与 global-setup 模块顶层共用同一实现（幂等，仅首个生效）——两处任一生效即可。
import { applyE2eTmpRedirect } from './global-setup.js'

applyE2eTmpRedirect()

// fix-9（并发封顶——用户硬约束「一次最多打开 2 个」，持久配置面）：fullyParallel:false
// 只串行化单文件内用例，spec 文件仍按 workers 并行分派——Playwright 缺省 workers =
// ⌈逻辑核/2⌉（16 核机 = 8 worker × 各自 electron 实例），fix-7 复跑近 10 窗并发失控、
// 主机资源耗尽的根因。显式封顶并发 Electron 实例 ≤2：E2E_MAX_CONCURRENCY 仅可下调
// （clamp ≤2，上调无效）——fix-7 复验、1.13 全池复跑及后续一切 e2e 自动继承，无需
// 额外手工参数。spec 内启动形态均串行（closeApp 后再复启），worker 数 = 实例数上界。
const E2E_MAX_CONCURRENCY = Math.max(
  1,
  Math.min(2, Number.parseInt(process.env.E2E_MAX_CONCURRENCY ?? '', 10) || 2),
)

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: E2E_MAX_CONCURRENCY,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: './test-results',
  use: { trace: 'retain-on-failure' },
  globalSetup: './global-setup.ts',
  // 双 project（mobile-ui 1.1）：desktop = 既有 electron 走查池（specs/，形态不变）；
  // mobile = Chrome 设备模拟池（mobile/，录制回放冒烟——AC 设备描述符：视口 390×844/
  // 触摸/移动 UA）。互斥 testMatch——零既有 spec 漂移。
  projects: [
    { name: 'desktop', testMatch: /specs[\\/].+\.spec\.ts$/ },
    {
      name: 'mobile',
      testMatch: /mobile[\\/].+\.spec\.ts$/,
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        userAgent: devices['iPhone 13'].userAgent,
      },
    },
  ],
})
