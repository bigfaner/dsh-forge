# Eval-journey Final Report — bootstrap-walkthrough

## Eval-journey Complete
**Final Score**: 860/1150 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 860/1150 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 144/200 | 120 | ✅ |
| 2. Semantic Purity | 170/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 126/150 | 90 | ✅ |
| 4. Fact Alignment | 114/150 | 90 | ✅ |
| 5. Surface Fitness | 52/150 | 90 | ❌ |
| 6. Internal Consistency | 134/150 | 90 | ✅ |
| 7. Workflow Coverage | 120/150 | 90 | ✅ |
| **Total** | **860/1150** | **975 (rubric) / 850 (config)** | ❌ |

### Outcome
Config target (850) reached numerically, but rubric pass condition fails: **Surface Fitness 52/150 below min 90** — both Web mandatory derived Outcomes absent with no N/A note, even though Step 1's review transition is the UF-1 dialog whose empty-reason rejection is a specified validation-error contract, and the milestone-scale multi-session walkthrough is the natural session-expiry host. Single-pass mode — reviser not run.

Secondary gaps: Internal Consistency (dangling cross-step reference — Step 3 audits a task pool no step or Setup establishes; breakdown-tasks never appears), Completeness (Step 2 is an umbrella macro-action folding weeks of development; verification channels for Steps 3/5 unspecified), Precondition Exclusivity (Edge 1b literally names the happy-path Setup state), Semantic Purity (test-result vocabulary — "断言红" etc. — pervades Expected Results), Fact Alignment (zero `source: inferred` annotations on derived edges), Workflow Coverage (Overview's "业务流程三" claim only half honored — SDD middle omitted). Blindspots: review-transition mandatory input (reason) omitted; dispatcher-completion precondition missing before the 100%-入库 audit (app has zero orchestration per BIZ-product-008); verification altitude undeclared per step.

Full attack list (10 items) in `eval/iteration-1.md`.
