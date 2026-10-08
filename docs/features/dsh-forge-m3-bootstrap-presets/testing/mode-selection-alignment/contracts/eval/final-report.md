# Eval-contract Final Report — mode-selection-alignment

## Eval-contract Complete
**Final Score**: 972/1100 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 972/1100 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 150/150 | 90 | ✅ |
| 2. Semantic Purity | 185/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 125/150 | 90 | ✅ |
| 4. Fact Alignment | 130/150 | 90 | ✅ |
| 5. Surface Fitness | 100/100 | 60 | ✅ |
| 6. Internal Consistency | 110/150 | 90 | ✅ |
| 7. Anchor Integrity | 100/100 | 60 | ✅ |
| 8. Fixture Specification | 72/100 | 60 | ✅ |
| **Total** | **972/1100** | **935 (rubric) / 850 (config)** | ✅ |

### Outcome
**Target reached** (972 ≥ 935 rubric condition; all dimensions ≥ min threshold; config target 850 exceeded). Non-blocking findings for downstream awareness: step-5 fixture declares the mirror scenario (hero expedition session) instead of the journey's established blitz session — asserted mismatch Output unachievable under declared fixture (vacuous-pass risk); step-2/3 fixture_specs omit gating entities (UiSettingsRow/PresetRow) their Preconditions reference; zero formal fact_id citations (claims verified sound against code); two ambiguous precondition pairs (step-1 pair, step-5 pair); internal API names (agentPreset.select, boot overlay) inside dimension values; journey's observation-channel annotations not carried into contracts; hero-switch-off "行缺席" OR-branch internally unrealizable; restart outcomes leave harness ordering implicit.

Full attack list (9 items) in `eval/iteration-1.md`.
