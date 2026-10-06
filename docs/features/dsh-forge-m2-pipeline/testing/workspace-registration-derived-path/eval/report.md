# Eval-journey Final Report — workspace-registration-derived-path

## Eval-journey Complete
**Final Score**: 979/1150 (target: 850)
**Iterations Used**: 1/1 (single-pass mode per `eval.journey.iterations=1`)

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 979 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| Completeness | 174/200 | 120 | ✅ |
| Semantic Purity | 182/200 | 120 | ✅ |
| Precondition Exclusivity | 126/150 | 90 | ✅ |
| Fact Alignment | 116/150 | 90 | ✅ |
| Surface Fitness | 114/150 | 90 | ✅ |
| Internal Consistency | 148/150 | 90 | ✅ |
| Workflow Coverage | 119/150 | 90 | ✅ |

### Outcome
Target reached (979 ≥ 850), all dimensions above threshold — highest score of the set. Notable attacks: registration collision tri-state only 2/3 modeled (idempotent re-registration/attach missing vs BIZ-workspace-001/002); 3b/3c ambiguous pair on second bad re-selection. Full attack list with quotes: `eval/iteration-1.md`.
