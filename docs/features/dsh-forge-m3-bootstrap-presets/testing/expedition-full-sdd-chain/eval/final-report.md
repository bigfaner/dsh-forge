# Eval-journey Final Report — expedition-full-sdd-chain

## Eval-journey Complete
**Final Score**: 881/1150 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 881/1150 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 150/200 | 120 | ✅ |
| 2. Semantic Purity | 175/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 110/150 | 90 | ✅ |
| 4. Fact Alignment | 114/150 | 90 | ✅ |
| 5. Surface Fitness | 56/150 | 90 | ❌ |
| 6. Internal Consistency | 138/150 | 90 | ✅ |
| 7. Workflow Coverage | 138/150 | 90 | ✅ |
| **Total** | **881/1150** | **975 (rubric) / 850 (config)** | ❌ |

### Outcome
Config target (850) reached numerically, but rubric pass condition fails: **Surface Fitness 56/150 below min 90** — both Web mandatory derived Outcomes (`validation-error` + `session-expired`) absent despite UF-1 defining a ready form-validation behavior (reason required); several steps assert DB/directory state with no browser-observable surface. Single-pass mode — reviser not run.

Secondary gaps: Precondition Exclusivity (Step 6b precondition semantically identical to happy Step 6 — outcomes can both fire), Completeness (Step 3 user action is a declaration, not an action), Internal Consistency (Step 8b references a `transition` verb never triggered in this journey), Fact Alignment (no `source: inferred` annotations; UF-1 lineage source not in sources list). Blindspots: review transitions omit required inputs (reason / supersededBy) that gen-test-scripts needs; Step 1 conflates the two proposal-row SoT channels (createProposal vs scan absorption); Step 7b "dispatch continues after recovery" lacks dispatcher-liveness precondition.

Full attack list (10 items) in `eval/iteration-1.md`.
