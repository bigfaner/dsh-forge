import { defineConfig, type Plugin } from 'vitest/config'
import { createRequire } from 'node:module'

// decorator（仓库根 pin）不再暴露全量 API 形状——装饰器降级改用 generator 自带的
// typescript 依赖（WorkspaceAnalyzer 编译面同源，降级语义与生成取材一致）。
const requireProject = createRequire(new URL('./plugins/project/package.json', import.meta.url))
const generatorEntry = requireProject.resolve('typescript')
const ts = createRequire(generatorEntry)('typescript')

// typert strict 迁移 1.4：vitest 5 转换管道（vite 8 oxc）不支持标准装饰器降级——
// plugins/project 源码改 @Remote 装饰器形态后，测试面经本预转换插件降级（generator
// ./tsdown decoratorPlugin 同径：ts.transpileModule，仅命中含装饰器语法的 TS 模块）。
const DSH_DECORATOR_TS = /^[^?]*\.[cm]?tsx?(?:\?|$)/
const DECORATOR_SYNTAX = /^\s*@[A-Za-z_$][\w$]*/m

const dshDecoratorsPlugin = (): Plugin => ({
  name: 'dsh-decorators',
  enforce: 'pre',
  transform(code, id) {
    const file = id.split('?')[0]
    if (!DSH_DECORATOR_TS.test(file)) return
    // 装饰器源码域：project + task-loop（plugin-task-loop 1.13——forgeTasks @Remote 控制器
    // 落位 task-loop host 半，测试面降级同链同径）。
    if (!file.includes('plugins/project') && !file.includes('plugins/task-loop')) return
    if (!DECORATOR_SYNTAX.test(code)) return
    const result = ts.transpileModule(code, {
      fileName: file,
      compilerOptions: {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.ESNext,
        ...(file.endsWith('x') ? { jsx: ts.JsxEmit.ReactJSX } : {}),
        sourceMap: true,
      },
    })
    return {
      code: result.outputText.replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'),
      map: result.sourceMapText ?? undefined,
    }
  },
})

