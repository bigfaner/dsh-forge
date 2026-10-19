---
title: "测试策略与约束"
domains: [testing, conventions]
---

# 测试策略与约束（dsh-forge 自身）

> 本文档 = 应用向 forge 测试链（gen-journeys → gen-contracts → gen-test-scripts → run-tests）声明的测试策略与约束正本，经 AGENTS.md §4 引用对全体 agent 生效。

## 分层模型

| 层 | 工具 | vitest 项目 | 位置 | 职责与边界 |
|---|---|---|---|---|
| 单元测试 | vitest | `core` / `knowledge` / `plugin-forge` / `plugin-forge-spec` / `contracts` / `path-key` / `git-worktree` / `md-mermaid` / `host` / `web` | 各包源码树内 `*.test.ts(x)` | 模块契约面。web 面 SSR 直渲（`react-dom/server`）——交互回调体与 useEffect 不强行单测，归 e2e |
| 结构 pin | vitest | `structure` | `tests/structure/` | 机械守卫（行数上限/import 白名单/目录布局/装配纪律/打包闭包 pin）——只断言结构，不测行为 |
| 契约测试 | vitest | `contract`（跨包 RPC 面）/ `contracts`（DTO）/ `plugin-forge-contract` | `tests/contract/` 及包内 | 跨包契约与工具 schema 面；`pnpm test:contract` 为跨包门 |
| e2e 支撑 | vitest | `e2e-support` | `e2e/support/**` | e2e 基建单测（审计锚/readiness/replay 夹具）——随 e2e 面演化，不在 `pnpm test:contract` 门内 |
| 回放取证 | vitest | `plugin-forge-e2e` | `packages/plugin-forge/e2e/**` | 派发循环 dogfood 形态回放（真循环驱动器/注入投影/结算通道 + 域全桩、零模型参与）——名字带 e2e，实为 vitest 回放层 |
| e2e | Playwright（`_electron` 基座） | — | `e2e/specs/`（唯一执行树，testDir 配置） | 真机旅程取证：交互链路、官方件实机形态对照、外部依赖装配面（AGENTS.md §1.4 的结算门） |

- Journey 叙事与 Contract 文档落 feature 目录 `testing/`；测试脚本只落上表执行树，不设暂存区。
- 新增测试一律进既有项目（vitest 项目清单 = `vitest.config.ts` projects——新增包须同步注册项目）。

## e2e 生命周期映射（dev / probe / test / teardown）

本项目无独立 dev/probe/teardown 脚本——生命周期由 Playwright 基座内联承载：

| run-tests 语义 | 本项目等价面 |
|---|---|
| dev | `globalSetup` 前置 `pnpm build:vite`（apps/web 壳 dist——幂等重跑防陈旧产物静默通过；内存受限逃生口 `DSH_FORGE_E2E_SKIP_WEB_BUILD=1`，置位即跳过、dist 新鲜度由调用方担保） |
| probe | `readinessGate` 就绪硬门（`e2e/support/readiness.ts`：产物形态 + 进程存活/单实例锁残留 + 端口残留；未过秒级 fail-fast，spec 零起跑） |
| test | 全量 `pnpm test:e2e`；逐旅程 `pnpm test:e2e -- e2e/specs/<路径>.spec.ts`；单例 `--grep <名称>` |
| teardown | spec 内自持：每例 `_electron` 串行启停（closeApp 后复启），跑批结束零残留进程 |

## e2e 纪律

- **单实例锁**：跑批前查无活跃 dsh-forge 实例（readinessGate 机械承载，spec 零起跑即拒）。
- **并发封顶**：并发 Electron 实例 ≤2（`E2E_MAX_CONCURRENCY` 仅可下调，上调无效）；spec 内启动形态串行。
- **超时**：用例 60s / 断言 10s（playwright.config 持久配置，不在 spec 内放宽）。
- **产物**：trace `retain-on-failure`，输出 `e2e/test-results/`（不入 git）；冒烟台账 `e2e/SMOKE-LEDGER.md`（条件跳过项的唯一留痕处）。
- **写测试时**：断言锚用稳定 data 属性（`data-dswf-*` / 官方 `data-dockkit-*` 等），不断视觉坐标；故障注入优先走既有夹具通道，无通道时如实映射到单测并在文件头注记。

