# Eval-contract Final Report — interrupted-dispatch-recovery

## Eval-contract Complete
**Final Score**: 857/1100 (target: 850)
**Iterations Used**: 1/1 (single-pass mode per `eval.contract.iterations=1`)

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 857 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| Completeness | 135/150 | 90 | ✅ |
| Semantic Purity | 175/200 | 120 | ✅ |
| Precondition Exclusivity | 120/150 | 90 | ✅ |
| Fact Alignment | 95/150 | 90 | ✅ |
| Surface Fitness | 80/100 | 60 | ✅ |
| Internal Consistency | 110/150 | 90 | ✅ |
| Anchor Integrity | 70/100 | 60 | ✅ |
| Fixture Specification | 72/100 | 60 | ✅ |

### Outcome
Target reached (857 ≥ 850), all dimensions above threshold — but lowest of the set with thin margin. **Critical attack**: 3b's blocked-claim rejection assertion is refuted by code (state-machine blocked→in_progress is a legal agent edge — claim would succeed); must split blocked into its own Outcome or narrow the precondition. Also: fixture declares Task parent_entity Project while ER says Feature; digest-new-value assertion unreliable without forced-increment condition. Full attack list with quotes: `eval/iteration-1.md`.
