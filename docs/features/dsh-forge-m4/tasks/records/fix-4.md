---
status: "completed"
started: "2026-09-30 18:15"
completed: "2026-09-30 19:10"
time_spent: "~55m"
---

# Task Record: fix-4 Fix: C5 open-failed toast unreachable — board onEnterSession wiring swallows the channel rejection (P-6 residual)

## Summary
P-6C fixed: the board onEnterSession wiring no longer swallows the Interface 6 channel's ERR_SESSION_OPEN_FAILED rejection — client/index.ts threads the promise through so LinkHistory.openTarget's catch fires the C5 open-failed toast (会话不存在或已清理, 2.6 AC 打开失败不静默); the two fire-and-forget affordances (TasksPane ⟞ goto-session, TaskBoardPage handleEnterSession orchestration/pane-host fallback) now swallow the same rejection per-site via the exported isThenable guard, so no unhandled renderer rejection regresses. step5/open-target-missing passes on the real chain; full journey lane + plugin unit lane (1278) + sc7/sc3/shell regression probes all green.

## Changes

### Files Created
无

### Files Modified
- packages/plugins/forge-workbench/src/client/index.ts
- packages/plugins/forge-workbench/src/client/views/TaskBoardPage.tsx
- packages/plugins/forge-workbench/src/client/views/rightbar/subtabs/TasksPane.tsx
- packages/plugins/forge-workbench/src/client/views/tasks/detail/LinkHistory.tsx

### Key Decisions
- Seam-level fix over call-site workarounds: onEnterSession: (target) => enterSession(target) returns the channel promise; the toast owner stays LinkHistory.openTarget (rejecting thenable -> setOpenFailed), exactly the session-open.ts error contract
- Exported isThenable from LinkHistory.tsx as the ONE maybe-promise guard; both fire-and-forget sites mirror the toast path's own discipline (void returns never catch)
- OrchestrationSection.tsx untouched: its (sessionId) => void seam is fed by handleEnterSession, which swallows internally — no unhandled rejection can reach it
- Rebuild trio before e2e (build:plugins + stage:plugin-tarballs + build:desktop; tarball sha256 05cb61a4…), single-instance lock probe before every batch, workers:1

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1298
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [x] P-6C: ghost-session [打开] surfaces the C5 open-failed toast 「会话不存在或已清理」 (j6 step5/open-target-missing passes: toast visible + copy + dock intact + zero pageerrors)
- [x] 2.6 AC line 31 打开失败不静默: the seam returns the channel promise so LinkHistory.openTarget's rejection catch is reachable
- [x] No unhandled-rejection regression at the non-toasting affordances (TasksPane ⟞ + TaskBoardPage handleEnterSession swallow per-site; OrchestrationSection rides the void handler)
- [x] Everything else green: plugin unit lane 73 files/1278 tests, journey lane task-session-roundtrip 17/17 effective, regression probes sc7-dual-form + sc3-parallel-dispatch + base-smoke all pass
- [x] Scope discipline: P-3 and P-7 untouched (remain queued for T-test-run rerun)

## Notes
Verification battery: plugin typecheck (tsc --noEmit) PASS; oxlint on the 4 changed files clean; vitest plugin lane 1278/1278; playwright forge-m3-e2e — task-session-roundtrip 16 passed in-batch + step5/open-target-missing passed in-batch (44.5s, the fix target); step7/rename-vs-lineage-conflict flaked in-batch (click never settled on the overview row's onOpenTask path — untouched by this fix; machine ran the lane ~2x slower than round 2, 38.7m vs 20.6m) and passed on isolated rerun in 13.6s; the same leg also failed the r2 intermediate run at a different assertion then passed the final run, confirming a load-sensitive flake, not a regression. Test count 1298 = 1278 (plugin unit) + 17 (journey, each green in its final executed state) + 3 (sc7/sc3/shell probes). Coverage omitted: no coverage flags in the runner invocation. T-test-run unblocks with P-3/P-7 still standing.
