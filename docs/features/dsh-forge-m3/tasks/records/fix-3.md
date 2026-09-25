---
status: "completed"
started: "2026-09-25 21:44"
completed: "2026-09-25 21:51"
time_spent: "~7m"
---

# Task Record: fix-3 fix unit-test: just unit-test failure in quality gate

## Summary
Third gate flap of the same environmental root cause (fix-1 verdict, commit 3182e9e): both gate-reported test failures are OOM collateral, proven green in isolation (tests/verify-plugins.spec.ts 54/54 and apps/desktop/tests/e2e-stub-cli.spec.ts 10/10, exit code 0 each). Applied the durable mitigation so the uncapped `just unit-test` lane stops OOM-flapping on this 16-core/32GB box: VITEST_MAX_WORKERS=4 pinned in the justfile unit-test recipe (smallest blast radius; vitest 4.1.11 resolveConfig honors the env var, verified in node_modules/vitest/dist/chunks/coverage.DM_a_rWm.js:380). Full unit gate rerun green via the actual recipe path after the change: `just unit-test` -> 115 files / 1802 tests passed, exit 0, 35.92s (consistent with fix-1's capped-pool measurement of 37.75s - negligible cost). Config-only change; zero production/test code modified.

## Type Reclassification
- Original: coding.fix
- Actual: coding.cleanup
- Reason: Root cause was environmental (OS commit exhaustion under vitest's default ~15-fork parallelism, verdict established by fix-1), not a code bug; the deliverable is collateral-exoneration evidence plus a config-level durable mitigation (justfile worker cap) - fix-1's record explicitly deferred this permanent cap as a follow-up, landed here after the third flap

## Changes

### Files Created
无

### Files Modified
- justfile
- docs/features/dsh-forge-m3/tasks/fix-3.md

### Key Decisions
- Env prefix (VITEST_MAX_WORKERS=4) inside the justfile recipe over a vitest.config.ts maxWorkers change: smallest blast radius (only the unit-test lane, not targeted/agent runs), honored end-to-end through just->pnpm->vitest, and proven by fix-1's green submit which used exactly this env var
- Kept fix-2/fix-4 (pending duplicates of the same failure) untouched per dispatcher instruction - they are expected to be resolved as duplicates once this durable fix lands
- fix-3.md frontmatter surgery for the submit gate (known forge-cli quirk): removed the auto-injected surface-key "."/surface-type that panics RunGate recipe resolution, added unchecked AC items to satisfy index validation, rebuilt index via `forge task index --feature dsh-forge-m3` (fix-3 entry now clean; status in_progress preserved)

## Test Results
- **Tests Executed**: Yes
- **Passed**: 1802
- **Failed**: 0
- **Coverage**: 0.0%

## Acceptance Criteria
- [x] Both gate-reported failures confirmed green in isolation: tests/verify-plugins.spec.ts 54/54 and apps/desktop/tests/e2e-stub-cli.spec.ts 10/10, exit 0 each - collateral of OS commit exhaustion, not code defects (same verdict as fix-1, commit 3182e9e)
- [x] Durable mitigation applied in the unit-test lane: VITEST_MAX_WORKERS=4 pinned in the justfile unit-test recipe with an evidence comment (smallest blast radius; env var honored by vitest 4.1.11 resolveConfig)
- [x] Full unit gate green via the actual recipe path after the change: just unit-test -> 115 files / 1802 tests passed, exit 0, ~36s
- [x] No production or test code modified - fix is config-only (justfile), consistent with the environmental root-cause verdict

## Notes
Evidence: isolation runs (54/54 exit 0; 10/10 exit 0); full gate via recipe (115/1802, exit 0, 35.92s); pre-run environment probe - zero live dsh-forge dev/electron instances, port 19387 free, 17GB of 31.3GB free physical memory (gate originally ran at ~4GB). Gate capture tests/results/unit-raw-output.txt shows the fix-1 signatures: FATAL ERROR Zone Allocation failed, WARN_HOST_SHUTDOWN_TIMEOUT, exit 127. Index rebuild reports fix-2/fix-4 (0 ACs, surface-key ".") as pre-existing validation errors - out of scope for this task, dispatcher resolves those tasks as duplicates.
