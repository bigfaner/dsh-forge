# Eval-journey Final Report — overview-entry-new-session

## Eval-journey Complete
**Final Score**: 838/1150 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 838/1150 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 132/200 | 120 | ✅ |
| 2. Semantic Purity | 168/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 125/150 | 90 | ✅ |
| 4. Fact Alignment | 100/150 | 90 | ✅ |
| 5. Surface Fitness | 60/150 | 90 | ❌ |
| 6. Internal Consistency | 128/150 | 90 | ✅ |
| 7. Workflow Coverage | 125/150 | 90 | ✅ |
| **Total** | **838/1150** | **975 (rubric) / 850 (config)** | ❌ |

### Outcome
Target NOT reached — 1/1 iterations exhausted (single-pass mode; reviser not run).

Primary gap: **Surface Fitness 60/150 (below min 90)** — Web mandatory derived Outcomes (`validation-error` + `session-expired`) absent without non-applicability annotation. Secondary gaps: Fact Alignment (Step 4 mode-parenthetical copied from wrong AC channel — blitz branch unreachable per UF-3; unlabeled inferences), Completeness (failure-toast fixture unsupported — Setup lacks a structural-violation subgraph), Precondition Exclusivity (mutually-exclusive trigger branches bundled into single Expected Results without per-branch preconditions). Blindspots: 5s toast expiry/race semantics, draft collision between two consecutive open-session flows, Setup fixture semantic error (blocked/rejected are legal states, not structural violations).

Full attack list (10 items) in `eval/iteration-1.md`.
