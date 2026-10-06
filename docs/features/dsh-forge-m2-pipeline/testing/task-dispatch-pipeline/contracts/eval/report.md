# Eval-contract Final Report — task-dispatch-pipeline

## Eval-contract Complete
**Final Score**: 991/1100 (target: 850)
**Iterations Used**: 1/1 (single-pass mode per `eval.contract.iterations=1`)

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 991 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| Completeness | 140/150 | 90 | ✅ |
| Semantic Purity | 185/200 | 120 | ✅ |
| Precondition Exclusivity | 120/150 | 90 | ✅ |
| Fact Alignment | 128/150 | 90 | ✅ |
| Surface Fitness | 93/100 | 60 | ✅ |
| Internal Consistency | 145/150 | 90 | ✅ |
| Anchor Integrity | 90/100 | 60 | ✅ |
| Fixture Specification | 90/100 | 60 | ✅ |

### Outcome
Target reached (991 ≥ 850), all dimensions above threshold — highest contract set score. Notable attacks: step-2 no-ready-tasks vs dependencies-unmet precondition overlap; ~15 outcome-level assertions lack fact_id/UNKNOWN marking; tool-face steps have empty page anchors without N/A adjudication notes. Full attack list with quotes: `eval/iteration-1.md`.
