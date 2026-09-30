---
status: "blocked"
started: "2026-09-30 08:12"
completed: "N/A"
time_spent: ""
---

# Task Record: T-test-run Run Web E2E Test

## Summary
M4 契约派生 Web E2E 执行腿(forge:run-tests skill;web-dev→web-probe(收集 479/226 = 4.7 基线 393 + 本批 86)→逐旅程 web-test-m3×6→web-teardown;workers:1 + 每批次前实例锁探针 + 真 userData;三件套先重建)。首跑 86 = 27 passed/28 failed/31 did-not-run(serial 级联);两轮【测试侧管线修复】(零产品代码改动、零断言语义弱化)后终态 86 = 60 passed/14 failed/12 did-not-run。修复明细:①m4-world M4WorldManager.closeLive 裸 electronApp.close() 后 vendored host 子进程(19387)逗留致下一腿锁探针误报 —— 补 journey-world killLive 同款整树击杀+等真退出,并增 release() 公面(手动 launch 腿首线探针前提);②ensureOverviewTabOpen 新助手(fresh boot 落开始引导页,forge 概览 tab 须经 chip/引导卡用户径打开)接进 focusOverviewSubtab/openTaskDetail(J1 三腿 + J6 全旅程 dock 开启根因);③project-lifecycle harness 缺 expect 运行时导入(4 腿 ReferenceError);④registerLcProjects 真动词 rename 落 lc-carrier/lc-other(registerFixtureProject 以路径尾段命名 repo/repo-b,概览标题门永不匹配);⑤registration 世界改 register:false + post-boot 真动词基线注册(pre-boot repo 写径不触投影链 —— registered 侦测/同名同序投影收敛根因,sc3 纪律);⑥预览行/nogit 侦测文案对齐产品 copy(沿用仓内→已检出 forge 文档/仓内→可 PR 评审/nogit 全串);⑦registered-duplicate 重塑为快车道终态三元组(§5.4 侦测即自动落位:卡收起+toast 已注册·已打开+指针;卡内瞬态面=单测权威);⑧split-pane step5 收起前提坐实(默认收起组单次 caret 点击=展开;先证展开再收起)+ 冷重启走 release;⑨multi-window:独立窗标题改读主进程 OS 窗题(标题归主进程;page.title()=渲染层 document.title)+ 再拆出改 C9 分屏径(pane 头仅 ≥2 pane 挂载;M3 openBoardPane 单 pane 面不承载动作位)+ ensureBoardPaneDetachable 前置;⑩step4 子 tab 集读取移至 dock 交互前(ensureBoardActive 换 active tab 后概览体卸载);⑪feature 目录行 fresh board 自动展开(§4.4②)以 aria-expanded 为准补点。终态 14 失败全部为【产品行为候选缺陷】,逐条证据+指针落 testing/results/latest.md(P-1 拆出窗标题被渲染层 document.title 覆写→fix-3;P-2 二次拆出复用既有窗;P-3 通道故障活跃期概览/degraded-重试面不可达(会话工作区未绑+右栏不挂载);P-4 deviation 上移方向 reordered 不上报(下移方向 sc3 已证可报);P-5 通道故障删除 dsh 行仍被移除(linger 口径);P-6 挂接行 TOP_A 误呈 ended + 预种标题不浮面(树/后代行均呈 repo);P-7 C9 比例跨项目串扰入 B blob)。fix 任务族受一源一活跃 fix 门限制:fix-3(P-1)先行,P-2~P-7 以报告为凭逐个续开。回归面:本任务零产品/src 改动(diff 仅 6 旅程 spec+m4-world+2 harness),4.7 全量基线(393=329+62 fixme+2 skip,0 failed,tarball-stable)承载未触规格;代表性探针复跑绿(m4/sc3-projection-degrade 17.2s + apps/desktop/e2e/shell.spec.ts 986ms);每轮修复后 compile 门复验 479/226 零收集错误。

## Changes

### Files Created
- docs/features/dsh-forge-m4/testing/results/latest.md

### Files Modified
- tests/e2e/specs/_lib/m4-world.ts
- tests/e2e/specs/project-workbench-home/step-4-three-zone-container.spec.ts
- tests/e2e/specs/project-workbench-home/step-5-forge-views-adoption.spec.ts
- tests/e2e/specs/project-workbench-home/step-6-restart-restore.spec.ts
- tests/e2e/specs/project-registration-projection/harness.ts
- tests/e2e/specs/project-registration-projection/smoke.spec.ts
- tests/e2e/specs/project-registration-projection/step-2-path-probe.spec.ts
- tests/e2e/specs/project-registration-projection/step-3-doc-placement-preview.spec.ts
- tests/e2e/specs/project-lifecycle-projection/harness.ts
- tests/e2e/specs/project-lifecycle-projection/step-1-projection-status.spec.ts
- tests/e2e/specs/split-pane-layout-memory/step-5-leave-reenter-restore.spec.ts
- tests/e2e/specs/multi-window-tearout/smoke.spec.ts
- tests/e2e/specs/multi-window-tearout/step-2-tearout-window.spec.ts
- tests/e2e/specs/multi-window-tearout/step-4-recall-window.spec.ts
- tests/e2e/specs/multi-window-tearout/step-5-second-tearout-set.spec.ts
- tests/e2e/specs/multi-window-tearout/step-6-reenter-restore-tornout.spec.ts

### Key Decisions
- 执行纪律:任务约束「MUST 经 forge:run-tests skill、MUST NOT 直跑 runner」以 just 配方承载(web-dev/web-probe/web-test-m3/web-teardown);M4 旅程落 tests/e2e/specs/<journey>/ = forge-m3-e2e 项目,故逐旅程走 web-test-m3(4.7 全量分块同款 workers:1 + 每批前实例探针)
- 测试侧修复边界:仅生成器方言/种子/生命周期管线(选择器漂移、发明文案、缺失导入、pre-boot 写径、M3 单 pane 方言、标题读错面、锁竞态),断言语义零弱化 —— 需语义重塑处(registered 快车道)以契约终态三元组承载且注明单测权威面
- 14 残余失败全数录为产品行为候选(P-1~P-7,证据+代码指针+快照路径落报告);fix-3(P-1 标题)已建,P-2~P-7 受一源一活跃 fix 门限逐个续开 —— 不在 run-test 任务内修产品代码
- 回归口径诚实陈述:零产品/src 改动故 4.7 基线承载;代表性探针(sc3-projection-degrade/shell)复跑绿;全量 393 未在本任务重跑(同字节承载 + 时间预算),记录在案

## Cases Generated
86

## Cases Evaluated
86

## Scripts Created
无

## Test Results
86 = 60 passed / 14 failed / 12 did-not-run(serial 级联);首跑 27/28/31 → 两轮测试侧管线修复后 +33 通过。逐旅程:workbench-home 10/10 GREEN;registration 12+1F+1DNR;lifecycle 13+2F+1DNR;split-pane 12+1F+1DNR;multi-window 9+3F+3DNR;task-session-roundtrip 4+7F+6DNR。14 失败 = 产品行为候选 P-1~P-7(详见 docs/features/dsh-forge-m4/testing/results/latest.md;fix-3 已建承载 P-1)。compile 门 479/226 绿;回归探针 sc3+shell 绿;4.7 全量基线承载(零产品改动)

## Acceptance Criteria
- [ ] All test cases MUST pass — no skipped tests, no expected failures, no TODO placeholders
- [x] Tests MUST verify actual functional behavior — no placeholder tests, no always-pass mocks, no stub assertions that validate nothing

## Notes
无
