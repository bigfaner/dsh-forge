import { defineConfig } from 'vitest/config'

// G1 + 单测门基座（`pnpm test`）。
// 项目划分按 Testing Strategy Per-Layer Test Plan：core/knowledge 单测 + 集成（vitest）、
// 契约面 pin 回归（vitest）、结构化骨架 pin（1.2 起步）。web 的验证面是 e2e（G2），
// web 项目仅预留纯逻辑单测位（视图态机等）。
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      { test: { name: 'structure', include: ['tests/structure/**/*.test.ts'] } },
      { test: { name: 'contracts', include: ['packages/contracts/src/**/*.test.ts'] } },
      { test: { name: 'core', include: ['packages/core/src/**/*.test.ts'] } },
      { test: { name: 'knowledge', include: ['packages/knowledge/src/**/*.test.ts'] } },
      { test: { name: 'host', include: ['apps/host/src/**/*.test.ts'] } },
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
        },
      },
    ],
  },
})
