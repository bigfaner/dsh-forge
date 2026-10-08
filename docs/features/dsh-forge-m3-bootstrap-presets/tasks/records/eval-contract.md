---
status: "completed"
started: "2026-10-08 14:08"
completed: "2026-10-08 15:24"
time_spent: "~1h 16m"
---

# Task Record: T-eval-contract Evaluate Contract Quality

## Summary
Evaluated all 9 Journeys' Contract suites (44 contract files / 112 outcomes) for dsh-forge-m3-bootstrap-presets via /eval-contract (forge:eval, contract rubric 1100pt 8-dimension, config target 850, iterations=1 single-pass). Scores: mode-selection-alignment 972, overview-entry-new-session 961, blitz-direct-chain 982, expedition-full-sdd-chain 963, proposal-review-mode-transition 964, worker-provisioning 890, preset-physical-isolation 1010, gate-and-submit-discipline 952, bootstrap-walkthrough 947. Average 958/1100; all 9 above config target 850; 5/9 meet the rubric pass condition (total >= 935 AND all dimensions >= min threshold). Each journey's contracts/eval/ has iteration-1.md (full adversarial attack list) and final-report.md (per-dimension threshold table). Scores recorded for informational review per task instructions (reviser not run: eval.contract.iterations = 1).

## Eval Score
- **Score**: 958/1000

## Findings
- 4/9 journeys fail the rubric pass condition on a single dimension threshold: overview-entry-new-session Fixture Specification 32/100 (task-hosting outcomes declare Task fixtures with no container entity — parentless tasks render in no pill, asserted surfaces unreachable), blitz-direct-chain Fact Alignment 88/90-threshold (fabricated event-bus side-effects code-verified false — createProposal/addTask/transitionProposal emit nothing on success; spec-skill enumeration 6-vs-7-vs-8), expedition-full-sdd-chain Fact Alignment 88/90-threshold (same fabricated proposal-domain event claims; proposal-row channel left dual — scan yields NULL mode killing the chain gate), worker-provisioning Fixture Specification 0/100 (entity-completeness veto — Session/WorkerSession entities missing from fixture_specs that reference them)
- Cross-cutting: fact_id traceability sparse suite-wide (several suites have zero formal citations despite substantively accurate claims); spec-skill enumeration consistently undercounts (omits eval — package has 8); empty page anchors on steps that operate on handbook pages; pseudo-fields on real entities (content_ready, blocked_reason, storage, relation) contradict schema facts
- Event-side-effect claims are the dominant hallucination class: proposal/task write verbs emit nothing on success (only dispatchTask five events + task-submitted + tool-error land in logs/{slug}.jsonl) — contracts asserting proposal-domain events would generate 100%-failing tests
- Fixture constructibility: dependency-cycle fixture unconstructible via addTask (ERR_CYCLE_DETECTED, zero partial writes — needs direct-seed path); fault_injection names no realization seam; restart outcomes leave harness ordering implicit
- 5/9 passing journeys carry non-blocking findings recorded in their final reports for gen-test-scripts awareness (observation channels, termination oracles, 500ms event latency tolerance for flake avoidance)

## Severity
- **Severity**: major

## Passed
- **Passed**: Yes

## Acceptance Criteria
- [x] Eval report generated for all Contracts (9/9 journeys, each with contracts/eval/iteration-1.md + final-report.md)

## Notes
Hard AC met: eval report generated for all contract suites. Scores informational per task instructions. The failing dimension in all 4 non-passing suites is actionable before gen-test-scripts: fabricated event side-effects (3 suites) and missing container/session entities in fixture_specs (2 suites). Anchor Integrity dimension scored with handbook present (design/page-map.md); Fact Table .forge/fact-table.json (139 entries) used for traceability checks. Surface = web per .forge/config.yaml; business-rules context injected per rubric frontmatter.
