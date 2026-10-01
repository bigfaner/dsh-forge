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
      { test: { name: 'web', include: ['apps/web/src/**/*.test.{ts,tsx}'] } },
    ],
  },
})
