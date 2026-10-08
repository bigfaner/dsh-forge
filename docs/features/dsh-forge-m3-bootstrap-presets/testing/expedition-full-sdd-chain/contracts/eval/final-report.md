# Eval-contract Final Report — expedition-full-sdd-chain

## Eval-contract Complete
**Final Score**: 963/1100 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 963/1100 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 145/150 | 90 | ✅ |
| 2. Semantic Purity | 185/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 127/150 | 90 | ✅ |
| 4. Fact Alignment | 88/150 | 90 | ❌ |
| 5. Surface Fitness | 98/100 | 60 | ✅ |
| 6. Internal Consistency | 145/150 | 90 | ✅ |
| 7. Anchor Integrity | 90/100 | 60 | ✅ |
| 8. Fixture Specification | 85/100 | 60 | ✅ |
| **Total** | **963/1100** | **935 (rubric) / 850 (config)** | ❌ (dimension threshold) |

### Outcome
Config target (850) exceeded and total ≥ 935, but rubric pass condition fails: **Fact Alignment 88/150 below min 90** — Steps 1/2 side-effects assert proposal-domain events that never land (code-verified: createProposal/transitionProposal emit nothing on success; the human RPC face has no jsonl sink — generated tests would fail 100%); Step 6 side-effect half-false (addTask emits nothing; the real artifact is a task_records add audit row); Step 1 enumeration omits eval (8 skills in package); Step 1 proposal-row creation channel left dual (scan channel yields NULL mode, killing Step 3's chain gate — must pin createProposal(mode) passthrough). Single-pass mode — reviser not run.

Other findings: Step 4 success vs upsert-idempotent precondition overlap (no first-occurrence qualifier); Step 3 empty page anchor despite operating on a handbook page; Step 2 pseudo-field relation instead of relationship_type/superseded_by; Step 7 fixture lacks the depends_on edge its Output presupposes. Blindspots: no termination oracle for the dispatch loop (pool-snapshot verdicts / dispatch-button-grey are ready-made); superseded-evolution's cross-entity consequences untested; chain-atomicity fault_injection names no realization seam.

Full attack list (10 items) in `eval/iteration-1.md`.
