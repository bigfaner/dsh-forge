---
status: "completed"
started: "2026-09-30 07:31"
completed: "2026-09-30 08:11"
time_spent: "~40m"
---

# Task Record: T-test-gen-scripts Generate Web E2E Test Scripts

## Summary
M4 契约派生 Web E2E 测试线生成(forge:gen-test-scripts skill --type web;eval-contract 门 6/6 过线 avg 1038/1100 后执行):6 个 Journey 全部生成可执行测试脚本,共 47 个 spec/harness 文件 + 1 共享库(tests/e2e/specs/_lib/m4-world.ts)= 48 文件 6523 行,落位 tests/e2e/specs/<journey>/(M3 派生腿同构约定:每旅程 = harness.ts 旅程语料世界 + step-*.spec.ts 每 Contract 步一文件每 Outcome 一测试 test.describe.serial + smoke.spec.ts 全 happy path 单测试)。①project-workbench-home(6 步 10 Outcome→10 测试):boot 首屏三区整台/零注册表空态 hero/全项目树枚举归档分区/整台切换+路径降级核/三区核查零空占位/forge 视图收纳零缩水巡检/重启恢复+500 任务首屏可交互 ≤2s(M2 继承口径单样本,统计权威=SC6 median-of-3)+悬挂指针落点;②project-registration-projection(5 步 13→14):C7 卡六态真链侦测(valid/missing/registered 快车道/parent chips/nogit 信息态)/证据三档+✎ 收展+黏性禁令重估/高级折叠仓外授权行/卡内注册投影同名同序+收敛窗 ≤2s/DSH_FORGE_PROJECTION_FAULTS 通道注错→degraded→GUI 重试恢复/DF002 派发归组(入账+未分组不破坏);③project-lifecycle-projection(5 步 16→16):healthy 状态行+生命周期菜单/通道故障改名本地生效+重试两侧一致/空名零变更实况全等/归档≠删除四面板(分区+workspace 保留+分组账不动)/跨项目归档分区/恢复零投影 op 全等/显式删除(条目+workspace 移除+退未分组+历史 REAL backend 可读+布局记忆清除+指针不指已删)/归档态删除同终态/布局隔离/确认取消零变更/通道故障删除本地生效+workspace 逗留(内核注释口径);④split-pane-layout-memory(6 步 13→14):单视图默认态零重放/[分屏] 双 pane 同屏可操作+枚举白名单 board+session-aside/键盘模型比例 30%+钳制域断言+blob widthPct/subagent 收起展开+expandedSessions/冷重启重放恢复(结构/比例/收起)/跨项目隔离零串扰/doc 目标缺失降级呈现/关 pane 回单视图+重进不复活;⑤multi-window-tearout(6 步 18→15):pane 头拆出动作位/第二实例锁挡退原实例不动/拆出(标题「项目·视图」+主窗 pane 移除+detached 入 blob)/唯一 pane 拆出无死区/并行互不干扰(双窗各自 dock+composer)/同数据面镜像内核事实源/主窗切 B 拆出窗钉 A/收回即时回主窗/托盘驻留零误清+退出漏斗计数归零+重进恢复拆出态/复数集合=2 逐窗记忆/记忆几何复用/来源项目归档(标题追加已归档)/恢复/删除(窗全关+记忆级联);⑥task-session-roundtrip(7 步 17→17):dock 滑入无遮罩原地换内容/no-link 标注+终态发起禁用/挂接历史 active+ended 新→旧+运行中徽标/disposed 血缘位不可用/命名遵循「任务 id+title」+depth-2 递归/无命中落顶层/恰 20 行+查看全部/顶层与 subagent 双通道打开 ≤1 点击(SubagentAddress)/幽灵挂接 open-failed toast/C6 三态(bound 双向跳回/ambiguous 会话级/unbound 零渲染)/树归拢+改名桩血缘为准两面分立。技术基座 _lib/m4-world.ts:M4 SC 腿(1.8/2.9/2.10/3.6/3.7/4.6/4.7)已证技术重定基于旅程纪律 —— 隔离 DSH_HOME app 世界+REAL session-persistence 预种通道/实况 workspace.json 读卡(waitForRegistry)/getProjectionStatus 内核面+静默门/project_ui_state 布局面读卡/C3-C10 面向方言(树行·C8 菜单·C7 卡侦测·C5 dock·C9 分隔条键盘模型·C10 拆出收回)+交互确定性三件(clickStable/clickSelfUnmounting/onboarding 后台 dismiss)。投影断言旅程(lifecycle/registration)走真动词注册链(registerFixtureProject;pre-boot repo 写径不触投影链 —— sc3 纪律)。编译门 PASS:just compile(pnpm exec playwright test --list)= 479 tests / 226 files 零收集错误(基线 377/176 + M4 SC 腿 + 本批 86)。反模式守卫:0 无条件 skip / 0 fixme / 0 GEN-FAILED / 0 重复测试标题。断言深度:869 处 expect 调用,其中 432 处跨源深断言(实况 registry 读卡/SQLite blob 读卡/内核 getProjectionStatus/REAL backend 二次读回/主进程窗口注册表计数 ≈50%,≥30% 深断言门)。覆盖率自查 PASS:web 单 surface 6/6 旅程齐备 0 缺口(journey.md surface_types 全 web)。残余(9 处,全部文件头 VERIFY 注记落据):6 Outcome 无确定性注错缝 DEFERRED(workbench 数据通道故障=组件面在而读径无故障缝;窗口开窗故障 FT-104 单测权威;detached 会话通道失联;失效 windowId 收回;血缘推断 100ms/快照缺席 FT-106 单测权威;拆出侧失效目标=旁置接线 DISABLED 同通道族由 roundtrip open-failed 承载)+ 3 处可达核承载(路径降级角标=sync-error 通道无确定性触发→钉切换不白屏核;三 pane 字面=vendored 双 pane 预算边界;树面 20 上限=FT-107 dock 权威面 cross-ref)+ 契约注释裁决消费(lifecycle step-1e 上游原生设置面 N/A 锚 → 断言 M4 可达接续面;内核 removal 注释 workspace may linger → 5e 腿钉确定性核);运行执行归 T-test-run(全量小时级:每文件独立世界,单实例串行;前置 = pnpm build:plugins + apps/desktop/dist/main.cjs + 无活跃 dsh-forge 实例)。