## 执行约束

- **一律 run-once，禁 `--watch`**（孤儿进程耗尽 commit 判例见 AGENTS.md §2）。
- **单测针对性执行**：按改动定位受影响项目/文件（`npx vitest run <路径>` 或 `--project <名>`）；全局跑仅跨包重构或收口验收。
- **快照**：行为变更随改动 `-u` 重录（如简报 compose 快照）；重录必须伴随对应行为断言更新，禁单独重录「凑绿」。
- **环境约束**：全量套件 `VITEST_MAX_WORKERS=4`；TEMP 紧张时重定向；任何原生内存崩溃先查 commit charge 再归因（AGENTS.md §2）。
- **质量门**：compile/fmt/lint/test 命令表 = AGENTS.md §4；提交纪律 = AGENTS.md §5。
- **覆盖率**：口径 = 变更域 scoped（vitest coverage-v8），按任务 acceptance_criteria 要求采集；无要求的任务不虚报覆盖率。

## 旅程与脚本布局

- **单元测试留在模块源码树内**（各包既有位置不变）。
- **旅程测试统一落项目根 `tests/`**：单仓 `tests/<journey>/`；monorepo `tests/<moduleName>/<journey>/`。`moduleName` = 模块唯一标识（如 `web`、`core`——非路径 `apps/web`）；journey frontmatter `module` 字段承载同一标识（monorepo 必填）。
- **存量现状**：既有旅程 spec 集中于 `e2e/specs/`（Playwright testDir 特例——里程碑子目录 `blitz/` `m2/` `m3/` `p1mvp/` + 根级基建冒烟平铺）；新旅程落 `tests/<moduleName>/<journey>/` 约定树，存量不迁移、随里程碑退役。新树入跑批需扩展 Playwright testDir（多 testDir 配置），落地时随首个新旅程一并调整。
- 旅程 spec 命名 kebab-case；fix 链产出的 spec 以缺陷主题命名（如 `worktree-confirm-latch-1-34.spec.ts`——主题 + 任务号溯源），不按 fix-N 编号命名。

## 本项目测试目录速览

```text
{projectRoot}/
├── tests/
│   ├── structure/                  # 结构 pin（vitest 项目 structure）
│   ├── contract/                   # 跨包契约（vitest 项目 contract；门 = pnpm test:contract）
│   └── <moduleName>/<journey>/     # 旅程测试新约定树（monorepo 必带 moduleName；首个新旅程落地时启用）
├── e2e/
│   ├── specs/                      # Playwright 旅程执行树（存量；testDir）——根级基建冒烟 + 里程碑子目录
│   │   ├── m2/ m3/ p1mvp/ blitz/
│   │   └── canary/host-boot/…      # 根级 = 基建冒烟
│   ├── support/                    # e2e 基建（readiness/审计锚/replay 夹具——vitest 项目 e2e-support）
│   ├── playwright.config.ts        # testDir ./specs、并发 ≤2、globalSetup
│   └── SMOKE-LEDGER.md             # 冒烟台账（条件跳过项唯一留痕处）
├── packages/<pkg>/src/**/*.test.ts         # 单元测试（vitest 项目按包名：core/knowledge/plugin-forge/…）
├── packages/plugin-forge/tests/contract/   # 插件工具 schema 契约（项目 plugin-forge-contract）
├── packages/plugin-forge/e2e/              # 派发循环回放取证（项目 plugin-forge-e2e——vitest 回放层，非 Playwright）
├── apps/host/src/**/*.test.ts              # host 单元（项目 host）
└── apps/web/src/**/*.test.tsx              # web 单元（项目 web——SSR 直渲）
```

vitest 项目全集与 include 清单 = `vitest.config.ts`（新增测试位置须落在既有项目的 include 内，否则不入跑批）。
