# Eval-contract Final Report — bootstrap-walkthrough

## Eval-contract Complete
**Final Score**: 947/1100 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 947/1100 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 146/150 | 90 | ✅ |
| 2. Semantic Purity | 178/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 110/150 | 90 | ✅ |
| 4. Fact Alignment | 124/150 | 90 | ✅ |
| 5. Surface Fitness | 87/100 | 60 | ✅ |
| 6. Internal Consistency | 142/150 | 90 | ✅ |
| 7. Anchor Integrity | 90/100 | 60 | ✅ |
| 8. Fixture Specification | 70/100 | 60 | ✅ |
| **Total** | **947/1100** | **935 (rubric) / 850 (config)** | ✅ |

### Outcome
**Target reached** (947 ≥ 935 rubric condition; all dimensions ≥ min threshold; config target 850 exceeded). Non-blocking findings for downstream awareness: S3 success preconditions satisfiable in the drift state (no-drift clause missing its own Output asserts); S1 negative trigger text overlaps success (only the unestablishable fixture field restores exclusivity); S5 success selectable while regression red; S2 event vocabulary misaligned with the fact table (task-submitted not in the logs/{slug}.jsonl set, task-worker-done omitted); unverified actor claim (feature_records actor=core); S2 empty page anchor despite direct handbook match. Fixture gaps: dangling parent entities (S2 Proposal, S3 Feature — one step from the veto); pseudo-fields on real entities (content_ready, manifest_md_present, storage, constitution_pool, WorkspaceDir); drift fixture presumes an undeclared second database. Six of thirteen outcomes describe non-browser mechanisms with no stated web verification vehicle; S3/S4 below the High-risk per-step outcome band; re-accept idempotency boundary (M3_CHAIN_GATE_EXPEDITION) untested. Blindspots: zero-manifest scan scope unpinned (vacuous-pass risk).

Full attack list (12 items) in `eval/iteration-1.md`.
