import { defineConfig } from 'vitest/config'

// G1 + 单测门基座（`pnpm test`）。
// 项目划分按 Testing Strategy Per-Layer Test Plan：core/knowledge 单测 + 集成（vitest）、
// 契约面 pin 回归（vitest）、结构化骨架 pin（1.2 起步）。web 的验证面是 e2e（G2），
// web 项目仅预留纯逻辑单测位（视图态机等）。
export default defineConfig({
  test: {
    passWithNoTests: true,
    // 并发上限（16C/32GB 实测 OOM 收口）：默认按核数（15 worker）起 fork，每 worker 独立
    // Node + vite 转换管道（web 池还内联 dsh-client-* 五包），峰值内存远超物理内存——
    // Zone Allocation FATAL。压到 4 worker 后单 worker 内存余量充足，全量跑稳定。
    maxWorkers: 4,
    projects: [
      { test: { name: 'structure', include: ['tests/structure/**/*.test.ts'] } },
      // 契约面 pin 回归池（G1，2.13 起步）：pin 对象 = 上游 @deepseek-ai/* 精确 pin 版本
      // 0.2.0-rc.2 的公开面（npm 包导出与运行时契约），与 core/web 单测分池——
      // G1 单一入口 = pnpm test 固定子集（pnpm test:contract）。
      { test: { name: 'contract', include: ['tests/contract/**/*.test.ts'] } },
      // mobile 表面 Journey 回归池（gen-test-scripts——回放 fixtures 驱动的契约钉面测试）
      { test: { name: 'mobile-journeys', include: ['tests/mobile/**/*.test.ts'] } },
      { test: { name: 'contracts', include: ['packages/contracts/src/**/*.test.ts'] } },
      { test: { name: 'path-key', include: ['packages/path-key/src/**/*.test.ts'] } },
      { test: { name: 'core', include: ['packages/core/src/**/*.test.ts'] } },
      { test: { name: 'knowledge', include: ['packages/knowledge/src/**/*.test.ts'] } },
      { test: { name: 'plugin-forge', include: ['packages/plugin-forge/src/**/*.test.ts'] } },
      // 3b④ 契约 pin 扩池：pin-dispatch-injection（dispatchTask description ↔ 注入模板同源断言）
      { test: { name: 'plugin-forge-contract', include: ['packages/plugin-forge/tests/contract/**/*.test.ts'] } },
      // 3b④ e2e dogfood 回放取证（真驱动器/真注入投影/真工具壳 + 桩 tasks/spawn/agents——零模型零 Electron）
      { test: { name: 'plugin-forge-e2e', include: ['packages/plugin-forge/e2e/**/*.test.ts'] } },
      // M3 3.1：第八工件 plugin-forge-spec（spec 三 tool + forge:spec 段）
      { test: { name: 'plugin-forge-spec', include: ['packages/plugin-forge-spec/src/**/*.test.ts'] } },
      // md-mermaid 插件包（校验面单测 + 真引擎 headless parse 集成）
      { test: { name: 'md-mermaid', include: ['packages/plugins/md-mermaid/src/**/*.test.{ts,tsx}'] } },
      // git-worktree 插件包（在场性检测 + 扩展点契约单测）
      // git-worktree 插件包（在场性检测 + 扩展点契约单测 + client UI 单测）；
      // client UI 消费官方 primitives——css 副产物走 vite 转换管道（server.deps.inline）
      {
        test: {
          name: 'git-worktree',
          include: ['packages/plugins/git-worktree/src/**/*.test.{ts,tsx}'],
          server: {
            deps: {
              inline: ['@deepseek-ai/dsh-client-ui-primitives'],
            },
          },
        },
      },
      // input-history 插件包（纯 client 包——client bundle 装载契约四断言守卫）
      { test: { name: 'input-history', include: ['packages/plugins/input-history/tests/**/*.test.ts'] } },
      { test: { name: 'host', include: ['apps/host/src/**/*.test.ts'] } },
      // mobile 工程（1.2）：纯 view 层单测（wire 投影/store/router 等纯逻辑面）
      { test: { name: 'mobile', include: ['apps/mobile/src/**/*.test.ts'] } },
      // e2e 支撑层纯逻辑单测（5.1 replay 层起步——format/fixtures/executor/db-insert；
      // 走查面归 Playwright（e2e/specs），此处只收不启 Electron 的纯函数/纯 Node 面）
      { test: { name: 'e2e-support', include: ['e2e/support/**/*.test.ts', 'e2e/mobile/**/*.test.ts'] } },
      {
        test: {
          name: 'web',
          include: ['apps/web/src/**/*.test.{ts,tsx}'],
          // dsh-client-* lib 携带 .css 副产物（boot 页/组件样式）——外部化（默认）会让 Node
          // 直载 .css 报 Unknown file extension；内联走 vite 转换管道（css 按 test.css 默认桩化）
          server: {
            deps: {
              inline: [
                '@deepseek-ai/dsh-client-web',
                '@deepseek-ai/dsh-client-store',
                '@deepseek-ai/dsh-client-ui-primitives',
                '@deepseek-ai/dsh-client-ui-slots',
                '@deepseek-ai/dsh-client-ui-dockkit',
              ],
            },
          },
          // web 池文件级串行（系统 commit charge 瓶颈实测：物理内存充足但页文件仅 ~4.9GB、
          // 整机 commit 被 IDE/浏览器等占满，多 web worker 并发时 fork 起不来或 Zone
          // Allocation FATAL——且 flaky 轮会静默少跑测试文件）。单文件独占 worker 峰值
          // 承诺最小；web 单测本身毫秒级，串行总耗时可忽略。根治 = 页文件扩容（bug 台账）。
          fileParallelism: false,
        },
      },
    ],
  },
})
