---
id: "fix-1"
title: "Fix: structural removal with dock open never reaches UF3 error card (task-board step-5)"
priority: "P0"
estimated_time: "30min"
dependencies: []
status: pending
breaking: true
type: "coding.fix"
---

# Fix: structural removal with dock open never reaches UF3 error card (task-board step-5)

> Scope note (T-test-run pause, 2026-09-23): the CLI dedups to ONE active fix task per source, so this task carries ALL THREE production defects surfaced by the e2e run (82/86 pass; 3 fails, each root-caused). Fix them in the order below; each has its own contract clause, seam, and failing leg. The e2e specs must stay UNCHANGED (they encode the contracts).

## Defect A (original scope) — task-board step-5/single-task-error

### Root Cause

Production defect exposed by e2e. Chain: scan.ts:227-235 emits task_updated changeKind=structural for deleted keys; TaskBoardPage.tsx:400-403 bumps detailReload only when the open key is in structuralKeysRef at settle; the marker leg (handleEvents via face.subscribeEvents, :447-448) never lands on the page even though the store shared-channel leg refreshes the board — so TaskDetailPanel reloadToken never fires and the re-read rejection never happens. Contract: docs/features/dsh-forge-m2/testing/task-board-browsing/contracts/step-5-open-task-detail.md Outcome single-task-error (dock re-read rejected, error card + retry, no half-content). Investigate whether face.subscribeEvents receives main-process events on the watch-rescan path (single-subscription shared channel precedent) or whether the page must observe deletion via the store snapshot; fix the seam, keep the test unchanged.

## Defect B — multi-project step-1/wizard-abandon-guard: discard-cancel drops focus, second Esc dead

`RegisterWizard.tsx:536-544` unmounts the discard overlay on cancel without restoring focus; `document.activeElement` falls back to `<body>`, outside the card-scoped keydown handler (`LaunchStates.tsx:152-157`) — a keyboard user can never re-raise the guard (确认放弃 leg unreachable). Violates the dialog focus contract (`LaunchStates.tsx:8-12`, `RegisterWizard.tsx:12-16`) and contract step-1 Outcome wizard-abandon-guard (Esc/mask/close triggers, both choices honored). Unit tests masked it by firing keyDown directly on the card (`packages/plugins/forge-workbench/tests/wizard.spec.tsx:648-662`). Fix: restore focus into the wizard on the discard sub-dialog cancel/dismiss path (e.g. `pathInputRef.current?.focus()` on step ①, card-level `tabIndex={-1}` anchor refocus otherwise); add a keyboard-real regression. Source: `packages/plugins/forge-workbench/src/client/views/overview/RegisterWizard.tsx`, `packages/plugins/forge-workbench/src/client/views/tasks/launch/LaunchStates.tsx`. Test: `apps/desktop/e2e/multi-project-management/step-1-open-register-wizard.spec.ts` (fails at the SECOND Esc: `[data-dsh-forge-dialog="register-wizard-discard"]` not visible in 10s).

## Defect C — multi-project step-2/duplicate-registration: ERR_* envelope unparseable over real IPC (systemic)

`ipcMain.handle` rejections arrive renderer-side as `message="Error invoking remote method '<channel>': WorkbenchIpcError: {json}"` (experimentally verified on the repo's Electron 44), so `normalizeWorkbenchVerbError`'s strict `JSON.parse(error.message)` (`packages/plugins/forge-workbench/src/client/ipc/workbench.ts:131-138`) always throws and degrades to `ERR_WORKBENCH_DB`. Main-side chain is correct (`apps/desktop/src/main/workbench/ipc/handlers.ts:29-34` envelope, `repos/projects.ts:62-64` ERR_PROJECT_EXISTS) and the wizard face exists (`StepSummary.tsx:114,145-159` via `verbErrorCode`) — it is simply unreachable over real IPC. Blast radius is systemic: EVERY code-keyed renderer branch over real IPC is dead (also `ERR_SNAPSHOT_STALE` silent refetch `FeatureDocs.tsx:153-155`, `ERR_PROJECT_NOT_FOUND` refresh `OverviewPage.tsx:306`). Fix the transport/parse pair (serialize so the envelope survives the hop, or extract the trailing `{...}` from the prefixed message); add a regression that drives a code-keyed face over a real `ipcMain.handle`. Contract: step-2 Outcome duplicate-registration (FT-036/FT-037(7)). Test: `apps/desktop/e2e/multi-project-management/step-2-select-code-root.spec.ts` (fails: `[data-dsh-forge-wizard-exists]` not visible in 15s at submit; message-substring siblings pass).

## Reference Files

- Source: packages/plugins/forge-workbench/src/client/views/TaskBoardPage.tsx,packages/plugins/forge-workbench/src/client/ipc/workbench-events.ts,apps/desktop/src/main/workbench/indexer/scan.ts
- Test script: apps/desktop/e2e/task-board-browsing/step-5-open-task-detail.spec.ts
- Test results: step-5/single-task-error FAILED: board resettles to 11/11 (rescan + structural deletion detected) but the open dock keeps the stale healthy detail; [data-dsh-forge-detail-error] never renders
- Defect B/C sources and tests: see the two sections above.

## Surface Inference

This fix-task was created by the quality-gate hook. If `surface-key` and `surface-type` above are empty, infer them at execution time:

1. Parse `packages/plugins/forge-workbench/src/client/views/TaskBoardPage.tsx,packages/plugins/forge-workbench/src/client/ipc/workbench-events.ts,apps/desktop/src/main/workbench/indexer/scan.ts` to extract the first file path (comma-separated).
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
