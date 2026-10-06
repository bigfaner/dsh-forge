# Eval-journey Final Report — task-session-linkage

## Eval-journey Complete
**Final Score**: 1023/1150 (target: 850)
**Iterations Used**: 1/1 (single-pass mode per `eval.journey.iterations=1`)

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 1023 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| Completeness | 186/200 | 120 | ✅ |
| Semantic Purity | 170/200 | 120 | ✅ |
| Precondition Exclusivity | 136/150 | 90 | ✅ |
| Fact Alignment | 128/150 | 90 | ✅ |
| Surface Fitness | 133/150 | 90 | ✅ |
| Internal Consistency | 138/150 | 90 | ✅ |
| Workflow Coverage | 132/150 | 90 | ✅ |

### Outcome
**Target reached** (1023 ≥ 850, single iteration). All dimensions above their min thresholds — including the previously failing **Surface Fitness (64 → 133)**: the web-mandatory derived outcomes (`validation-error`, `session-expired`) are now explicitly adjudicated N/A with rule citation, and web boundary depth was added (overflow-menu interaction, N=2 exact boundary, re-claim dedup render, live pill update on new claim). Prior fact-alignment defects resolved: list sub-row (挂接计数) vs drawer (双源分型) split into distinct steps; the 执行-type pill is exercised via the executor sub-session step; `source: inferred` annotations added for derived claims. This supersedes the 846/1150 failing report from the pre-fix run (fix-1). Remaining minor deductions documented in `eval/iteration-1.md` (Step 5 sub-session UI reachability assumption, mechanism leakage in 3e wording, task-side zero-link boundary) — none below threshold; safe to proceed to gen-contracts.
