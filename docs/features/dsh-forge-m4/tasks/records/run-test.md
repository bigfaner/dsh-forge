---
status: "completed"
started: "2026-09-30 19:12"
completed: "2026-10-01 01:59"
time_spent: "~6h 47m"
---

# Task Record: T-test-run Run Web E2E Test

## Summary
M4 run-test round 3(final closure push;forge:run-tests skill;web-dev→web-probe(479/226)→逐旅程 web-test-m3×6→web-teardown;workers:1 + 每批前实例锁探针;产品每改即重建 lib+tarball,双世代全车道 —— 记录世代 = 最终构建)。r2 终态 81/3/2 → 本轮 86 = 82 passed / 4 failed(全数 flake 定性 + 双重复证)/ 0 did-not-run;86/86 在最终构建上全部绿(82 批内 + 4 flake 各经隔离重跑 AND 四 spec 串行批 10/10 双证)。两 r2 standing 缺口收口:【P-7 = 产品修】plugin-lifetime splitStore 换台关全部 tab 后 pane 集清空而 ratio 残留 → B 首次 collect 把 A 的 30 持久进 B 的 project_ui_state(Interface 4 项目域违例);修 = 空集转移(reconcile 空集 + closePane 清空双面)时 ratio 复位 SPLIT_RATIO_RESET(比例是活动 split 的属性,回活跃区单视图即终局;裁决 #28-④ 换台重置的 C9 腿,1.6 延迟缝由 4.5 浮出);单测钉死 moved-ratio 复位 + 后续 open 承载复位值;j4 cross-project 绿 ×3。【P-3 = 测试侧用户径补全,r2「产品缺口」定性推翻】右栏概览(degraded 行 + [重试投影])挂原生 per-session 座(SessionProvider 无会话 = 整列不挂),与通道故障无关;j2 fault 世界零会话语料 + 原位生效按 1.5/1.6 AC 只切指针 → 注册后对新项目行的点击是 #28 同项目零动作,startSession 永不发生;green 诸世界(sc3-degrade ③/j3)皆带会话 + 真换台;修 = 概览断言前补真换台(基线→新项目),startSession 走原生 current/recent 兜底(基线 workspace 已随 boot 健康投影落位)→ 右栏挂载 → degraded/重试/恢复全绿(隔离 11.4s vs 失败轮 51.6s);内核状态机全程无缺口,断言零改动。【P-7 解锁 j4 restore-target-missing(r1/r2 恒 serial-DNR,首真跑即败)= 三层修】①collect 缺缝(产品):blob rightbar.panes 定义在 open-tab inventory 上而 wiring 只在 split 报告时采样 —— doc tab 单独开永不入 blob(契约 fixture 前提「doc tab pane 在记忆中」经用户径不可构造);修 = RightbarTabs inventory watcher 加 onInventoryChange → layoutMemory.setRightbar(逐 publish 采集,幂等同形)。②boot 重放 seat 竞态(产品):首遍重放可落在右栏 seat 绑定窗(face 在、controller 在 seat 间 throw)→ open-tab op 全降级且无重试(既有 boot-race retry 只盖 face-ABSENT 臂);修 = 引擎 degraded-replay retry —— 只重发 failedOps 子集(失败 op 未落地,重试不重复 tab),500ms×6 有界 clock 腿,指针移动/teardown 取消;replay.ts 拆 replayOps 暴露 failedOps。③singleton 双座(产品):重放抢在原生 per-session 恢复前开 board → 恢复落座后两 board;修 = overview/board op 先探 inventory,在场即 focus 不再 open(补全 replay 自身「already restored tab re-opens as a focus」契约,双轨任意序恒单 board)。④语料修正(测试侧):原 doc 目标 = tasks 档 = 迁移世界幽灵档(v3 归档 tasks/index.json → index.json.migrated-*,快照仍列)→ 删前即 ENOENT、rmSync(tasks.md) 空操作,「健全→删除→降级」前提从未成立;改 manifest(真单文件,fixture 恒写,同锚点表)+ 断言 world1 正文可读零错误面。产品遗留已录:迁移后 tasks 档「面板列示但读取必败」的 read/迁移一致性问题(超出本车道,读侧 faces 后续)。【4 flake 双证】j6 step7(已文档化负载敏感)、j5 step6 reborn-boot uiReady 超时(同族亦曾击 j4 step5/success 一次,重跑绿)、j2 step5 侦测陈述收敛(probe/文件系统时序)、j3 step5 ⋯菜单重渲染(r2 已文档化族)—— 各隔离重跑绿(8.5s/19.8s/17.5s/13.7s vs 批内 43s/90s 超时/1.3m/1.9m)+ 四 spec 串行批 10/10(12.2m);断言零触碰。回归面:全插件单测 407/407(含新钉:空集复位双面/degraded-retry 三例/singleton focus 去重);4.5 内核 drift 锁 22/22;sc1+sc2+sc3-degrade+sc4-split-windows+base-smoke 探针 7/7 绿(sc4 直击本轮 split/replay 改面);compile 门 479/226 零收集错误(终态复验)。

## Changes

### Files Created
无

### Files Modified
- packages/plugins/forge-workbench/src/client/views/rightbar/tabs-model.ts
- packages/plugins/forge-workbench/src/client/views/rightbar/RightbarTabs.tsx
- packages/plugins/forge-workbench/src/client/layout/persistence.ts
- packages/plugins/forge-workbench/src/client/layout/replay.ts
- packages/plugins/forge-workbench/src/client/index.ts
- packages/plugins/forge-workbench/tests/rightbar-split-model.spec.ts
- packages/plugins/forge-workbench/tests/layout-memory.spec.ts
- tests/e2e/specs/project-registration-projection/step-4-confirm-register-project.spec.ts
- tests/e2e/specs/split-pane-layout-memory/step-5-leave-reenter-restore.spec.ts
- docs/features/dsh-forge-m4/testing/results/latest.md

### Key Decisions
- 三分法延续(r2 纪律):每失败先源码定权(repo 注释/设计 AC/单测钉死/实况观测)再裁决;本轮产品改动四处全为 additive/guarded(hostless 世界保持原形),测试侧两处均为世界/用户径补全,断言零弱化 —— j2 fault 腿补真换台(概览宿主 = per-session 右栏,设计事实),j4 missing 腿改 manifest 语料(前提坐实:在世可读 + 真删除)。
- P-3 定性推翻的证据链:右栏 per-session 挂载(vendored RightbarRoot→SessionProvider 源读)+ 原位生效只切指针(1.5/1.6 AC 原文)+ 同项目零动作(#28)+ green 世界对照(sc3-degrade ③/j3 均带会话 + 真换台)→ 真换台后 fault 世界内 degraded/重试/恢复全绿 = 产品履约,缺口在测试路径。
- j4 restore-target-missing 的诊断法(可复用):throwaway debug spec(不提交)复刻世界直读 blob/chips/fs/verb 错误文本 + reborn 手动重开探针 —— 一次运行同时坐实 collect 缺缝(世界1 blob 无 doc 行)、seat 竞态(seat 绑定后手动开即出参数化错误卡)与 tasks 幽灵档(删前即 ENOENT + fs 双 false)。
- degraded-replay retry 的安全形状:只重发 failedOps 子集(失败 op 未落地 → 重试不重复 tab),有界 6×500ms,clock 注入可测;singleton(overview/board)focus 去重补在 replay 执行器(inventory 探针 + focus),使重放对原生 per-session 恢复任意序幂等 —— 单测四例钉死。
- flake 纪律升级:批内失败 ①隔离重跑定性 ②再入串行小批复证(4 spec 10/10)—— 双证后计入 flake-documented;本轮 4 例全属已文档化族或同族首见(reborn-boot uiReady 超时),零断言改动。

## Cases Generated
86

## Cases Evaluated
86

## Scripts Created
无

## Test Results
86 = 82 passed / 4 failed (all flake-adjudicated + re-verified green twice) / 0 did-not-run; 86/86 green on the final build (82 in-batch + 4 via isolated rerun AND a 4-spec serial batch 10/10 in 12.2m). Per journey (final-build lane .forge/e2e-logs/r3b-*.log): workbench-home 10/10; registration 13+1F(step5 detect flake, isolated 8.5s); lifecycle 15+1F(step5 menu flake, isolated 17.5s); split-pane 14/14 (incl. the r2-standing cross-project-isolation P-7 fix and the never-before-exercised restore-target-missing); multi-window 14+1F(step6 reborn-boot flake, isolated 19.8s); task-session 16+1F(step7 documented flake, isolated 13.7s). Regression: plugin unit 407/407; kernel drift lock 22/22; sc1/sc2/sc3/sc4/base-smoke probes 7/7; compile gate 479/226 zero collection errors. Product fixes: split-store empty-transition ratio reset (P-7); inventory-publish collect seam; degraded-replay bounded retry (seat-race arm); singleton focus dedupe. Test-side: real-换台 user path (j2 fault leg), manifest corpus (j4 missing leg).

## Acceptance Criteria
- [x] All test cases MUST pass — no skipped tests, no expected failures, no TODO placeholders
- [x] Tests MUST verify actual functional behavior — no placeholder tests, no always-pass mocks, no stub assertions that validate nothing

## Notes
无
