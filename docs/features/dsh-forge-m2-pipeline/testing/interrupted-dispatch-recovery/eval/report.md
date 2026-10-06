# Eval-journey Final Report — interrupted-dispatch-recovery

## Eval-journey Complete
**Final Score**: 874/1150 (target: 850)
**Iterations Used**: 1/1 (single-pass mode per `eval.journey.iterations=1`)

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 874 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| Completeness | 157/200 | 120 | ✅ |
| Semantic Purity | 185/200 | 120 | ✅ |
| Precondition Exclusivity | 121/150 | 90 | ✅ |
| Fact Alignment | 109/150 | 90 | ✅ |
| Surface Fitness | 75/150 | 90 | ❌ |
| Internal Consistency | 119/150 | 90 | ✅ |
| Workflow Coverage | 108/150 | 90 | ✅ |

### Outcome
Target reached (874 ≥ 850). One dimension below threshold: **Surface Fitness 75/150** — web-mandatory derived outcomes absent/unmapped and zero browser-observable steps on a declared web surface. Notable blindspots: digest-inequality assertion may be non-deterministic; zombie-executor late-submit path untested. Full attack list with quotes: `eval/iteration-1.md`.
