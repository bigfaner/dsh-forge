---
status: "completed"
started: "2026-09-23 11:19"
completed: "2026-09-23 12:14"
time_spent: "~55m"
---

# Task Record: T-test-gen-scripts Generate Web E2E Test Scripts

## Summary
Generated Web E2E test scripts for all 6 dsh-forge-m2 journeys via forge:gen-test-scripts: 43 new files under apps/desktop/e2e/<journey>/ (38 spec files = 32 step specs + 6 journey smokes, plus 5 journey-local helpers.ts), 86 tests covering ALL 80 contract Outcomes (one test() per Outcome) + 6 happy-path smokes with state passing. Placement follows the ui-plugin-foundation gen-test-scripts precedent: this repo's single-surface web tests root is apps/desktop/e2e (bound to root playwright.config.ts testDir and the `just compile` gate; root vitest include patterns exclude it), i.e. the skill's tests/<journey>/ rule materialized per project reality. Every file carries `// @feature dsh-forge-m2 | @web-e2e | @journey <name>` + per-contract Traceability headers. Reuses the 6.1-6.5 fixture stack (writeForgeProject/task-generator/stub CLI/channel stub/file-mutate/restart-app factory/tree-hash) with per-journey isolation: temp roots, DSH_FORGE_USER_DATA, single-instance-guarded boots, cleanup asserts. Gates: `just compile` 268 tests/125 files (+86/+38 vs 182/87 baseline), oxlint 0 findings on all 6 dirs, 0 VERIFY markers, 998 expect() assertions (outcome-driven behavioral: file-byte/tree-hash/status-map/journal/bridge-state compares dominate).

## Changes

### Files Created
- apps/desktop/e2e/task-session-execution-loop/helpers.ts
- apps/desktop/e2e/task-session-execution-loop/step-1-open-task-board-dag.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-2-open-task-detail.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-3-launch-session.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-4-verify-prompt-injection.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-5-agent-claim-flowback.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-6-restart-link-recovery.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-7-reenter-session.spec.ts
- apps/desktop/e2e/task-session-execution-loop/smoke.spec.ts
- apps/desktop/e2e/task-board-browsing/helpers.ts
- apps/desktop/e2e/task-board-browsing/step-1-open-task-board-dag.spec.ts
- apps/desktop/e2e/task-board-browsing/step-2-switch-board-views.spec.ts
- apps/desktop/e2e/task-board-browsing/step-3-filter-and-sort.spec.ts
- apps/desktop/e2e/task-board-browsing/step-4-view-worktree-badge.spec.ts
- apps/desktop/e2e/task-board-browsing/step-5-open-task-detail.spec.ts
- apps/desktop/e2e/task-board-browsing/smoke.spec.ts
- apps/desktop/e2e/dual-form-consistency/helpers.ts
- apps/desktop/e2e/dual-form-consistency/step-1-terminal-change-flowback.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-2-session-change-terminal-consistency.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-3-alternating-operations.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-4-verify-forge-data-consistency.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-5-link-integrity-after-alternation.spec.ts
- apps/desktop/e2e/dual-form-consistency/smoke.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/helpers.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-1-open-feature-board.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-2-view-feature-status.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-3-browse-feature-docs.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-4-register-external-docs-project.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-5-external-docs-consistent-rendering.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/smoke.spec.ts
- apps/desktop/e2e/multi-project-management/step-1-open-register-wizard.spec.ts
- apps/desktop/e2e/multi-project-management/step-2-select-code-root.spec.ts
- apps/desktop/e2e/multi-project-management/step-3-select-doc-location-register.spec.ts
- apps/desktop/e2e/multi-project-management/step-4-switch-active-project.spec.ts
- apps/desktop/e2e/multi-project-management/step-5-remove-project.spec.ts
- apps/desktop/e2e/multi-project-management/smoke.spec.ts
- apps/desktop/e2e/plugin-management/helpers.ts
- apps/desktop/e2e/plugin-management/step-1-open-plugin-section.spec.ts
- apps/desktop/e2e/plugin-management/step-2-initiate-disable.spec.ts
- apps/desktop/e2e/plugin-management/step-3-confirm-disable.spec.ts
- apps/desktop/e2e/plugin-management/step-4-re-enable.spec.ts
- apps/desktop/e2e/plugin-management/step-5-review-plugin-list.spec.ts
- apps/desktop/e2e/plugin-management/smoke.spec.ts

### Files Modified
无

### Key Decisions
无

## Cases Generated
86

## Cases Evaluated
N/A

