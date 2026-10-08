# Eval-contract Final Report — overview-entry-new-session

## Eval-contract Complete
**Final Score**: 961/1100 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 961/1100 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 150/150 | 90 | ✅ |
| 2. Semantic Purity | 183/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 125/150 | 90 | ✅ |
| 4. Fact Alignment | 127/150 | 90 | ✅ |
| 5. Surface Fitness | 100/100 | 60 | ✅ |
| 6. Internal Consistency | 144/150 | 90 | ✅ |
| 7. Anchor Integrity | 100/100 | 60 | ✅ |
| 8. Fixture Specification | 32/100 | 60 | ❌ |
| **Total** | **961/1100** | **935 (rubric) / 850 (config)** | ❌ (dimension threshold) |

### Outcome
Config target (850) exceeded numerically and total ≥ 935, but rubric pass condition fails: **Fixture Specification 32/100 below min 60** — six task-hosting Outcomes (4b/4c/5/5b/5c/5d) declare Task fixtures with no container entity; per page-map the container pill set = features ∪ blitz proposals (taskCount > 0 JOIN), so a parentless Task renders in no pill and the asserted toolbar/detail surfaces are unreachable (generated tests would fail at fixture construction). Dual-branch mode-routing assertions under-provisioned. Single-pass mode — reviser not run.

Other findings: internal API/table names in dimension values (9 instances); zero formal fact_id citations (claims substantively accurate); two co-holdable precondition pairs; inconsistent Side-effect semantics within step-1. Blindspots: dependency-cycle fixture unconstructible via product write path (addTask DFS rejects with ERR_CYCLE_DETECTED — needs direct-seed path or legally-constructible violation form); platform-side Session fixture fields lack seeding semantics.

Full attack list (8 items) in `eval/iteration-1.md`.
