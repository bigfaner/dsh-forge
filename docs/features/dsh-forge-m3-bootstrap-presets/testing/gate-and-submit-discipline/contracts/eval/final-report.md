# Eval-contract Final Report — gate-and-submit-discipline

## Eval-contract Complete
**Final Score**: 952/1100 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 952/1100 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 147/150 | 90 | ✅ |
| 2. Semantic Purity | 182/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 120/150 | 90 | ✅ |
| 4. Fact Alignment | 121/150 | 90 | ✅ |
| 5. Surface Fitness | 78/100 | 60 | ✅ |
| 6. Internal Consistency | 142/150 | 90 | ✅ |
| 7. Anchor Integrity | 80/100 | 60 | ✅ |
| 8. Fixture Specification | 82/100 | 60 | ✅ |
| **Total** | **952/1100** | **935 (rubric) / 850 (config)** | ✅ |

### Outcome
**Target reached** (952 ≥ 935 rubric condition; all dimensions ≥ min threshold; config target 850 exceeded). Non-blocking findings for downstream awareness: step-3 overlapping precondition pair (gate-failure-fix-chain vs blocked-submit-skips-doors both true in the same failed-blocked world; settlement form unpinned); commit-convention family untraceable (no fact entry, no UNKNOWN/inferred mark — and the directly relevant M3_CORE_SKILLS_NO_GIT fact unused); step-1/2 empty page anchors despite real observation seams in the task drawer record face (td-commit/ev-verb anchor family); the only web-anchored step carries zero web observation language; pseudo-field constraints contradict facts (blocked_reason not a column per M3_SUBMIT_BLOCKED_REASON; commit_message/gate_payload not Task entity fields); invariant tense tension (commit_hash "always" vs blocked settlement silent). Blindspots: the non-conforming-commit rejection outcome has no realizable observation channel (rejection mechanism lives skill-side; submitTask carries only commit_hash); fix-chain entry is outer-loop skill behavior mixed with system hooks in one State assertion; event side-effect assertions lack the 500ms latency tolerance (M2_EVENT_PUSH_CHAIN) — flaky-test risks.

Full attack list (8 items) in `eval/iteration-1.md`.
