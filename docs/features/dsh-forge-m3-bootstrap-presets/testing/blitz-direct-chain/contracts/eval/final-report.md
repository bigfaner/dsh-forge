# Eval-contract Final Report — blitz-direct-chain

## Eval-contract Complete
**Final Score**: 982/1100 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 982/1100 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 150/150 | 90 | ✅ |
| 2. Semantic Purity | 182/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 144/150 | 90 | ✅ |
| 4. Fact Alignment | 88/150 | 90 | ❌ |
| 5. Surface Fitness | 98/100 | 60 | ✅ |
| 6. Internal Consistency | 140/150 | 90 | ✅ |
| 7. Anchor Integrity | 90/100 | 60 | ✅ |
| 8. Fixture Specification | 90/100 | 60 | ✅ |
| **Total** | **982/1100** | **935 (rubric) / 850 (config)** | ❌ (dimension threshold) |

### Outcome
Config target (850) exceeded and total ≥ 935, but rubric pass condition fails: **Fact Alignment 88/150 below min 90** — Step 1 success side-effect fabricates an event-bus claim (code-verified false: create-proposal/add-task emit only tool-error; emit points closed in index.ts — a generated test would fail 100%); spec-skill enumeration lists 6 while claiming 7 (fact table + package have 8, gen-contracts and eval omitted); Step 4 invariant overclaims commit_hash enforcement (field is optional, no enforcement door); Step 3 half-false fix-chain event side-effect (addTask has no success emit). Single-pass mode — reviser not run.

Other findings: dangling cross-reference in Step 3 adjudication (置灰 branch covered nowhere); Step 4 empty page anchor while operating on a handbook page; five outcome fixtures omit Task→Proposal container relationship; implementation coupling in dimension values (fs paths, tool return shapes). Blindspots: unobservable assertion targets in concurrency outcome (needs observer-term rephrase); loading-state never adjudicated despite async-heavy journey; blitz-session establishment route implicit for test drivers.

Full attack list (10 items) in `eval/iteration-1.md`.
