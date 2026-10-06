# Eval-contract Final Report — fix-chain-auto-recovery

## Eval-contract Complete
**Final Score**: 957/1100 (target: 850)
**Iterations Used**: 1/1 (single-pass mode per `eval.contract.iterations=1`)

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 957 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| Completeness | 147/150 | 90 | ✅ |
| Semantic Purity | 180/200 | 120 | ✅ |
| Precondition Exclusivity | 130/150 | 90 | ✅ |
| Fact Alignment | 124/150 | 90 | ✅ |
| Surface Fitness | 82/100 | 60 | ✅ |
| Internal Consistency | 146/150 | 90 | ✅ |
| Anchor Integrity | 76/100 | 60 | ✅ |
| Fixture Specification | 72/100 | 60 | ✅ |

### Outcome
Target reached (957 ≥ 850), all dimensions above threshold. Notable attacks: response-body literals and index names inside dimension values; step-5 disjunctive precondition unassertable; step-1~4 empty page anchors contradicting "概览即时见 blocked" observable-face claim; fixture Task min_count 1 insufficient for chain-depth scenarios (needs 6). Full attack list with quotes: `eval/iteration-1.md`.
