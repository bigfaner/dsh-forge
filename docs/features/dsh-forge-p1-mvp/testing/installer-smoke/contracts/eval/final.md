# Eval-contract Final Report — installer-smoke

## Eval-contract Complete
**Final Score**: 1094/1100 (target: 850)
**Iterations Used**: 2/3

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 915 | — |
| 2 | 1094 | +179 |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness (完整性) | 150/150 | 90 | ✅ |
| 2. Semantic Purity (语义纯度) | 194/200 | 120 | ✅ |
| 3. Precondition Exclusivity (前置条件互斥性) | 150/150 | 90 | ✅ |
| 4. Fact Alignment (事实依据) | 150/150 | 90 | ✅ |
| 5. Surface Fitness (Surface 适配) | 100/100 | 60 | ✅ |
| 6. Internal Consistency (一致性) | 150/150 | 90 | ✅ |
| 7. Anchor Integrity (锚点完整性) | 100/100 | 60 | ✅ |
| 8. Fixture Specification (前置数据声明) | 100/100 | 60 | ✅ |

### Outcome
**Target reached** (1094 ≥ 850 config target; ≥ 935 rubric pass line; all dimensions at or above thresholds).

### Revision History
- Iteration 1 (915): Fixture Specification 0/100 — veto (invented InstallerArtifact entity, missing Project). Reviser re-modeled machine states as state_requirements with abstraction annotations, entities = Project (min_count 0), pinned cold-relaunch lock semantics, added 8 fact citations + 2 UNKNOWN markings, partitioned step-2 outcome space (six pairwise-disjoint preconditions), carried session-expired N/A into contracts, quantified 180s watchdog window, declared per-outcome machine reset, made blank-send performable.
- Iteration 2 residual attacks (informational): audit-vocabulary in Output values, install-phase failure accounting + wait bound, offline-outcome execution-blocked marker, network-state in reset baseline.

## Aggregate — all 6 contract sets (T-eval-contract)

| Journey contracts | Initial | Final | Iterations |
|-------------------|---------|-------|------------|
| project-registration | 934 | 934 | 1 |
| project-registration-compensation | 960 | 960 | 1 |
| session-workbench | 995 | 995 | 1 |
| knowledge-browsing | 1006 | 1006 | 1 |
| knowledge-recall-flywheel | 1008 | 1008 | 1 |
| installer-smoke | 915 | 1094 | 2 |

All 6 sets: final ≥ 850 config target AND every dimension ≥ min threshold. Eval reports generated for all Contracts (hard AC met).
