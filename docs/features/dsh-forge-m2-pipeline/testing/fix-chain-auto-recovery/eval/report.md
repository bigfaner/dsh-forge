# Eval-journey Final Report — fix-chain-auto-recovery

## Eval-journey Complete
**Final Score**: 951/1150 (target: 850)
**Iterations Used**: 1/1 (single-pass mode per `eval.journey.iterations=1`)

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 951 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| Completeness | 158/200 | 120 | ✅ |
| Semantic Purity | 177/200 | 120 | ✅ |
| Precondition Exclusivity | 135/150 | 90 | ✅ |
| Fact Alignment | 122/150 | 90 | ✅ |
| Surface Fitness | 102/150 | 90 | ✅ |
| Internal Consistency | 131/150 | 90 | ✅ |
| Workflow Coverage | 126/150 | 90 | ✅ |

### Outcome
Target reached (951 ≥ 850), all dimensions above threshold. Notable attacks: missing duplicate/retry boundary for `addTask --block-source`, chain-depth boundary tested only above limit (never at limit), web `session-expired` derived outcome absent. Full attack list with quotes: `eval/iteration-1.md`.
