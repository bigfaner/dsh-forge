---
status: "completed"
started: "2026-10-08 18:13"
completed: "2026-10-08 18:39"
time_spent: "~26m"
---

# Task Record: T-test-run Run Web E2E Test

## Summary
补齐并全量跑通 dsh-forge-m3-bootstrap-presets Web E2E（9 journey）：23/23 全绿（0 失败/0 跳过）。fix-3 收口后三未跑旅程先行（preset-physical-isolation 1/1、proposal-review-mode-transition 4/4、worker-provisioning 1/1）+ overview-entry-new-session 复跑 3/3（确认 fix-3 的 T1 Step1e 会话行诚实观测改写）+ 其余五旅程复绿（blitz-direct-chain 3/3、bootstrap-walkthrough 2/2、expedition-full-sdd-chain 3/3、gate-and-submit-discipline 3/3、mode-selection-alignment 3/3）。worker-provisioning T1 首跑失败 = 测试脚本缺陷（fix-chain 边 SQL 两占位只绑一参 + 边方向倒置——产品写径 add.ts:453 task_id=源←prerequisite=fix，与 M2 先例一致），仅修 e2e 绑参后复跑绿，产品代码零改动。编排：just dev（后台）→ just probe（OK）→ 九旅程顺序 just test <journey> → just teardown（整树清理，状态文件已清）。

## Changes

### Files Created
- docs/features/dsh-forge-m3-bootstrap-presets/testing/results/latest.md

### Files Modified
- e2e/specs/m3/worker-provisioning.spec.ts

### Key Decisions
无

## Cases Generated
23

## Cases Evaluated
23

## Scripts Created
- e2e/specs/m3/preset-physical-isolation.spec.ts
- e2e/specs/m3/proposal-review-mode-transition.spec.ts
- e2e/specs/m3/worker-provisioning.spec.ts
- e2e/specs/m3/overview-entry-new-session.spec.ts
- e2e/specs/m3/blitz-direct-chain.spec.ts
- e2e/specs/m3/bootstrap-walkthrough.spec.ts
- e2e/specs/m3/expedition-full-sdd-chain.spec.ts
- e2e/specs/m3/gate-and-submit-discipline.spec.ts
- e2e/specs/m3/mode-selection-alignment.spec.ts

## Test Results
23/23 passed (0 failed, 0 skipped) across 9 journeys — preset-physical-isolation 1/1, proposal-review-mode-transition 4/4, worker-provisioning 1/1 (首跑脚本缺陷修正后复跑), overview-entry-new-session 3/3, blitz-direct-chain 3/3, bootstrap-walkthrough 2/2, expedition-full-sdd-chain 3/3, gate-and-submit-discipline 3/3, mode-selection-alignment 3/3; report at docs/features/dsh-forge-m3-bootstrap-presets/testing/results/latest.md

## Acceptance Criteria
- [x] All test cases MUST pass — no skipped tests, no expected failures, no TODO placeholders
- [x] Tests MUST verify actual functional behavior — no placeholder tests, no always-pass mocks, no stub assertions that validate nothing
- [x] All acceptance criteria met

## Notes
唯一改动 = e2e/specs/m3/worker-provisioning.spec.ts:112 绑参修正（.get(srcFix.taskId, fix1.taskId)），断言语义不变（fix-chain 边 ≥1 在库——auto-block 审计行首跑即过，边在库实证）；生成器漂移第八类（SQL 绑参/方向）已记入报告。环境：继承默认用户 TMP（e2e 红线——不重定向）；跑前/提交前确认无活跃 dsh-forge/electron 实例（单实例锁红线）；globalSetup 每旅程幂等前置构建。前轮七类生成器漂移 + fix-3 两遗留均未复发。
