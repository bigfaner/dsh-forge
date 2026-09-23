# Eval-journey Final Report: multi-project-management

> Evaluated by `forge:eval --type journey` (T-eval-journey, 2026-09-23). Scorer = [qa] expert (single); scale 1150 / target 975 / max 3 iterations; context = `docs/business-rules/*` (auto) + surface-web rules.

## Eval-journey Complete
**Final Score**: 1097/1150 (target: 975)
**Iterations Used**: 2/3

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 855 | — |
| 2 | 1097 | +242 |

### Dimension Breakdown (final)

| Dimension | Iteration 1 | Iteration 2 | Threshold | Result |
|-----------|-------------|-------------|-----------|--------|
| Completeness | 160/200 | 190/200 | ≥120 | PASS |
| Semantic Purity | 183/200 | 195/200 | ≥120 | PASS |
| Precondition Exclusivity | 105/150 | 144/150 | ≥90 | PASS |
| Fact Alignment | 62/150 | 145/150 | ≥90 | PASS |
| Surface Fitness | 97/150 | 144/150 | ≥90 | PASS |
| Internal Consistency | 128/150 | 142/150 | ≥90 | PASS |
| Workflow Coverage | 120/150 | 137/150 | ≥90 | PASS |

Golden Path veto: not triggered (5-step Story 5 sequence present in domain terms).

### Outcome
**Target reached.** Iteration 1 failed hard on Fact Alignment (62 < 90: −30 unclassified disjunctive behavior on duplicate registration, zero inference annotations) and Precondition Exclusivity (105: 2b/3b overlap −20, remove-active fork on unstated state). Revision resolved 8/9 fully with artifact-verified citations (ERR_PROJECT_EXISTS, code_root UNIQUE, sc5 e2e lost-card/pointer-cleared 口径, FK CASCADE) and 1 partially (dangling deferral — see residual).

Residual deductions (iteration-2 report, non-blocking): deferral names feature-board-docs-browsing as owner of the UF1 编辑模式/重指向 leg, which that journey does not contain (−Internal Consistency); 2b/2c compound-state precedence unstated; 4b observation locus unstated; 5b 挂接非残留 clause beyond cited evidence (needs FK CASCADE basis or scope-down); storage vocabulary in expected results; validation-error mapping omits 2c as third instance; no restart leg behind 持久化 claim.

**Family-level blindspot carried forward (iteration-2 scorer, grep-verified across all six journeys): UF1 edit/repoint workflow (`updateProject` repoint, exercised by sc5 e2e) is unowned by any journey.** Consolidate-specs / M3 candidate.

Eval-skipped flag: not applicable (score parsed successfully on both iterations).
