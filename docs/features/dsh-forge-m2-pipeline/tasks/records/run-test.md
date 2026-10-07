---
status: "completed"
started: "2026-10-07 07:23"
completed: "2026-10-07 08:02"
time_spent: "~39m"
---

# Task Record: T-test-run Run Web E2E Test

## Summary
全量重跑 dsh-forge-m2-pipeline Web E2E（7 journey）：55/55 全绿（0 失败/0 跳过/零修复迭代）。上一轮 4 失败（document-browsing，根因 = feature 文档行列举源缺失）已由 fix-2 修复（FEATURES_CHANNELS.listDocs 全链，commit 72e52ae）——本轮 document-browsing 5/5 确认转绿；tasksTabLoadKey 漏 search 入键的生产修复随 task-overview-review 中英双语搜索用例验证。编排：just dev（后台）→ just probe（OK）→ 七旅程顺序 just test <journey> → just teardown（整树清理）。

## Changes

### Files Created
无

### Files Modified
- docs/features/dsh-forge-m2-pipeline/testing/results/latest.md

### Key Decisions
无

## Cases Generated
55

## Cases Evaluated
N/A

## Scripts Created
- e2e/specs/m2/document-browsing.spec.ts
- e2e/specs/m2/fix-chain-auto-recovery.spec.ts
- e2e/specs/m2/interrupted-dispatch-recovery.spec.ts
- e2e/specs/m2/task-dispatch-pipeline.spec.ts
- e2e/specs/m2/task-overview-review.spec.ts
- e2e/specs/m2/task-session-linkage.spec.ts
- e2e/specs/m2/workspace-registration-derived-path.spec.ts

## Test Results
55/55 passed (0 failed, 0 skipped) across 7 journeys — document-browsing 5/5, fix-chain-auto-recovery 9/9, interrupted-dispatch-recovery 6/6, task-dispatch-pipeline 8/8, task-overview-review 11/11, task-session-linkage 8/8, workspace-registration-derived-path 8/8; report at docs/features/dsh-forge-m2-pipeline/testing/results/latest.md

## Acceptance Criteria
- [x] All test cases MUST pass — no skipped tests, no expected failures, no TODO placeholders
- [x] Tests MUST verify actual functional behavior — no placeholder tests, no always-pass mocks, no stub assertions that validate nothing
- [x] All acceptance criteria met

## Notes
纯验证轮：本任务零代码/测试改动（4 失败修复由 fix-2 与 tasksTabLoadKey 生产修复在先行任务交付）。环境：继承默认用户 TMP（e2e 红线——不重定向）；跑前确认无活跃 dsh-forge dev 实例持单实例锁；globalSetup 每旅程幂等前置构建 apps/web dist。此前 6 类生成器语义偏差已在上一轮逐例仲裁修正（修测试侧，单测/SC 验收谱背书），本轮全部稳定复绿。
