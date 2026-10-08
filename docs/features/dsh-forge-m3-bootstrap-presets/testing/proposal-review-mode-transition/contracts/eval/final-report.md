# Eval-contract Final Report — proposal-review-mode-transition

## Eval-contract Complete
**Final Score**: 964/1100 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 964/1100 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 142/150 | 90 | ✅ |
| 2. Semantic Purity | 188/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 140/150 | 90 | ✅ |
| 4. Fact Alignment | 100/150 | 90 | ✅ |
| 5. Surface Fitness | 94/100 | 60 | ✅ |
| 6. Internal Consistency | 145/150 | 90 | ✅ |
| 7. Anchor Integrity | 80/100 | 60 | ✅ |
| 8. Fixture Specification | 75/100 | 60 | ✅ |
| **Total** | **964/1100** | **935 (rubric) / 850 (config)** | ✅ |

### Outcome
**Target reached** (964 ≥ 935 rubric condition; all dimensions ≥ min threshold; config target 850 exceeded). Non-blocking findings for downstream awareness: UI-face outcomes claim event-log side-effects contradicted by the design's 分工边界 (logs/{slug}.jsonl = agent face; UI audit = DB); step-2 superseded preconditions insufficient (M3_SUPERSEDED_TARGET_REQUIRED mandates superseded_by payload); mode-change dialog's validation-error delegated to a different dialog whose guarantee is verdict-specific; two empty/mismatched web anchors (step-3, step-4b); `ProposalDocument` entity contradicts the rejected-table adjudication (docs = directory scan); step-5 outcome pair differentiable only via Input; event-log channel double-characterized. Blindspot: tool-face enumeration outcomes unrealizable as web e2e — should state the verification vehicle (vitest contract pin per design) or gen-test-scripts will approximate/skip the journey's strongest SC3 assertion.

Full attack list (8 items) in `eval/iteration-1.md`.
