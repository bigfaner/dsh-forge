# Eval-journey Final Report — proposal-review-mode-transition

## Eval-journey Complete
**Final Score**: 856/1150 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 856/1150 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 142/200 | 120 | ✅ |
| 2. Semantic Purity | 165/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 125/150 | 90 | ✅ |
| 4. Fact Alignment | 92/150 | 90 | ✅ |
| 5. Surface Fitness | 74/150 | 90 | ❌ |
| 6. Internal Consistency | 131/150 | 90 | ✅ |
| 7. Workflow Coverage | 126/150 | 90 | ✅ |
| **Total** | **856/1150** | **975 (rubric) / 850 (config)** | ❌ |

### Outcome
Config target (850) reached numerically, but rubric pass condition fails: **Surface Fitness 74/150 below min 90** — `session-expired` absent without non-applicability annotation; `validation-error` present only as unlabeled approximation lacking near-field error-message assertion. Single-pass mode — reviser not run.

Secondary gaps: Fact Alignment (UI micro-assertions anchored to docs not in declared sources — ui-functions/ui-design/page-map), Completeness (Step 3 comparison baseline undefined — non-isomorphic transfers), Workflow Coverage (under-review→draft and superseded evolution chain have no exercising steps; rejected→draft loop uncovered), Semantic Purity (verification-strategy parentheticals and DB-level mechanism language in Expected Results), Internal Consistency (Step 4b fixture dangling; Step 4c/3 duplicate assertion). Blindspots: upgraded-proposal acceptance path (blitz→expedition then accepted) container-attribution semantics uncovered; mode-dialog's own empty-description validation path untested; Setup fixtures incomplete for 4b/5/3b.

Full attack list (9 items) in `eval/iteration-1.md`.
