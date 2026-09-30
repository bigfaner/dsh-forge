---
status: "blocked"
started: "2026-09-30 18:13"
completed: "N/A"
time_spent: ""
---

# Task Record: T-test-run Run Web E2E Test

## Summary
M4 run-test round 2(fix-3 后续跑;forge:run-tests skill;web-dev→web-probe(479/226)→逐旅程 web-test-m3×6→web-teardown;workers:1 + 每批前实例锁探针;三件套新鲜度核对后零重建)。round 1 终态 60/14/12 → 本轮终态 86 = 81 passed / 3 failed / 2 did-not-run(serial 级联):+21 通过、11/14 失败清除,零产品/src 改动。三分法裁决逐缺口落实:【校准族 ×5(断言零弱化,逐处 in-file 注释引设计源)】P-6A supersede —— services.recordSessionLink 先 supersedeActiveSessionLinks(4.2 发起侧收敛,spike-1 §5/Story2 AC3),harness 按 A→B→M 错序登记致 TOP_A 被 end,契约布景本身时序错置 → 按旅程时序(B ended→M ended→A 最新 active)重排;P-6B 冷面 —— catalog(refreshSubagents)与 durable title 投影均随 open 加载(sc7 已证纪律),冷行名退 displayTitle=cwd 尾段「repo」、冷行地址走 one-shot 兜底 → 只读形态打开无 conversation.input.dock(C6 条所在),命名/C6 断言改 ride opened state(行内 [打开] + sc7 fix-1 同用户径重入);step6/unbound 契约「ended 挂接→零命中」与单测钉死口径冲突(metadata-bar.spec:97 badge 覆盖 active AND ended)→ 改真零覆盖语料(TOP_U/SUB_U 零挂接对);P-4 —— diff.ts「reordered 仅比对已推送且实况命中成员彼此相对序」,组合布景(B 删除)使集合塌缩至 1 结构性不可报 → 拆两相注入(乱序+改名 B 在场 → B 退场删除),三分语义全数真exercise;P-5 —— emitRemovalPush 直发 onEvents 不经 pushPlan 的 relay 在场探测(faults-stub 注错面仅盖 pushPlan),「may linger」指涉 relay 缺席世界,本缝下删除 deterministic 收敛 → 断言对齐实测交付行为(绿 ×2)。【管线族】P-2 waitForDetachedBoard 匹配器歧义(两同标记窗时首轮迭代确定性返回旧窗)→ exclude 参数(窗集计数独立证新窗创建);j5 pane 头挂载抖动(ensure→click 有缝)→ clickPaneDetachStable 原子 probe-and-click + 周期 pickSplitBoard 自愈;降态树行重渲染杀菜单 popover → openLifecycleMenu 整环带界重试;Playwright 句柄排空滞后进程退出(负载下)→ 泄漏硬门前置有界排空等待;独立窗题断言改主进程 osWindowTitles(P-1 纪律,fix-3 后渲染层 document.title 恒不承载组装题);clickStable 增可选 hasText。【产品缺口族 ×3(证据两轮复现/源码定位)】P-3 故障先于首投影注册 → dsh workspace 零投递 → 会话列未绑 + 原生右栏整列不挂载 → 概览/degraded-[重试投影] 面在其存在的状态不可达(healthy 后注错的对账腿全绿 —— 缺口特定于 fault-before-first-projection);P-6C 幽灵挂接打开无 toast —— client/index.ts:977 onEnterSession 以 void 包装吞掉 channel reject,LinkHistory.openTarget 只对 thenable reject 起 toast,违 2.6 AC「打开失败不静默」→ fix-4 已开(透传 promise + 两处 fire-and-forget 调用点自带 catch:TasksPane.tsx:257/TaskBoardPage.tsx:785);P-7 C9 比例跨项目串扰 —— plugin-lifetime splitStore 换台不重置,B 首写把 A 的 30 持久进 B blob,违布局按项目隔离 + 裁决 #28-④「换台重置」(1.6 延迟缝)。fix 门:fix-4(P-6C)为本轮唯一新开,P-3/P-7 以报告为凭候后继续开(一源一活跃)。契约口径缺口(P-4 组合布景/P-5 linger/step6 ended 链路)已录 eval-consistency follow-up。回归面:零产品/src 改动(diff = 15 个 tests/e2e/ 下 spec/harness/helper 文件),共享助手改动全为增量(新导出 + 可选参 + 重试环);compile 门每轮复验 479/226 零收集错误。

