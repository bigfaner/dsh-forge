---
status: "completed"
started: "2026-09-23 16:45"
completed: "2026-09-23 17:15"
time_spent: "~30m"
---

# Task Record: T-test-run Run Web E2E Test

## Summary
Completion pass after fix-1 (commit 9d95d87) resolved the 3 production defects that blocked the first pass. Re-ran the full staged web e2e suite (Electron+Playwright lane, apps/desktop/e2e, 6 journeys, 86 tests, workers=1/retries=0) via justfile web-dev/web-probe/web-test/web-teardown, with pnpm build:plugins refreshed first (lane requirement: fixtures pack tarballs from packages/plugins/*/lib; verified lib build 16:36 ≥ newest fix-1 src 16:32). FINAL: 85 passed / 0 failed / 1 documented skip. All 3 former defects confirmed fixed on the real Electron chain: defect A task-board step-5/single-task-error (store sync-merge race fix in task-board.ts) → journey 11/11; defects B multi-project step-1/wizard-abandon-guard (focus restoration) and C step-2/duplicate-registration (IPC error-envelope extraction + registry path-dialect fold) → journey 17/17. One new failure surfaced during the completion pass: multi-project step-4/project-path-invalid 注册表行保留 assertion was order-sensitive — raw getState row order (registration/rowid, contract-unspecified) compared against lexicographically sorted random UUIDs = 50% flake by UUID coin-flip, previously masked by luck in the first pass and fix-1's 28/28 verification. App behavior is exactly per contract (both rows retained, nothing auto-deleted) → classified test-script bug, fixed minimally with intent preserved (sort the received array before toEqual; exact-membership assertion unchanged), journey re-ran 17/17 green. Cumulative test-script fixes across both passes: 17 items / 20 legs, all preserving assertion intent. The single skip remains the documented infeasible leg: plugin-management step-1/load-error-reject (no deterministic main-process injection channel for a listPlugins first-load rejection — gen-task record divergence, test.skip with recorded reason at spec line; recorded, not masked). History: first pass 82/86 (3 production defects → fix-1, coding.fix, --block-source) → fix-1 verified 3 legs + both affected journeys 28/28 + unit 1162/1162 → completion pass 85/86 + 1 documented skip. Full report: docs/features/dsh-forge-m2/testing/results/latest.md.

## Changes

### Files Created
- docs/features/dsh-forge-m2/testing/results/latest.md

### Files Modified
- justfile
- docs/features/dsh-forge-m2/tasks/fix-1.md
- apps/desktop/e2e/tests/m2/helpers/restart-app.ts
- apps/desktop/e2e/fixtures/forge-project.ts
- apps/desktop/e2e/task-session-execution-loop/helpers.ts
- apps/desktop/e2e/task-board-browsing/helpers.ts
- apps/desktop/e2e/dual-form-consistency/smoke.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-1-terminal-change-flowback.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-2-session-change-terminal-consistency.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-3-alternating-operations.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-4-verify-forge-data-consistency.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-5-link-integrity-after-alternation.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/helpers.ts
- apps/desktop/e2e/feature-board-docs-browsing/smoke.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-1-open-feature-board.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-2-view-feature-status.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-3-browse-feature-docs.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-4-register-external-docs-project.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-5-external-docs-consistent-rendering.spec.ts
- apps/desktop/e2e/multi-project-management/helpers.ts
- apps/desktop/e2e/multi-project-management/smoke.spec.ts
- apps/desktop/e2e/multi-project-management/step-1-open-register-wizard.spec.ts
- apps/desktop/e2e/multi-project-management/step-2-select-code-root.spec.ts
- apps/desktop/e2e/multi-project-management/step-3-select-doc-location-register.spec.ts
- apps/desktop/e2e/multi-project-management/step-4-switch-active-project.spec.ts
- apps/desktop/e2e/multi-project-management/step-5-remove-project.spec.ts
- apps/desktop/e2e/plugin-management/helpers.ts
- apps/desktop/e2e/plugin-management/smoke.spec.ts
- apps/desktop/e2e/plugin-management/step-1-open-plugin-section.spec.ts
- apps/desktop/e2e/plugin-management/step-2-initiate-disable.spec.ts
- apps/desktop/e2e/plugin-management/step-3-confirm-disable.spec.ts
- apps/desktop/e2e/plugin-management/step-4-re-enable.spec.ts
- apps/desktop/e2e/plugin-management/step-5-review-plugin-list.spec.ts

### Key Decisions
无

## Cases Generated
86

## Cases Evaluated
86

## Scripts Created
- apps/desktop/e2e/task-session-execution-loop/smoke.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-1-open-task-board-dag.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-2-open-task-detail.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-3-launch-session.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-4-verify-prompt-injection.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-5-agent-claim-flowback.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-6-restart-link-recovery.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-7-reenter-session.spec.ts
- apps/desktop/e2e/task-board-browsing/smoke.spec.ts
- apps/desktop/e2e/task-board-browsing/step-1-open-task-board-dag.spec.ts
- apps/desktop/e2e/task-board-browsing/step-2-switch-board-views.spec.ts
- apps/desktop/e2e/task-board-browsing/step-3-filter-and-sort.spec.ts
- apps/desktop/e2e/task-board-browsing/step-4-view-worktree-badge.spec.ts
- apps/desktop/e2e/task-board-browsing/step-5-open-task-detail.spec.ts
- apps/desktop/e2e/dual-form-consistency/smoke.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-1-terminal-change-flowback.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-2-session-change-terminal-consistency.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-3-alternating-operations.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-4-verify-forge-data-consistency.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-5-link-integrity-after-alternation.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/smoke.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-1-open-feature-board.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-2-view-feature-status.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-3-browse-feature-docs.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-4-register-external-docs-project.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-5-external-docs-consistent-rendering.spec.ts
- apps/desktop/e2e/multi-project-management/smoke.spec.ts
- apps/desktop/e2e/multi-project-management/step-1-open-register-wizard.spec.ts
- apps/desktop/e2e/multi-project-management/step-2-select-code-root.spec.ts
- apps/desktop/e2e/multi-project-management/step-3-select-doc-location-register.spec.ts
- apps/desktop/e2e/multi-project-management/step-4-switch-active-project.spec.ts
- apps/desktop/e2e/multi-project-management/step-5-remove-project.spec.ts
- apps/desktop/e2e/plugin-management/smoke.spec.ts
- apps/desktop/e2e/plugin-management/step-1-open-plugin-section.spec.ts
- apps/desktop/e2e/plugin-management/step-2-initiate-disable.spec.ts
- apps/desktop/e2e/plugin-management/step-3-confirm-disable.spec.ts
- apps/desktop/e2e/plugin-management/step-4-re-enable.spec.ts
- apps/desktop/e2e/plugin-management/step-5-review-plugin-list.spec.ts

## Test Results
86 collected / 85 passed / 0 failed / 1 skipped (documented). Per journey: dual-form-consistency 15/15, feature-board-docs-browsing 12/12, multi-project-management 17/17, plugin-management 14/14 + 1 documented skip, task-board-browsing 11/11, task-session-execution-loop 16/16. All verdicts first-run (workers=1, retries=0, no masking). Skip = plugin-management step-1/load-error-reject (test.skip, recorded reason: no deterministic main-process injection channel — gen-task record divergence).

## Acceptance Criteria
- [x] Run all staged test scripts — all 6 journeys, all 86 tests, real Electron chain, no masking (workers=1, retries=0)
- [x] All runnable test cases pass: 85/85 green; the single skip is the documented infeasible leg (plugin-management step-1/load-error-reject — no deterministic main-process injection channel for a listPlugins first-load rejection; test.skip with recorded reason at spec line; gen-task record divergence — recorded, not masked)
- [x] Tests verify actual functional behavior — no placeholder tests, no always-pass mocks, no stub assertions that validate nothing (stubs only replace external CLI/channel actors via the documented seams)

## Notes
fix-1 history preserved in the record: first pass 82/86 with 3 root-caused production defects (A task-board structural-removal detail-dock error card; B wizard abandon-guard focus loss; C IPC error-envelope unparseable over real IPC — every code-keyed error face dead) routed to fix-1 (coding.fix, --block-source); fix-1 commit 9d95d87 fixed all three and verified 28/28 on the two affected journeys + unit 1162/1162; this completion pass re-ran the full 86-test suite green. Completion-pass flake: multi-project step-4 registry-rows assertion was order-sensitive over a contract-unspecified read (50% UUID coin-flip, previously lucky) — classified test-script bug, fixed intent-preserving, journey re-ran 17/17. Environment honored: no live dsh-forge instance during runs (single-instance pitfall — probed before every launch incl. in-spec restarts), isolated temp userData per fixture, pnpm build:plugins refreshed before the pass. Production read-only discipline (BIZ-task-ops-001) held everywhere. Attempt budget: 2 orchestration cycles this pass (multi-project-management ran twice: flake exposure + fix confirmation; all other journeys ran once).
