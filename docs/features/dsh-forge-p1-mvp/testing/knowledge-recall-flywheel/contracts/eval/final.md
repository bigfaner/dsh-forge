# Eval-contract Final Report — knowledge-recall-flywheel

## Eval-contract Complete
**Final Score**: 1008/1100 (target: 850)
**Iterations Used**: 1/3

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 1008 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness (完整性) | 145/150 | 90 | ✅ |
| 2. Semantic Purity (语义纯度) | 190/200 | 120 | ✅ |
| 3. Precondition Exclusivity (前置条件互斥性) | 140/150 | 90 | ✅ |
| 4. Fact Alignment (事实依据) | 140/150 | 90 | ✅ |
| 5. Surface Fitness (Surface 适配) | 96/100 | 60 | ✅ |
| 6. Internal Consistency (一致性) | 135/150 | 90 | ✅ |
| 7. Anchor Integrity (锚点完整性) | 95/100 | 60 | ✅ |
| 8. Fixture Specification (前置数据声明) | 67/100 | 60 | ✅ |

### Outcome
**Target reached** (1008 ≥ 850 config target; ≥ 935 rubric pass line; all dimensions above min thresholds).

### Notable Attacks (informational — recorded in iteration-1.md)
- 4e→8b state pollution (side-effect "供 8b" vs 8b precondition 1/1) — scenario isolation needed
- UsageEvent/WorkspaceDirectory non-design entity names; UsageEvent→Project FK relationship undeclared; step-4d Session entity missing
- 4d "无使用事件落库" contradicts sentinel-row fact (RECALL_LOG_RECORDED) without scope qualifier
- 4b/4c preconditions semantically equivalent, Input-only disambiguation
- capability-plane contract channel has no implementation seam; Step-5 answer-content lacks oracle (sentinel string); stability policy not lifted to journey invariant for 4e/8b