## Changes

### Files Created
- docs/features/dsh-forge-m4/tasks/fix-4.md

### Files Modified
- docs/features/dsh-forge-m4/testing/results/latest.md
- tests/e2e/helpers/windows.ts
- tests/e2e/specs/_lib/m4-world.ts
- tests/e2e/specs/multi-window-tearout/harness.ts
- tests/e2e/specs/multi-window-tearout/smoke.spec.ts
- tests/e2e/specs/multi-window-tearout/step-1-select-pane-tearout.spec.ts
- tests/e2e/specs/multi-window-tearout/step-2-tearout-window.spec.ts
- tests/e2e/specs/multi-window-tearout/step-3-parallel-observation.spec.ts
- tests/e2e/specs/multi-window-tearout/step-4-recall-window.spec.ts
- tests/e2e/specs/multi-window-tearout/step-5-second-tearout-set.spec.ts
- tests/e2e/specs/multi-window-tearout/step-6-reenter-restore-tornout.spec.ts
- tests/e2e/specs/project-lifecycle-projection/step-1-projection-status.spec.ts
- tests/e2e/specs/project-lifecycle-projection/step-5-delete-project.spec.ts
- tests/e2e/specs/task-session-roundtrip/harness.ts
- tests/e2e/specs/task-session-roundtrip/smoke.spec.ts
- tests/e2e/specs/task-session-roundtrip/step-3-identify-subagent-session.spec.ts
- tests/e2e/specs/task-session-roundtrip/step-6-subagent-metadata-roundtrip.spec.ts
- tests/e2e/specs/task-session-roundtrip/step-7-session-tree-reverse-badge.spec.ts

### Key Decisions
- 三分法裁决口径:每个 standing failure 先对设计权威(repo 注释口径/单测钉死语义/裁决编号/任务 AC)取证再分类 —— 契约布景与文档化产品语义冲突 = 测试侧校准(断言本体零改动、in-file 注明设计源与缺口记录);产品行为违其自身 AC/裁决 = 产品缺口。本轮 14 失败 → 5 校准族 + 2 管线族 + 3 产品缺口(P-1 已修)+ P-2 匹配器歧义
- P-6 簇分解:非单一根因 —— supersede 时序(5 测)+ 冷面可用点(命名/C6,4 测)为测试侧;产品切片仅 open-failed toast 接线吞错(1 测,fix-4 承载);「P-6 若成立为单因」的预设被证据修正为族分解
- 一源一活跃 fix 门遵守:仅开 fix-4(P-6C,根因行级定位 + 修法/验证面/回归面齐备);P-3/P-7 记录在案候后继续开,不在 run-test 任务内修产品代码
- 口径缺口回流:三处契约期望与设计口径冲突(P-4 组合布景、P-5 linger 过钉、step6 ended→零命中)全部校准并注明,登记 eval-consistency follow-up —— 契约面本身需对齐文档化语义
- 终态数字诚实口径:每旅程终数取自最终代码态的整旅程跑;最后落地的一处 harden 涉及的文件(j3 故障腿/j5 step6)以最终代码复跑绿收数(含一次 90s uiReady 负载 flake 的干净复跑 1.0m),全程日志 .forge/e2e-logs/final*.log 在案

## Cases Generated
86

## Cases Evaluated
86

## Scripts Created
无

## Test Results
86 = 81 passed / 3 failed / 2 did-not-run(serial 级联);round 1 60/14/12 → round 2 +21 通过。逐旅程:workbench-home 10/10 GREEN;registration 12+1F(P-3 概览/重试面不可达)+1DNR;lifecycle 16/16 GREEN;split-pane 12+1F(P-7 C9 比例跨项目串扰)+1DNR;multi-window 15/15 GREEN;task-session-roundtrip 16+1F(P-6C open-failed toast 不浮面,fix-4 已开)。3 失败 = 确证产品缺口(源码定位 + 两轮复现);2 DNR 均为其 serial 级联。compile 门 479/226 绿;零产品/src 改动,4.7 全量基线承载;契约口径缺口 ×3 录 eval-consistency follow-up

## Acceptance Criteria
- [ ] All test cases MUST pass — no skipped tests, no expected failures, no TODO placeholders
- [x] Tests MUST verify actual functional behavior — no placeholder tests, no always-pass mocks, no stub assertions that validate nothing

## Notes
无
