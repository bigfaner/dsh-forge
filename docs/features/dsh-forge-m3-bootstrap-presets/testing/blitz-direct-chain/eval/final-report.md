# Eval-journey Final Report — blitz-direct-chain

## Eval-journey Complete
**Final Score**: 866/1150 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 866/1150 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 144/200 | 120 | ✅ |
| 2. Semantic Purity | 153/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 132/150 | 90 | ✅ |
| 4. Fact Alignment | 92/150 | 90 | ✅ |
| 5. Surface Fitness | 69/150 | 90 | ❌ |
| 6. Internal Consistency | 140/150 | 90 | ✅ |
| 7. Workflow Coverage | 136/150 | 90 | ✅ |
| **Total** | **866/1150** | **975 (rubric) / 850 (config)** | ❌ |

### Outcome
Config target (850) reached numerically, but rubric pass condition fails: **Surface Fitness 69/150 below min 90** (`session-expired` absent, `validation-error` only as unlabeled tool-level approximation) and total < 975. Single-pass mode — reviser not run.

Secondary gaps: Fact Alignment (Edge 2b asserts a dispatch guard not present in source docs; inference-annotation mechanism absent), Completeness (Step 5 verification channel dangling), Semantic Purity (DB-level/file-system checks in user actions; mechanism terms embedded in Expected Results), Precondition Exclusivity (Edge 3b bundles two exit outcomes under one precondition). Blindspots: chain-interruption/restart semantics uncovered; user-side invalid-input boundary absent; "就绪" (ready) semantics undefined for dispatch assertion.

Full attack list (10 items) in `eval/iteration-1.md`.
