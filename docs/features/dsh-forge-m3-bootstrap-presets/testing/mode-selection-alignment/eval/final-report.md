# Eval-journey Final Report — mode-selection-alignment

## Eval-journey Complete
**Final Score**: 816/1150 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 816/1150 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 133/200 | 120 | ✅ |
| 2. Semantic Purity | 160/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 125/150 | 90 | ✅ |
| 4. Fact Alignment | 95/150 | 90 | ✅ |
| 5. Surface Fitness | 60/150 | 90 | ❌ |
| 6. Internal Consistency | 118/150 | 90 | ✅ |
| 7. Workflow Coverage | 125/150 | 90 | ✅ |
| **Total** | **816/1150** | **975 (rubric) / 850 (config)** | ❌ |

### Outcome
Target NOT reached — 1/1 iterations exhausted (single-pass mode, `eval.journey.iterations = 1`; reviser not run).

Primary gap: **Surface Fitness 60/150 (below min 90)** — Web mandatory derived Outcomes (`validation-error` + `session-expired`) absent without an explicit non-applicability note. Secondary gaps: Fact Alignment (unlabeled inferences posing as facts; blank-lock UI form contradicts spike/PRD evidence), Completeness (Step 5 action not executable), Internal Consistency (Step 3 expected-result overreach; Step 5b undeclared third session), Workflow Coverage (invariant 4 untestable — no step toggles the hero switch via settings UI).

Full attack list (8 items) in `eval/iteration-1.md`.
