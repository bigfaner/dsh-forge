---
status: "completed"
started: "2026-10-07 03:50"
completed: "2026-10-07 04:14"
time_spent: "~24m"
---

# Task Record: T-eval-contract Evaluate Contract Quality

## Summary
Evaluated Contract quality for all 7 journeys of dsh-forge-m2-pipeline (33 contract files) via the 1100-point 8-dimension rubric (single-pass, target 850, iterations 1 per forge config). Scores: task-dispatch-pipeline 991, fix-chain-auto-recovery 957, workspace-registration-derived-path 944, task-session-linkage 913, task-overview-review 912, interrupted-dispatch-recovery 857, document-browsing 856 (average 919). All 7 >= 850 score gate. Per-journey scorer reports at testing/<journey>/contracts/eval/iteration-1.md; final reports with dimension threshold tables at testing/<journey>/contracts/eval/report.md.

## Eval Score
- **Score**: 919/1000

## Findings
- Fixture Specification below 60 threshold on 2/7 (entity-completeness veto): task-overview-review 0/100 (step-5 omits Feature+TaskRecord although State writes both; lossy bottom fixture blocks) and document-browsing 0/100 (step-5 references Proposal entity not declared in fixture_spec.entities)
- Systemic: web page anchors empty or non-matching on tool-face steps and free-text page values (task-dispatch-pipeline 5 files page:""; workspace-registration page values not matching handbook identifier 注册表单派生行)
- Systemic: sparse fact_id traceability across contracts; inferred outcomes often missing source:inferred + rule citation
- interrupted-dispatch-recovery 3b blocked-claim rejection assertion refuted by code (blocked→in_progress is a legal agent edge) — top-priority correctness fix before test-script generation
- task-session-linkage Precondition Exclusivity at exact threshold 90 (success precondition overlaps 3 boundary outcomes)

## Severity
- **Severity**: major

## Passed
- **Passed**: Yes

## Acceptance Criteria
- [x] Eval report generated for all Contracts (7/7 journeys, 33 files)
- [x] Eval executed per forge config (target 850, iterations 1)

## Notes
All 7 journeys clear the 850 score gate so gen-test-scripts may proceed. Two journeys carry Fixture Specification veto (0/100) below the rubric's 60 dimension threshold — recorded as below-threshold findings; config sets iterations=1 so no revise pass ran. Recommend feeding the systemic fixture-entity and anchor findings back to gen-contracts conventions.
