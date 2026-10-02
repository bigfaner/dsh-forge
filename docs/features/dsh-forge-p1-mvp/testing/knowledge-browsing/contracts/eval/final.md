# Eval-contract Final Report — knowledge-browsing

## Eval-contract Complete
**Final Score**: 1006/1100 (target: 850)
**Iterations Used**: 1/3

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 1006 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness (完整性) | 145/150 | 90 | ✅ |
| 2. Semantic Purity (语义纯度) | 188/200 | 120 | ✅ |
| 3. Precondition Exclusivity (前置条件互斥性) | 131/150 | 90 | ✅ |
| 4. Fact Alignment (事实依据) | 135/150 | 90 | ✅ |
| 5. Surface Fitness (Surface 适配) | 96/100 | 60 | ✅ |
| 6. Internal Consistency (一致性) | 144/150 | 90 | ✅ |
| 7. Anchor Integrity (锚点完整性) | 95/100 | 60 | ✅ |
| 8. Fixture Specification (前置数据声明) | 72/100 | 60 | ✅ |

### Outcome
**Target reached** (1006 ≥ 850 config target; ≥ 935 rubric pass line; all dimensions above min thresholds).

### Notable Attacks (informational — recorded in iteration-1.md)
- step-2 outcome pair distinguishable only via Input (preconditions semantically equivalent)
- UsageEvent non-design entity name + missing →Project relation; cold-cache KnowledgeEntry not in entities
- page anchor interpunct mismatch (route exact); subtree inference under-marked (facts exist)
- session-expired adjudication not sunk into contracts; drawer stale-entry error path uncovered
- Esc/button close dual-choice unparameterized; clear-entry affordances untested; zero-heat badge default unasserted
