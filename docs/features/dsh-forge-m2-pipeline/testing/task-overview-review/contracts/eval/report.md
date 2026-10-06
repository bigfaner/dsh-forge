# Eval-contract Final Report — task-overview-review

## Eval-contract Complete
**Final Score**: 912/1100 (target: 850)
**Iterations Used**: 1/1 (single-pass mode per `eval.contract.iterations=1`)

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 912 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| Completeness | 150/150 | 90 | ✅ |
| Semantic Purity | 178/200 | 120 | ✅ |
| Precondition Exclusivity | 130/150 | 90 | ✅ |
| Fact Alignment | 134/150 | 90 | ✅ |
| Surface Fitness | 85/100 | 60 | ✅ |
| Internal Consistency | 135/150 | 90 | ✅ |
| Anchor Integrity | 100/100 | 60 | ✅ |
| Fixture Specification | 0/100 | 60 | ❌ |

### Outcome
Target reached (912 ≥ 850). One dimension below threshold: **Fixture Specification 0/100 — entity-completeness veto**: step-5 fixture_specs omit Feature and TaskRecord although success State writes both and tasks.feature_id NOT NULL makes Feature mandatory for any Task fixture; bottom "## Fixture Specification" summary blocks are lossy/divergent vs inline per-Outcome specs. Illegal-target rejection Outcome not executable on web surface without a bypass channel. Full attack list with quotes: `eval/iteration-1.md`.
