# Eval-contract Final Report — task-session-linkage

## Eval-contract Complete
**Final Score**: 913/1100 (target: 850)
**Iterations Used**: 1/1 (single-pass mode per `eval.contract.iterations=1`)

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 913 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| Completeness | 150/150 | 90 | ✅ |
| Semantic Purity | 186/200 | 120 | ✅ |
| Precondition Exclusivity | 90/150 | 90 | ✅ (at threshold) |
| Fact Alignment | 122/150 | 90 | ✅ |
| Surface Fitness | 100/100 | 60 | ✅ |
| Internal Consistency | 103/150 | 90 | ✅ |
| Anchor Integrity | 100/100 | 60 | ✅ |
| Fixture Specification | 62/100 | 60 | ✅ (at threshold) |

### Outcome
Target reached (913 ≥ 850), all dimensions at or above threshold. Precondition Exclusivity at exactly 90: Step 3 success precondition is simultaneously satisfiable with 3 boundary Outcomes (overflow, exactly-two, re-claim dedup) — needs pinning to 挂接数=1 且无重领历史. Notable fact-alignment issue: dispatcher's own claim record never modeled (dual-source ambiguity in "单一 pill" oracle); overflow-menu-content assertion misaligned with shipped behavior (menu includes inline pills). Full attack list with quotes: `eval/iteration-1.md`.