## Changes

### Files Created
- tests/e2e/specs/_lib/m4-world.ts
- tests/e2e/specs/project-workbench-home/harness.ts
- tests/e2e/specs/project-workbench-home/smoke.spec.ts
- tests/e2e/specs/project-workbench-home/step-1-boot-first-screen.spec.ts
- tests/e2e/specs/project-workbench-home/step-2-project-tree-enumeration.spec.ts
- tests/e2e/specs/project-workbench-home/step-3-switch-project.spec.ts
- tests/e2e/specs/project-workbench-home/step-4-three-zone-container.spec.ts
- tests/e2e/specs/project-workbench-home/step-5-forge-views-adoption.spec.ts
- tests/e2e/specs/project-workbench-home/step-6-restart-restore.spec.ts
- tests/e2e/specs/project-registration-projection/harness.ts
- tests/e2e/specs/project-registration-projection/smoke.spec.ts
- tests/e2e/specs/project-registration-projection/step-1-open-confirm-card.spec.ts
- tests/e2e/specs/project-registration-projection/step-2-path-probe.spec.ts
- tests/e2e/specs/project-registration-projection/step-3-doc-placement-preview.spec.ts
- tests/e2e/specs/project-registration-projection/step-4-confirm-register-project.spec.ts
- tests/e2e/specs/project-registration-projection/step-5-dispatch-session-grouping.spec.ts
- tests/e2e/specs/project-lifecycle-projection/harness.ts
- tests/e2e/specs/project-lifecycle-projection/smoke.spec.ts
- tests/e2e/specs/project-lifecycle-projection/step-1-projection-status.spec.ts
- tests/e2e/specs/project-lifecycle-projection/step-2-rename-project.spec.ts
- tests/e2e/specs/project-lifecycle-projection/step-3-archive-project.spec.ts
- tests/e2e/specs/project-lifecycle-projection/step-4-restore-project.spec.ts
- tests/e2e/specs/project-lifecycle-projection/step-5-delete-project.spec.ts
- tests/e2e/specs/split-pane-layout-memory/harness.ts
- tests/e2e/specs/split-pane-layout-memory/smoke.spec.ts
- tests/e2e/specs/split-pane-layout-memory/step-1-single-view-default.spec.ts
- tests/e2e/specs/split-pane-layout-memory/step-2-add-split-view.spec.ts
- tests/e2e/specs/split-pane-layout-memory/step-3-drag-pane-ratio.spec.ts
- tests/e2e/specs/split-pane-layout-memory/step-4-collapse-subagent-descendants.spec.ts
- tests/e2e/specs/split-pane-layout-memory/step-5-leave-reenter-restore.spec.ts
- tests/e2e/specs/split-pane-layout-memory/step-6-close-to-single-view.spec.ts
- tests/e2e/specs/multi-window-tearout/harness.ts
- tests/e2e/specs/multi-window-tearout/smoke.spec.ts
- tests/e2e/specs/multi-window-tearout/step-1-select-pane-tearout.spec.ts
- tests/e2e/specs/multi-window-tearout/step-2-tearout-window.spec.ts
- tests/e2e/specs/multi-window-tearout/step-3-parallel-observation.spec.ts
- tests/e2e/specs/multi-window-tearout/step-4-recall-window.spec.ts
- tests/e2e/specs/multi-window-tearout/step-5-second-tearout-set.spec.ts
- tests/e2e/specs/multi-window-tearout/step-6-reenter-restore-tornout.spec.ts
- tests/e2e/specs/task-session-roundtrip/harness.ts
- tests/e2e/specs/task-session-roundtrip/smoke.spec.ts
- tests/e2e/specs/task-session-roundtrip/step-1-open-task-detail-dock.spec.ts
- tests/e2e/specs/task-session-roundtrip/step-2-view-link-history.spec.ts
- tests/e2e/specs/task-session-roundtrip/step-3-identify-subagent-session.spec.ts
- tests/e2e/specs/task-session-roundtrip/step-4-open-top-session.spec.ts
- tests/e2e/specs/task-session-roundtrip/step-5-open-subagent-session.spec.ts
- tests/e2e/specs/task-session-roundtrip/step-6-subagent-metadata-roundtrip.spec.ts
- tests/e2e/specs/task-session-roundtrip/step-7-session-tree-reverse-badge.spec.ts

