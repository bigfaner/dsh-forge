---
id: "fix-4"
title: "Fix: C5 open-failed toast unreachable — board onEnterSession wiring swallows the channel rejection (P-6 residual)"
priority: "P0"
estimated_time: "30min"
dependencies: []
status: pending
breaking: true
type: "coding.fix"
---

# Fix: C5 open-failed toast unreachable — board onEnterSession wiring swallows the channel rejection (P-6 residual)

## Root Cause

Classification: REAL product gap (violates task 2.6 AC line 31 「打开失败 toast『会话不存在或已清理』不静默」+ session-open.ts's own error contract 「the channel REJECTS ... the C5 LinkHistory seam catches the rejection and surfaces the open-failed toast」). Root cause (line-identified): client/index.ts:977-979 wires the board's onEnterSession as a VOID wrapper — enterSession(target).catch(() => {}) — swallowing the ERR_SESSION_OPEN_FAILED rejection and returning undefined; LinkHistory.openTarget (LinkHistory.tsx openTarget) only toasts when the seam RETURNS a rejecting thenable, so the C5 row's own catch can never fire. The swallow was added for the OTHER affordances (TasksPane.tsx:257 orchestration 「进入会话」, TaskBoardPage.tsx:785 board row enter) which call props.onEnterSession as fire-and-forget — their affordance-level toast is the M6-deferred face per the code comment. Fix direction: thread the promise through for the C5 path (onEnterSession: target => enterSession(target)) and add per-site .catch(() => {}) at the two non-toasting call sites so no unhandled regressions surface; verify with the ghost-session leg + plugin unit lane (LinkHistory seam tests) + task-session-roundtrip journey 17/17. Evidence: .forge/e2e-logs/j6-r2.log (round 2 confirmation, post P-6A/P-6B calibration with row active) and round-1 latest.md P-6 entry.

## Reference Files

- Source: packages/plugins/forge-workbench/src/client/index.ts;packages/plugins/forge-workbench/src/client/views/rightbar/subtabs/TasksPane.tsx;packages/plugins/forge-workbench/src/client/views/TaskBoardPage.tsx
- Test script: tests/e2e/specs/task-session-roundtrip/step-5-open-subagent-session.spec.ts
- Test results: step5/open-target-missing failed twice (round 1 e4abe0e + round 2): ghost link row active, [打开] present, click lands, dock intact, zero pageerrors — but [data-dsh-forge-detail-links-toast] never visible in 15s and the 「会话不存在或已清理」copy never surfaces

## Surface Inference

This fix-task was created by the quality-gate hook. If `surface-key` and `surface-type` above are empty, infer them at execution time:

1. Parse `packages/plugins/forge-workbench/src/client/index.ts;packages/plugins/forge-workbench/src/client/views/rightbar/subtabs/TasksPane.tsx;packages/plugins/forge-workbench/src/client/views/TaskBoardPage.tsx` to extract the first file path (comma-separated).
2. Run `forge surfaces --json <file-path>` to resolve surface-key/type.
3. Use the resolved surface-type to load the appropriate `rules/surfaces/<type>.md` for test orchestration guidance.

If `forge surfaces --json` fails (no surfaces configured, command not found), proceed without surface information — this does not block the fix.

## Fix Boundaries

When fixing test failures, observe these boundaries:

**Forbidden:**
- Starting dev server (`npx expo start`, `npm run dev`, etc.)
- Running `npm install` more than 3 times — mark task as blocked if dependency installation fails 3 times
- Running full test suite — regression is verified by the dispatcher after fix completes
- Manually opening browser to verify rendering

**Correct workflow:**
1. Read failing test + corresponding component source
2. Compare test's expected testID/selectors vs actual DOM structure
3. Modify component (add testID) or test (adjust selectors/assertions)
4. Run targeted tests on affected packages — unit tests must pass
5. Record completion

## Verification

After fixing, verify the fix works:
1. Run targeted tests on changed packages: `go test -race ./affected/package/...`
2. Replace the path with the actual packages you modified

> **Note:** Full project-wide tests run at CLI submit (`forge task submit`) — agent runs targeted tests only.

Full regression is verified by the dispatcher, not by this fix task.

When this task is recorded as completed via `task record`, the source task T-test-run is automatically restored to pending if all its dependencies are completed.
