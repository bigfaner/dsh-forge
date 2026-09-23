---
status: "completed"
started: "2026-09-23 16:09"
completed: "2026-09-23 16:43"
time_spent: "~34m"
---

# Task Record: fix-1 Fix: structural removal with dock open never reaches UF3 error card (task-board step-5)

## Summary
Fixed all three production defects scoped by T-test-run (82/86 -> 86-equivalent on the failing legs; the 3 failing e2e tests now pass on the real Electron chain). A) task-board step-5/single-task-error: the task-board store merged the trailing `sync` event of every real scan batch IMMEDIATELY (feed+1) while the task refresh is debounced 400ms, so TasksView re-fed the page off the PRE-refresh board and TaskBoardPage's structural-marker retire loop consumed the deletion marker on the stale snapshot (victim still 'alive') — the dock's reloadToken never fired. Fix: store/task-board.ts defers the sync merge onto the pending refresh read whenever a task refresh is scheduled or armed (flightSync stash, re-applied at settle; also cleared on a failed read so a stale sync can never survive onto a later, fresher DTO). B) multi-project step-1/wizard-abandon-guard: the discard overlay's cancel/dismiss paths unmounted the focused cancel button without restoring focus — document.activeElement fell to <body>, outside the card-scoped keydown handler, so the second Esc could never re-raise the guard. Fix: RegisterWizard captures the interrupted element at guard-raise and restores focus into the wizard on every discard-cancel path (interrupted element if still in the card, else the step-① input, else the card's new tabIndex={-1} anchor exposed via DialogFrame's optional cardRef). C) multi-project step-2/duplicate-registration (systemic): Electron 44 re-wraps every ipcMain.handle rejection as `Error invoking remote method '<channel>': WorkbenchIpcError: {json}`, so normalizeWorkbenchVerbError's strict whole-message JSON.parse always failed and every code-keyed renderer branch degraded to ERR_WORKBENCH_DB. Fix: ipc/workbench.ts adds a trailing-substring envelope scan (only the envelope's own opening brace can whole-parse against the trailing JSON), restoring ERR_PROJECT_EXISTS / ERR_SNAPSHOT_STALE / ERR_PROJECT_NOT_FOUND branches over real IPC. Defect C's fix exposed one further latent seam in the same contract leg: the wizard's existingProject lookup (locate CTA) compared the registry's stored forward-slash normalizeRegisteredPath form against the typed backslash form — paths.ts normalizePathForCompare now folds separators (the client adopts the registry's stored dialect; the main-side chain re-normalizes regardless). Regressions added: store-level (deferred sync merge, failed-read sync landing), page-level real-chain (structural+trailing-sync batch flips the dock error card — verified red against the unfixed store), wizard keyboard-real focus regression (keyDown dispatched on document.activeElement, never on the card), normalize wire-form regressions (exact observed Electron message shape), and the locate-leg registry-dialect regression. E2e specs untouched (contracts preserved).

## Changes

### Files Created
无

### Files Modified
- packages/plugins/forge-workbench/src/client/store/task-board.ts
- packages/plugins/forge-workbench/src/client/ipc/workbench.ts
- packages/plugins/forge-workbench/src/client/views/overview/RegisterWizard.tsx
- packages/plugins/forge-workbench/src/client/views/tasks/launch/LaunchStates.tsx
- packages/plugins/forge-workbench/src/client/paths.ts
- packages/plugins/forge-workbench/tests/task-board-assembly.spec.tsx
- packages/plugins/forge-workbench/tests/feature-board-assembly.spec.tsx
- packages/plugins/forge-workbench/tests/overview-assembly.spec.tsx
- packages/plugins/forge-workbench/tests/wizard.spec.tsx

### Key Decisions
- Defect A fixed at the STORE seam (defer the sync merge onto the pending refresh read), not the page: the page cannot distinguish a served stale snapshot from a fresh one, and the marker/retire protocol is preserved as designed; a sync-only batch with no refresh pending still merges immediately (toolbar-light behavior unchanged).
- Defect B fixed inside the wizard's own cancel paths with a DialogFrame optional cardRef + tabIndex={-1} card anchor; the anchor stays out of the trap's cycle set (focusablesOf excludes tabindex=-1), so no existing dialog behavior changes.
- Defect C fixed renderer-side (trailing-substring envelope extraction) rather than main-side transport: the extraction is format-agnostic across Electron's message wrappings and keeps handlers.ts' documented envelope contract intact; the real-hop regression is the e2e step-2 leg plus unit tests reproducing the exact observed wire message.
- The locate-leg separator fold lives in paths.ts normalizePathForCompare (the client's single path-equality source, mirroring main-side normalizeRegisteredPath) — wire-byte changes (register/patch/authorize now send the folded form) are behaviorally neutral because every main-side consumer re-normalizes; the mock registry now stores the registry dialect, making it more faithful.

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1162
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [x] Defect A — task-board-browsing step-5 Outcome single-task-error: structural removal with the dock open re-reads to the UF3 error card + retry, other tasks unaffected, restore reloads (e2e spec unchanged)
- [x] Defect B — multi-project step-1 Outcome wizard-abandon-guard: discard-cancel keeps the wizard open with input intact AND the guard is re-raisable by a real second Esc (both choices honored; e2e spec unchanged)
- [x] Defect C — multi-project step-2 Outcome duplicate-registration (FT-036/FT-037(7)): ERR_PROJECT_EXISTS surfaces the code-keyed wizard-exists face with the locate CTA over the real IPC chain (e2e spec unchanged)

## Notes
Verification (real chain, retries=0, workers=1, no live dsh-forge instance — single-instance probed clean before each launch): (1) the 3 previously-failing e2e tests: step-5/single-task-error PASS, step-1/wizard-abandon-guard PASS, step-2/duplicate-registration PASS; (2) full re-run of both affected journeys after the path-dialect fix: 28/28 PASS (task-board-browsing 11 + multi-project-management 17); (3) just unit-test: 1162/1162 across 79 files; (4) just compile (268 specs collect), oxlint on the touched package, plugin tsc --noEmit all clean. New defect-A regressions were verified red against the unfixed store (git stash of store/task-board.ts -> 3 failed -> pop -> green). Working tree carries T-test-run's uncommitted test-lane artifacts (e2e specs/helpers, justfile web-* recipes, tasks/index.json, records/run-test.md, testing/results/latest.md, todo.md) — this fix's commit stages ONLY the 9 fix-scoped files above plus this task's own record artifacts; the T-test-run lane's files stay for its own record flow.
