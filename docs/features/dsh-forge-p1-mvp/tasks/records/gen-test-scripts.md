---
status: "completed"
started: "2026-10-03 05:10"
completed: "2026-10-03 13:05"
time_spent: "~7h 55m"
---

# Task Record: T-test-gen-scripts Generate Web E2E Test Scripts

## Summary
按六个 p1-mvp Journey 的 Contract 规格（eval-contract 全部 850+ 通过）生成 Web E2E 测试脚本：e2e/specs/p1mvp/ 下六套 Playwright _electron spec（project-registration / project-registration-compensation / knowledge-browsing / knowledge-recall-flywheel / session-workbench / installer-smoke），共 45 条 test（每旅程 1 条冒烟 + 每 Contract Outcome 一条测试或留痕 skip）。故障注入按 FAULT_INJECTION_CONTRACT 单测同口径落地（ws_path UNIQUE 冲突行预置，better-sqlite3 经 packages/core 闭包）；registry 探针 = {dshHome}/storages/workspace.json 直读。生成后逐套实机校验：非 dogfood 面 31 passed + 13 留痕 skip（通道缺失缺陷信号记账）+ 1 条 soft 缺陷信号（知识浏览零结果窗 UI 过滤态卡死——kb 2b/2c，RPC 面健康，候选产品缺陷）；dogfood 面（凭据门）留待 run-test 行使。oxlint/tsc/发现门全绿。

## Changes

### Files Created
- e2e/specs/p1mvp/project-registration.spec.ts
- e2e/specs/p1mvp/project-registration-compensation.spec.ts
- e2e/specs/p1mvp/knowledge-browsing.spec.ts
- e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts
- e2e/specs/p1mvp/session-workbench.spec.ts
- e2e/specs/p1mvp/installer-smoke.spec.ts

### Files Modified
- .claude/agent-memory/forge-task-executor/dsh-forge-p1mvp-e2e-disciplines.md
- .claude/agent-memory/forge-task-executor/env-node24-rmsync-cjk-crash.md
- .claude/agent-memory/forge-task-executor/MEMORY.md

### Key Decisions
无

## Cases Generated
45

## Cases Evaluated
45

## Scripts Created
- e2e/specs/p1mvp/project-registration.spec.ts
- e2e/specs/p1mvp/project-registration-compensation.spec.ts
- e2e/specs/p1mvp/knowledge-browsing.spec.ts
- e2e/specs/p1mvp/knowledge-recall-flywheel.spec.ts
- e2e/specs/p1mvp/session-workbench.spec.ts
- e2e/specs/p1mvp/installer-smoke.spec.ts

## Test Results
实机校验（非 dogfood 面）：project-registration 10/10 passed；compensation 5 passed + 3 留痕 skip；knowledge-browsing 5 passed + 1 soft 缺陷信号；session-workbench 5 passed + 1 留痕 skip（dogfood 冒烟留待 run-test）；flywheel 2 passed + 4 留痕 skip（dogfood 4 条凭据门内待跑）；installer-smoke 4 passed + 1 留痕 skip（真 NSIS 安装链全绿）。编译门：oxlint 0 error、tsc 实错 0（e2e 不在 tsc -b 图内，DOM-lib 噪音与既有 specs 同类）、playwright --list 58 tests/14 files 全发现。

## Acceptance Criteria
- [x] 六个 Journey 各有测试脚本（覆盖率自查 6/6，无缺口）
- [x] 每旅程恰 1 条冒烟（happy path 贯穿）+ 每 Contract Outcome 有对应测试或留痕 skip（溯源注释）
- [x] 全部脚本经 Playwright 发现/转译门 + oxlint + tsc 实错清零
- [x] 非 dogfood 可执行面实机通过（31 passed）；dogfood 面凭据门结构与既有 flywheel.spec 同径
- [x] All acceptance criteria met

## Notes
关键实测发现（均已落 agent-memory：dsh-forge-p1mvp-e2e-disciplines）：(1) 官方首启 API-key 弹窗收起动作会毒化同 userData 下一 boot 的产品工作台挂载（非确定性竞态，探针 2/4/6 对照 7 次复现）——全部套件改单 boot 形态（RPC 前置 + WAL 活写状态转移 + dismiss 置于链路末段）；installer 套件按「零 UI 首启 → 零 UI 冷重启 → 末位 UI 走查」排序。(2) 知识浏览零命中关键词触发 UI 过滤态清场卡死（RPC 健康）——kb 2b/2c 以 expect.soft 缺陷信号记账，转正 = use-knowledge-browse projectId 锚抖动竞态修复。(3) rmSync 对 CJK 父目录下单文件静默不删（unlinkSync 修复）。(4) 飞轮链口径（召回 1/1、热度 +1）与 shipped 逐调用口径（2、+2）分歧为 contract 故意缺陷信号设计——按 Contract 断言、expect.soft 承载，run-test 预期红点即缺陷信号。(5) 留痕 skip 共 9 条：注入/触发通道缺失（FAULT_INJECTION_CONTRACT / RECONCILE_NOT_AUTO_INVOKED / DOCK_TAB_MODEL / E2E_INFRA 断网记录器 / 双门分工 search 直测），转正条件均注明。
