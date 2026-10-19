---
title: "测试策略与约束"
domains: [testing, conventions]
---

# 测试策略与约束（dsh-forge 自身）

> 本文档 = 应用向 forge 测试链（gen-journeys → gen-contracts → gen-test-scripts → run-tests）声明的测试策略与约束正本。技能在仓内探测 `docs/conventions/testing/`——在场即装载遵循；缺席则按仓库事实推导并记录。

## 分层模型

| 层 | 工具 | 位置 | 职责 |
|---|---|---|---|
| 单元测试 | vitest（按项目） | 各包源码树内 `*.test.ts(x)` | 模块契约面；SSR 直渲（web 面）；针对性执行受影响项目 |
| 结构 pin | vitest | `tests/structure/` | 机械守卫（行数/import 白名单/目录布局/装配纪律） |
| 契约测试 | vitest | `tests/contract/` | 跨包契约面（`pnpm test:contract`） |
| e2e | Playwright | `e2e/specs/<milestone>/<journey>.spec.ts`（testDir 配置为唯一执行树） | 真机旅程取证；旅程 spec 唯一落位，不进 tests/ |

Journey 叙事与 Contract 落 feature 目录 `testing/`，测试脚本只落上表执行树。

## 执行约束

- **一律 run-once，禁 `--watch`**（孤儿进程耗尽 commit 判例见 AGENTS.md §2）。
- **单测针对性执行**：按改动定位受影响项目/文件（`npx vitest run <路径>`）；全局跑仅跨包重构或收口验收。
- **e2e 单实例纪律**：跑 e2e 前查无活跃 dsh-forge 实例。
- **环境约束**：全量套件 `VITEST_MAX_WORKERS=4`；TEMP 紧张时重定向（先查 commit charge 再归因——AGENTS.md §2）。
- **质量门**：compile/fmt/lint/test 命令表 = AGENTS.md §4。

## 旅程与脚本布局（monorepo）

- journey frontmatter `module`（monorepo 必填）声明目标模块。
- 测试脚本 `<module>/tests/<journey>/`，模块既有测试树优先——本项目当前 e2e 集中于 `e2e/specs/`（模块级分散树未启用，新增旅程沿用集中树）。
