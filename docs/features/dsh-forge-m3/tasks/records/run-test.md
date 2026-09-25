---
status: "completed"
started: "2026-09-25 15:15"
completed: "2026-09-25 18:46"
time_spent: "~3h 31m"
---

# Task Record: T-test-run Run Web E2E Test

## Summary
Ran the full staged web e2e suite (8 journeys / 107 tests, Playwright forge-m3-e2e lane) to green: 107/107 passed, 0 failed, 0 skipped, certified in one coherent end-to-end lane. Root-caused and fixed every failure encountered: 3 confirmed production defects (migration terminal state losing the backup location on fast migrations via the racy lastEvent readback; later-created doc roots never watched breaking the <=5s reflux for the first external proposal; stage-assets panel not refluxing watcher-driven sync events) and a series of generated-test-script bugs (invented forge CLI forms, dead stdout captures, self-contradictory baselines, constant-true assertions, wrong/malformed selectors, navigation-state assumptions, out-of-vocab fixture statuses, drift YAML breaking the host overlay parser) plus shared-harness robustness fixes (relaunch activate/overview handling, Windows tree-kill in killLive, dispatchFromBoard stray-modal + chain-idle guards).

## Changes

### Files Created
无

### Files Modified
- apps/desktop/src/main/workbench/migration/pipeline.ts
- apps/desktop/src/main/workbench/ipc/types.ts
- apps/desktop/src/main/workbench/watcher/watch.ts
- packages/plugins/forge-workbench/src/client/ipc-types.ts
- packages/plugins/forge-workbench/src/client/views/overview/migration/MigrateProgressDialog.tsx
- packages/plugins/forge-workbench/src/client/views/features/stages/StageAssetsTab.tsx
- packages/plugins/forge-workbench/src/client/mocks/workbench.ts
- apps/desktop/tests/workbench-watcher.spec.ts
- tests/e2e/specs/_lib/journey-world.ts
- tests/e2e/specs/dual-form-transition/harness.ts
- tests/e2e/specs/dual-form-transition/smoke.spec.ts
- tests/e2e/specs/dual-form-transition/step-1-cli-unregistered-pipeline.spec.ts
- tests/e2e/specs/dual-form-transition/step-2-app-channel-zero-plugin.spec.ts
- tests/e2e/specs/dual-form-transition/step-3-alternating-interop.spec.ts
- tests/e2e/specs/explicit-sot-migration/smoke.spec.ts
- tests/e2e/specs/explicit-sot-migration/step-2-migration-confirm.spec.ts
- tests/e2e/specs/explicit-sot-migration/step-3-atomic-migration-execution.spec.ts
- tests/e2e/specs/out-of-repo-docs-root/harness.ts
- tests/e2e/specs/out-of-repo-docs-root/smoke.spec.ts
- tests/e2e/specs/out-of-repo-docs-root/step-2-complete-external-registration.spec.ts
- tests/e2e/specs/out-of-repo-docs-root/step-3-assets-land-doc-root.spec.ts
- tests/e2e/specs/out-of-repo-docs-root/step-4-in-repo-compat.spec.ts
- tests/e2e/specs/preferences-tiered-override/step-3-modify-feature-value.spec.ts
- tests/e2e/specs/proposal-board-browsing/harness.ts
- tests/e2e/specs/proposal-board-browsing/step-2-proposal-detail-eval.spec.ts
- tests/e2e/specs/proposal-board-browsing/step-3-badge-crossjump.spec.ts
- tests/e2e/specs/session-native-ops-skill-addressing/step-1-session-task-query.spec.ts
- tests/e2e/specs/session-native-ops-skill-addressing/step-2-session-task-claim.spec.ts
- tests/e2e/specs/session-native-ops-skill-addressing/step-3-session-task-submit.spec.ts
- tests/e2e/specs/session-native-ops-skill-addressing/step-4-skill-flat-addressing.spec.ts
- tests/e2e/specs/stage-gates-cross-phase-context/step-1-stepper-gate-view.spec.ts
- tests/e2e/specs/stage-gates-cross-phase-context/step-3-generate-stage-summary.spec.ts
- tests/e2e/specs/stage-gates-cross-phase-context/step-4-advance-success.spec.ts
- tests/e2e/specs/stage-gates-cross-phase-context/step-5-asset-panel-browse.spec.ts
- tests/e2e/specs/stage-gates-cross-phase-context/step-6-new-stage-injection.spec.ts
- tests/e2e/specs/stage-gates-cross-phase-context/step-7-external-deviation.spec.ts
- tests/e2e/specs/task-dispatch-execution-loop/smoke.spec.ts
- tests/e2e/specs/task-dispatch-execution-loop/step-1-board-browse-multiselect.spec.ts
- tests/e2e/specs/task-dispatch-execution-loop/step-2-dispatch-artifacts-check.spec.ts
- docs/features/dsh-forge-m3/testing/results/latest.md

### Key Decisions
无

## Cases Generated
107

## Cases Evaluated
107

## Scripts Created
无

## Test Results
107/107 passed, 0 failed, 0 skipped (final coherent lane: dual-form-transition 13, explicit-sot-migration 13, out-of-repo-docs-root 13, preferences-tiered-override 12, proposal-board-browsing 8, session-native-ops-skill-addressing 13, stage-gates-cross-phase-context 15, task-dispatch-execution-loop 20; zero instance-lock bypasses; real Electron shell + kernel sqlite + real forge CLI + real watcher throughout)

## Acceptance Criteria
- [x] All test cases MUST pass — no skipped tests, no expected failures, no TODO placeholders
- [x] Tests MUST verify actual functional behavior — no placeholder tests, no always-pass mocks, no stub assertions that validate nothing

## Notes
Attempt 2 (attempt 1 was environmentally blocked by the user's dev instance holding port 19387; instance closed with approval, port verified free pre-run). Three production defects were confirmed against contract/product intent before modifying production code (backup-path race in useMigrationRun + MigrationStatus.backupPath stable readback; resolveWatchRoots parent-dir fallback for later-created doc roots, watcher unit tests updated + dedicated fallback test added; StageAssetsTab sync-event reflux). All test-assertion semantics preserved in script-bug fixes — no assertions weakened to pass. Related unit suites re-run green after each production change (migration pipeline/ipc/dialogs/integrate 75/75; watcher 21/21; reingest 10/10; stage-uf2 19/19). Two test-run orphans (crashed relaunch legs) were identified as this run's own processes via the PowerShell probe and killed. Full report: docs/features/dsh-forge-m3/testing/results/latest.md.