### Files Modified
- tests/e2e/README.md

### Key Decisions
- 输出目录取 tests/e2e/specs/<journey>/(非 guide 字面 tests/<journey>/ 平铺):对齐 M3 派生腿先例与本仓 e2e lane 事实结构(playwright project forge-m3-e2e testDir=tests/e2e/specs,workers:1 单实例纪律;独立平铺目录不入任何 runner project = 不可运行),README 契约派生腿章节补 M4 表
- 新建共享库 _lib/m4-world.ts(不动 M3 _lib/journey-world.ts):M4 SC 腿已证技术(隔离 DSH_HOME/REAL 会话预种/registry 读卡/投影状态面/布局 blob 面/C3-C10 方言)重定基于旅程纪律,M4WorldManager 单实例世界管理 + relaunch adopt 面
- 投影断言旅程(lifecycle/registration)改真动词注册链:buildLcJourneyRoot 用 register:false 未注册语料 + registerFixtureProject post-boot 注册(pre-boot repo 写径不触 hook→plan→relay 投影链,sc3 空注册表 boot 纪律);workbench-home 无投影断言保持 pre-boot repo 注册(sc1/sc2 先例)
- 9 处残余全部文件头 VERIFY 注记落据(6 无缝 DEFERRED + 3 可达核承载),另消费 3 条契约/代码注释裁决:step-1e 上游原生设置面 N/A 锚(断言 M4 可达接续面:UF3 归档行消失+历史可读)、内核 removal 注释 dsh-side workspace may linger(5e 删除断确定性核)、index.ts 旁置接线 DISABLED 注记(复数拆出腿以双 board 窗承载,窗口集合语义对 DetachedViewKind 类型无关)
- 500 任务 ≤2s 首屏计测:重启恢复靴上以 M2 继承口径(行 seam click→500 节点+2rAF)单样本硬门,annotation 记录实测值,统计权威 = SC6 leg ① median-of-3(避免旅程线低严谨重复统计腿)

