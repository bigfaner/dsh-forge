# Eval-contract Final Report — worker-provisioning

## Eval-contract Complete
**Final Score**: 890/1100 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 890/1100 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 150/150 | 90 | ✅ |
| 2. Semantic Purity | 173/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 110/150 | 90 | ✅ |
| 4. Fact Alignment | 136/150 | 90 | ✅ |
| 5. Surface Fitness | 93/100 | 60 | ✅ |
| 6. Internal Consistency | 138/150 | 90 | ✅ |
| 7. Anchor Integrity | 90/100 | 60 | ✅ |
| 8. Fixture Specification | 0/100 | 60 | ❌ |
| **Total** | **890/1100** | **935 (rubric) / 850 (config)** | ❌ |

### Outcome
Config target (850) exceeded numerically, but rubric pass condition fails on two counts: **Fixture Specification 0/100 (entity-completeness veto)** — step-2 success references a parent session but declares only WorkspaceDir+Task (Session absent); same-shaped gaps in step-3b/4/5 (WorkerSession missing while State asserts the worker tool face) and step-1 config-timing boundary (Task entity missing); relationship_type/parent_entity undeclared. Total also < 935. Single-pass mode — reviser not run.

Other findings: step-1 success vs unconfigured-placeholder precondition overlap; step-5 prefix-bifurcation dual fixtures entail the success single fixture (both outcomes selectable); systematic implementation coupling in dimension values (task_session_links, single-gate read/write, atomic-write mechanics, event field lists); only 1 of 13 outcomes carries a fact_id citation; step-4 empty page anchor with handbook present. Blindspot: deny outcome has no distinguishable observable (tool physically absent → attempted call unobservable; State assertion isomorphic with success enumeration); no retry/timeout tolerance for LLM-behavior induction steps — flaky-test generator risk; step-4 skill-catalog transcription names no carrier.

Full attack list (6 items) in `eval/iteration-1.md`.
