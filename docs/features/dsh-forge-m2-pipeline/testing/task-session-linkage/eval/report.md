# Eval-journey Final Report — task-session-linkage

## Eval-journey Complete
**Final Score**: 846/1150 (target: 850)
**Iterations Used**: 1/1 (single-pass mode per `eval.journey.iterations=1`)

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 846 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| Completeness | 156/200 | 120 | ✅ |
| Semantic Purity | 169/200 | 120 | ✅ |
| Precondition Exclusivity | 117/150 | 90 | ✅ |
| Fact Alignment | 94/150 | 90 | ✅ |
| Surface Fitness | 64/150 | 90 | ❌ |
| Internal Consistency | 132/150 | 90 | ✅ |
| Workflow Coverage | 114/150 | 90 | ✅ |

### Outcome
**Target NOT reached** (846 < 850, single iteration — no revise pass per config). Lowest-scoring journey of the set. Below-threshold dimension: **Surface Fitness 64/150** — journey contains no form/input/error path so neither web-mandatory derived outcome nor reasoned N/A exists. Key fact-alignment issues: Step 1 conflates list sub-row vs drawer payloads; 执行-side pill asserted but never exercised. Full attack list with quotes: `eval/iteration-1.md`.