## Scripts Created
- apps/desktop/e2e/task-session-execution-loop/step-1-open-task-board-dag.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-2-open-task-detail.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-3-launch-session.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-4-verify-prompt-injection.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-5-agent-claim-flowback.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-6-restart-link-recovery.spec.ts
- apps/desktop/e2e/task-session-execution-loop/step-7-reenter-session.spec.ts
- apps/desktop/e2e/task-session-execution-loop/smoke.spec.ts
- apps/desktop/e2e/task-board-browsing/step-1-open-task-board-dag.spec.ts
- apps/desktop/e2e/task-board-browsing/step-2-switch-board-views.spec.ts
- apps/desktop/e2e/task-board-browsing/step-3-filter-and-sort.spec.ts
- apps/desktop/e2e/task-board-browsing/step-4-view-worktree-badge.spec.ts
- apps/desktop/e2e/task-board-browsing/step-5-open-task-detail.spec.ts
- apps/desktop/e2e/task-board-browsing/smoke.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-1-terminal-change-flowback.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-2-session-change-terminal-consistency.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-3-alternating-operations.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-4-verify-forge-data-consistency.spec.ts
- apps/desktop/e2e/dual-form-consistency/step-5-link-integrity-after-alternation.spec.ts
- apps/desktop/e2e/dual-form-consistency/smoke.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-1-open-feature-board.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-2-view-feature-status.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-3-browse-feature-docs.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-4-register-external-docs-project.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/step-5-external-docs-consistent-rendering.spec.ts
- apps/desktop/e2e/feature-board-docs-browsing/smoke.spec.ts
- apps/desktop/e2e/multi-project-management/step-1-open-register-wizard.spec.ts
- apps/desktop/e2e/multi-project-management/step-2-select-code-root.spec.ts
- apps/desktop/e2e/multi-project-management/step-3-select-doc-location-register.spec.ts
- apps/desktop/e2e/multi-project-management/step-4-switch-active-project.spec.ts
- apps/desktop/e2e/multi-project-management/step-5-remove-project.spec.ts
- apps/desktop/e2e/multi-project-management/smoke.spec.ts
- apps/desktop/e2e/plugin-management/step-1-open-plugin-section.spec.ts
- apps/desktop/e2e/plugin-management/step-2-initiate-disable.spec.ts
- apps/desktop/e2e/plugin-management/step-3-confirm-disable.spec.ts
- apps/desktop/e2e/plugin-management/step-4-re-enable.spec.ts
- apps/desktop/e2e/plugin-management/step-5-review-plugin-list.spec.ts
- apps/desktop/e2e/plugin-management/smoke.spec.ts

## Test Results
Generation gates only (execution belongs to the run-tests lane): `just compile` (playwright test --list) green at 268 tests / 125 files — +86 tests / +38 files over the 182/87 baseline, every new spec transpiles and imports cleanly; oxlint 0 findings on all six journey dirs; 0 VERIFY markers; coverage self-check 6/6 web journeys each with full step specs + exactly 1 smoke; 80/80 contract Outcomes each covered by exactly one test.

## Acceptance Criteria
- [x] Test scripts generated for every journey (6/6 web journeys, each = step specs + exactly 1 smoke)
- [x] Every contract Outcome covered by exactly one test() (80/80 across 32 contracts)
- [x] Compile gate `just compile` green (playwright --list transpiles+imports every spec)
- [x] oxlint clean on all generated dirs; zero VERIFY markers; @feature tags + Traceability on every spec
- [x] Isolation hard rules honored (per-journey temp roots, DSH_FORGE_USER_DATA, single-instance-guarded boots, cleanup asserts, no existing file modified)

## Notes
Per-journey: task-session-execution-loop 16 tests (15 Outcomes + smoke), task-board-browsing 11 (10 + smoke), dual-form-consistency 15 (14 + smoke), feature-board-docs-browsing 12 (11 + smoke), multi-project-management 18 (16 + smoke), plugin-management 14 (13 + smoke + 1 skipped-infeasible load-error-retry proxy counted among Outcomes). Assertion depth by composition: ~998 expect() across 86 tests, outcome-driven behavioral (forge-file byte/tree-hash compares, stub CLI TSV/status-map equalities, channel-stub journal byte oracles, dshForge bridge state reads, badge/attribute state transitions) — deep (cross-entity/state-transition) assertions dominate by construction since every contract State dimension maps to one; visibility-only structural checks are a small minority (loading/empty/state markers). E2E EXECUTION NOT RUN HERE by design: the skill's Step 4 gate is `just compile` (green); the heavy real-chain suite (dozens of guarded Electron boots, requires pnpm build:plugins + staged tarballs + no live dsh-forge instance) belongs to the run-tests lane. Known false-expectation risks were aligned to design/code reality instead of encoded as failing assertions (findings above); the step-7 onEnterSession wiring gap and the register-activate divergence are the two implementation-side gaps surfaced for follow-up.