// G1 + 单测门基座（`pnpm test`）。
// 项目划分按 Testing Strategy Per-Layer Test Plan：core/knowledge 单测 + 集成（vitest）、
// 契约面 pin 回归（vitest）、结构化骨架 pin（1.2 起步）。web 的验证面是 e2e（G2），
// web 项目仅预留纯逻辑单测位（视图态机等）。
export default defineConfig({
  plugins: [dshDecoratorsPlugin()],
  test: {
    passWithNoTests: true,
    // 并发上限（16C/32GB 实测 OOM 收口）：默认按核数（15 worker）起 fork，每 worker 独立
    // Node + vite 转换管道（web 池还内联 dsh-client-* 五包），峰值内存远超物理内存——
    // Zone Allocation FATAL。压到 4 worker 后单 worker 内存余量充足，全量跑稳定。
    maxWorkers: 4,
    projects: [
      { test: { name: 'structure', include: ['tests/structure/**/*.test.ts'] } },
      // lib 公共包群单测池（plugin-project 1.2 起步：util/diag；1.6 增 path——path-key 归并 +
      // derive-dir 下沉 + normalize 单源；归并扩池随子包到达追加）
      { test: { name: 'lib-util', include: ['lib/util/src/**/*.test.ts'] } },
      { test: { name: 'lib-diag', include: ['lib/diag/src/**/*.test.ts'] } },
      { test: { name: 'lib-path', include: ['lib/path/src/**/*.test.ts'] } },
      // 1.7 归并到位：api（contracts DTO/词汇/错误码/通道常量 + schema 单源）与 db
      //（openDatabase 整套 + 逐连接 foreign_keys 断言）随本体 git mv 迁入扩池
      { test: { name: 'lib-api', include: ['lib/api/src/**/*.test.ts'] } },
      { test: { name: 'lib-db', include: ['lib/db/src/**/*.test.ts'] } },
      // 契约面 pin 回归池（G1，2.13 起步）：pin 对象 = 上游 @deepseek-ai/* 精确 pin 版本
      // 0.2.0-rc.2 的公开面（npm 包导出与运行时契约），与 core/web 单测分池——
      // G1 单一入口 = pnpm test 固定子集（pnpm test:contract）。
      // 1.14 迁移面：部分 contract 套件消费壳装配面（ForgeSidebarSlot 族）→
      // @dsh-forge/project client ui 追入官方 primitives——css 副产物走 vite 转换管道（同 web 池）。
      { test: { name: 'contract', include: ['tests/contract/**/*.test.ts'], server: { deps: { inline: ['@deepseek-ai/dsh-client-ui-primitives'] } } } },
      // mobile 表面 Journey 回归池（gen-test-scripts——回放 fixtures 驱动的契约钉面测试）
      { test: { name: 'mobile-journeys', include: ['tests/mobile/**/*.test.ts'] } },
      // knowledge 表面 Journey 回归池（knowledge-stage1-foundation 1.10 脚本任务——
      // 断言-契约溯源：每条断言标注 testing/contracts/knowledge-* 契约条目 id；
      // 真机 Electron 面用例在 spec 内 skip 留痕，归 Playwright test-run 收口）
      { test: { name: 'knowledge-journeys', include: ['tests/knowledge/**/*.test.ts'] } },
      { test: { name: 'contracts', include: ['packages/contracts/src/**/*.test.ts'] } },
      { test: { name: 'core', include: ['packages/core/src/**/*.test.ts'] } },
      // knowledge 插件包（UI 三面归位 1.4：ui 面 .test 随迁本池——组件消费官方 primitives，
      // css 副产物走 vite 转换管道 inline，git-worktree 判例同构）
      {
        test: {
          name: 'knowledge',
          include: ['plugins/knowledge/tests/**/*.test.ts', 'plugins/knowledge/ui/**/*.test.{ts,tsx}'],
          server: {
            deps: {
              inline: ['@deepseek-ai/dsh-client-ui-primitives'],
            },
          },
        },
      },
      { test: { name: 'plugin-forge', include: ['packages/plugin-forge/src/**/*.test.ts'] } },
      // 3b④ 契约 pin 扩池：pin-dispatch-injection（dispatchTask description ↔ 注入模板同源断言）
      { test: { name: 'plugin-forge-contract', include: ['packages/plugin-forge/tests/contract/**/*.test.ts'] } },
      // 3b④ e2e dogfood 回放取证（真驱动器/真注入投影/真工具壳 + 桩 tasks/spawn/agents——零模型零 Electron）
      { test: { name: 'plugin-forge-e2e', include: ['packages/plugin-forge/e2e/**/*.test.ts'] } },
      // M3 3.1：第八工件 plugin-forge-spec（spec 三 tool + forge:spec 段）
      { test: { name: 'plugin-forge-spec', include: ['packages/plugin-forge-spec/src/**/*.test.ts'] } },
      // md-mermaid 插件包（校验面单测 + 真引擎 headless parse 集成）
      { test: { name: 'md-mermaid', include: ['packages/plugins/md-mermaid/src/**/*.test.{ts,tsx}'] } },
      // input-history 插件包（纯 client 包——client bundle 装载契约四断言守卫）
      { test: { name: 'input-history', include: ['packages/plugins/input-history/tests/**/*.test.ts'] } },
      // expert-squad 插件包（双面包装载范式——bundle 声明结构镜像守卫）；
      // panel 图标消费官方 primitives——css 副产物走 vite 转换管道（inline，
      // git-worktree/quote-reference 判例同构）
      {
        test: {
          name: 'expert-squad',
          include: ['plugins/expert-squad/tests/**/*.test.ts'],
          server: {
            deps: {
              inline: ['@deepseek-ai/dsh-client-ui-primitives'],
            },
          },
        },
      },
      // project 插件包（plugin-project 1.3 包骨架——结构镜像 + bundle self-containment 守卫；
      // 1.8 起 skeleton 消费 ui/index → 官方 primitives css 走 inline，git-worktree 判例同构）
      {
        test: {
          name: 'project',
          include: ['plugins/project/tests/**/*.test.ts'],
          server: {
            deps: {
              inline: ['@deepseek-ai/dsh-client-ui-primitives'],
            },
          },
        },
      },
      // task-loop 插件包（plugin-task-loop 1.5 包骨架——结构镜像 + 门禁序铁律脚本面 pin +
      // bundle self-containment 守卫；域单测池随迁移批扩。1.13 六组件迁批：skeleton 消费
      // ui/index → 官方 primitives css 走 vite inline 管道——project 池同构）
      {
        test: {
          name: 'task-loop',
          include: ['plugins/task-loop/tests/**/*.test.ts'],
          server: {
            deps: {
              inline: ['@deepseek-ai/dsh-client-ui-primitives'],
            },
          },
        },
      },
      // project 域代码池（plugin-project 1.8：git-worktree 域平移——host/worktrees + ui 随迁单测；
      // ui 消费官方 primitives——css 副产物走 vite 转换管道（inline，git-worktree 判例同构））
      {
        test: {
          name: 'project-domain',
          include: ['plugins/project/host/**/*.test.{ts,tsx}', 'plugins/project/ui/**/*.test.{ts,tsx}'],
          server: {
            deps: {
              inline: ['@deepseek-ai/dsh-client-ui-primitives'],
            },
          },
        },
      },
      // quote-reference 插件包（纯 client 包——client bundle 装载契约守卫 + face 单测 +
      // selection-menu 缝合：primitives Menu 消费——css 副产物走 vite 转换管道（inline，
      // git-worktree 判例同构）；真实 DOM 链路测试以文件级 @vitest-environment 声明）
      {
        test: {
          name: 'quote-reference',
          include: ['packages/plugins/quote-reference/tests/**/*.test.{ts,tsx}'],
          server: {
            deps: {
              inline: ['@deepseek-ai/dsh-client-ui-primitives'],
            },
          },
        },
      },
      // super-composer 插件包（纯 client 包——client bundle 装载契约守卫 + 全屏感知纯逻辑单测；
      // fix-12 复制件消费官方 primitives——css 副产物走 vite 转换管道（inline，
      // git-worktree 判例同构））
      {
        test: {
          name: 'super-composer',
          include: ['packages/plugins/super-composer/tests/**/*.test.{ts,tsx}'],
          server: {
            deps: {
              inline: ['@deepseek-ai/dsh-client-ui-primitives'],
            },
          },
        },
      },
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
