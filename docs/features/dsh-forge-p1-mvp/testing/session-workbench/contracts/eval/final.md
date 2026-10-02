# Eval-contract Final Report — session-workbench

## Eval-contract Complete
**Final Score**: 995/1100 (target: 850)
**Iterations Used**: 1/3

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 995 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness (完整性) | 140/150 | 90 | ✅ |
| 2. Semantic Purity (语义纯度) | 185/200 | 120 | ✅ |
| 3. Precondition Exclusivity (前置条件互斥性) | 150/150 | 90 | ✅ |
| 4. Fact Alignment (事实依据) | 115/150 | 90 | ✅ |
| 5. Surface Fitness (Surface 适配) | 90/100 | 60 | ✅ |
| 6. Internal Consistency (一致性) | 145/150 | 90 | ✅ |
| 7. Anchor Integrity (锚点完整性) | 90/100 | 60 | ✅ |
| 8. Fixture Specification (前置数据声明) | 80/100 | 60 | ✅ |

### Outcome
**Target reached** (995 ≥ 850 config target; ≥ 935 rubric pass line; all dimensions above min thresholds).

### Notable Attacks (informational — recorded in iteration-1.md)
- rail expand-range numbers contradict fact RAIL_GEOMETRY (264–420 not 240–420)
- stability policy (120s window/retries) pseudo-sourced to journey Setup
- procedural retry policy embedded in State dimension; audit-channel vocabulary in observable State
- session-expired adjudication not sunk into contract bodies; page anchor interpunct mismatch ×6 (systemic)
- DshRuntime / session_list_phase non-seedable pseudo-entities; DockTab baseline drift across steps
- return-trip actions asserted in Output but absent from Input; transient skeleton observability; zero-message Session fixture presupposition
