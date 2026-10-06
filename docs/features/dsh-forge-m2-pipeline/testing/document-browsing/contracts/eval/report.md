# Eval-contract Final Report — document-browsing

## Eval-contract Complete
**Final Score**: 856/1100 (target: 850)
**Iterations Used**: 1/1 (single-pass mode per `eval.contract.iterations=1`)

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 856 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| Completeness | 135/150 | 90 | ✅ |
| Semantic Purity | 162/200 | 120 | ✅ |
| Precondition Exclusivity | 130/150 | 90 | ✅ |
| Fact Alignment | 107/150 | 90 | ✅ |
| Surface Fitness | 87/100 | 60 | ✅ |
| Internal Consistency | 145/150 | 90 | ✅ |
| Anchor Integrity | 90/100 | 60 | ✅ |
| Fixture Specification | 0/100 | 60 | ❌ |

### Outcome
Target reached (856 ≥ 850) with thin margin. One dimension below threshold: **Fixture Specification 0/100 — entity-completeness veto**: step-5 references Proposal entity (proposals 子 tab browsing) but fixture_spec.entities omits it. Also: step-4 out-of-registry rejection acknowledged in prose but never materialized as an Outcome (and contradicts the step's validation-error N/A adjudication); ERR_DOC_PATH_INVALID attribution to openExternal not backed by fact table. Full attack list with quotes: `eval/iteration-1.md`.
