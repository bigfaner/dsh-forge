---
status: "completed"
started: "2026-10-03 03:52"
completed: "2026-10-03 04:14"
time_spent: "~22m"
---

# Task Record: T-test-gen-contracts Generate Test Contracts

## Summary
Generated test Contract specifications for all 6 journeys of dsh-forge-p1-mvp via /gen-contracts: 33 contract files (one per Step), 76 Outcomes total with six-dimension declarations, per-Outcome fixture_spec, web anchors from page-map.md handbook, and a 42-entry cited static Fact Table at .forge/fact-table.json. Schema validation passed on first pass (0 issues).

## Changes

### Files Created
- .forge/fact-table.json
- docs/features/dsh-forge-p1-mvp/testing/project-registration/contracts/step-1-open-add-project-modal.md
- docs/features/dsh-forge-p1-mvp/testing/project-registration/contracts/step-2-select-workspace-directory.md
- docs/features/dsh-forge-p1-mvp/testing/project-registration/contracts/step-3-review-register-form.md
- docs/features/dsh-forge-p1-mvp/testing/project-registration/contracts/step-4-confirm-registration.md
- docs/features/dsh-forge-p1-mvp/testing/project-registration/contracts/step-5-registration-success-mount.md
- docs/features/dsh-forge-p1-mvp/testing/project-registration-compensation/contracts/step-1-initiate-new-workspace-registration.md
- docs/features/dsh-forge-p1-mvp/testing/project-registration-compensation/contracts/step-2-dsh-create-workspace.md
- docs/features/dsh-forge-p1-mvp/testing/project-registration-compensation/contracts/step-3-appdb-write-failure-compensation.md
- docs/features/dsh-forge-p1-mvp/testing/project-registration-compensation/contracts/step-4-failure-feedback.md
- docs/features/dsh-forge-p1-mvp/testing/project-registration-compensation/contracts/step-5-compensation-idempotency.md
- docs/features/dsh-forge-p1-mvp/testing/session-workbench/contracts/step-1-workbench-first-screen.md
- docs/features/dsh-forge-p1-mvp/testing/session-workbench/contracts/step-2-new-session-roundtrip.md
- docs/features/dsh-forge-p1-mvp/testing/session-workbench/contracts/step-3-trace-tab-ledger.md
- docs/features/dsh-forge-p1-mvp/testing/session-workbench/contracts/step-4-restore-session.md
- docs/features/dsh-forge-p1-mvp/testing/session-workbench/contracts/step-5-view-switch-state-retention.md
- docs/features/dsh-forge-p1-mvp/testing/session-workbench/contracts/step-6-project-switch-dock-follow.md
- docs/features/dsh-forge-p1-mvp/testing/knowledge-browsing/contracts/step-1-enter-knowledge-view.md
- docs/features/dsh-forge-p1-mvp/testing/knowledge-browsing/contracts/step-2-domain-tree-prefix-filter.md
- docs/features/dsh-forge-p1-mvp/testing/knowledge-browsing/contracts/step-3-keyword-refine.md
- docs/features/dsh-forge-p1-mvp/testing/knowledge-browsing/contracts/step-4-open-detail-drawer.md
- docs/features/dsh-forge-p1-mvp/testing/knowledge-browsing/contracts/step-5-close-drawer-return.md
- docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/contracts/step-1-register-project-with-knowledge.md
- docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/contracts/step-2-initiate-dsh-session.md
- docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/contracts/step-3-ask-domain-question.md
- docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/contracts/step-4-agentic-search-chain.md
- docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/contracts/step-5-answer-from-knowledge.md
- docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/contracts/step-6-trace-chain-order.md
- docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/contracts/step-7-recall-tab-entry.md
- docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/contracts/step-8-heat-badge-loop.md
- docs/features/dsh-forge-p1-mvp/testing/installer-smoke/contracts/step-1-run-installer.md
- docs/features/dsh-forge-p1-mvp/testing/installer-smoke/contracts/step-2-launch-installed-app.md
- docs/features/dsh-forge-p1-mvp/testing/installer-smoke/contracts/step-3-main-screen-reachable.md
- docs/features/dsh-forge-p1-mvp/testing/installer-smoke/contracts/step-4-session-panel-usable.md

### Files Modified
无

### Key Decisions
无

## Cases Generated
76

## Cases Evaluated
76

## Scripts Created
无

## Test Results
76 Outcomes across 33 Contract files (per journey: project-registration 14, project-registration-compensation 13, session-workbench 12, knowledge-browsing 11, knowledge-recall-flywheel 18, installer-smoke 8). Schema validation (mandatory dimensions, fixture_spec entities min_count>=1, semantic purity, outcome name uniqueness, precondition exclusivity spot-check, journey invariants >=1, ISO anchor sync) passed 0 issues on first pass. Density checkpoints: 5/6 journeys ON_TARGET; knowledge-browsing ABOVE_TARGET (11 vs Low 4-7) due to journey-mandated edge cases from eval-passed journey document, documented in-contract as required-outcome override.

## Acceptance Criteria
- [x] At least 1 Contract file generated per Journey
- [x] Each Contract has six-dimension declarations with semantic descriptors (no regex)
- [x] Risk-driven Outcome density targets met per Journey risk level
- [x] Fact Table written to .forge/fact-table.json
- [x] All Contracts passed schema validation

## Notes
Eval gate (breakdown mode): all 6 journeys have eval/final.md scores 993-1116 >= target 850 and pass line 975. scriptsCreated is empty by design: gen-contracts emits Contract specs only (skill HARD-GATE restricts output to testing/<journey>/contracts/); executable scripts belong to the downstream gen-test-scripts task. Web anchors filled from design/page-map.md (fresh vs tech-design, both 2026-10-02); OS-level steps (installer 1-2, compensation step-5) leave anchors empty per no-guess rule. Code reconnaissance surfaced 5 fact tensions, annotated in contracts (fact-note comments) and in the Fact Table (FACT-TENSION subjects) for eval-contract and design review: (1) journey fault-injection vocabulary test.setFault is a test-infrastructure contract, not shipped code (unit seams: StubRegistry + ws_path UNIQUE seeding); (2) knowledge recall counting: shipped code records per-tool-call events (a chain = search+read-abstract = 2 groups/rows) while journeys pin chain=1 口径 for 召回次数/覆盖/热度 — intentional defect-signal design per journey invariant; (3) reconcileAtStartup is channel-exposed only, no startup auto-invocation wired (compensation 4b/5c expectation); (4) knowledge index rebuild fires only on zero-row cache — no stale-detect background rebuild (knowledge-browsing 1c phase 2); (5) shipped dock registers only the global tab — project-level tabs need the journey's fixture preseed seam.