## Cases Generated
86

## Cases Evaluated
87

## Scripts Created
- tests/e2e/specs/project-workbench-home/
- tests/e2e/specs/project-registration-projection/
- tests/e2e/specs/project-lifecycle-projection/
- tests/e2e/specs/split-pane-layout-memory/
- tests/e2e/specs/multi-window-tearout/
- tests/e2e/specs/task-session-roundtrip/

## Test Results
Compile gate (just compile = pnpm exec playwright test --list) PASS: 479 tests in 226 files collect cleanly (baseline 377/176 + M4 SC legs + this lane's 86). Generated lane: 86 test functions (80 contract-outcome tests [87 outcomes - 6 no-seam deferrals - 1 merged deviation pair] + 6 journey smoke tests) in 41 spec/harness files + 1 shared _lib/m4-world.ts (6523 lines). Antipattern guard: 0 unconditional skips, 0 fixme, 0 gen-failed, 0 duplicate test titles. Assertion depth: 869 expect-calls, 432 deep cross-source oracle calls (live workspace.json registry reads / SQLite layout-blob reads / kernel getProjectionStatus / REAL persistence backend re-reads / main-process window registry counts) ~= 50% deep, meeting the >=80% behavioral and >=30% deep thresholds. Runtime execution is T-test-run's scope.

## Acceptance Criteria
- [x] Scripts generated from Contracts via forge:gen-test-scripts (all 6 journeys, Contract path, batch one-at-a-time)
- [x] Eval gate prerequisite: all 6 journeys' contract sets eval-PASS (>=850, avg 1038/1100) before generation
- [x] Framework resolved from existing tests (Playwright @playwright/test, lane tests/e2e/specs) — no silent default; no test Convention file exists, LLM defaults + code recon per Step 0.3
- [x] Output lands inside the repo's e2e lane (tests/e2e/specs/<journey>/, vitest-excluded) with @feature dsh-forge-m4 | @web-e2e tags + Contract traceability headers
- [x] Exactly one smoke test per journey (happy path, state passed between steps, invariants asserted)
- [x] Compile gate (just compile) passes with zero collection errors
- [x] Coverage self-check: 6/6 web journeys have generated scripts, 0 gaps
- [x] All acceptance criteria met

## Notes
Surface Coverage Report(web 锚 cross-validation):Contracts with anchors 35/35;Anchor Integrity 终态 90-100(eval-contract 已对 page-map 交叉验证);N/A ruling 1 处(lifecycle step-1e 上游原生设置面 —— 按契约注释裁决消费);code bugs flagged 0;suggested fixes pending 0。提交走 --data JSON(process/ 目录 gitignored,只提交 records+index)。下游 T-test-run 前置:pnpm build:plugins + apps/desktop/dist/main.cjs 已构建 + 本机无活跃 dsh-forge 实例(端口 19387 纪律)。
