---
id: "fix-3"
title: "Fix: detached window title — renderer document.title overrides main-process 「项目名 · 视图名」"
priority: "P0"
estimated_time: "30min"
dependencies: []
status: pending
breaking: true
type: "coding.fix"
---

# Fix: detached window title — renderer document.title overrides main-process 「项目名 · 视图名」

## Root Cause

Product gap P-1 from T-test-run: vendored renderer sets document.title which Electron auto-applies to the OS window title, overriding the main-process composition. 2 e2e failures (J5 smoke Step 2 + step2/success). Evidence: .forge/e2e-logs/j5-rerun2.log; error-context snapshots in test-results/.

## Reference Files

- Source: apps/desktop/src/main/windows/detached.ts;packages/plugins/forge-workbench/src/client
- Test script: tests/e2e/specs/multi-window-tearout/smoke.spec.ts
- Test results: OS titles via BrowserWindow.getTitle(): ["DSH 本地构建","MW 顶层会话 B — DSH 本地构建"] — no '·', no project name; composeDetachedTitle (detached.ts:124) composed value never survives. Violates M4 window-role boot contract 标题归主进程 (C10/4.3).

## Surface Inference

This fix-task was created by the quality-gate hook. If `surface-key` and `surface-type` above are empty, infer them at execution time:

1. Parse `apps/desktop/src/main/windows/detached.ts;packages/plugins/forge-workbench/src/client` to extract the first file path (comma-separated).
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
