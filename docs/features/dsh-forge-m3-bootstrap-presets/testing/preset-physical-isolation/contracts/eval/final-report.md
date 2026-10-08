# Eval-contract Final Report — preset-physical-isolation

## Eval-contract Complete
**Final Score**: 1010/1100 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 1010/1100 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 150/150 | 90 | ✅ |
| 2. Semantic Purity | 188/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 147/150 | 90 | ✅ |
| 4. Fact Alignment | 117/150 | 90 | ✅ |
| 5. Surface Fitness | 92/100 | 60 | ✅ |
| 6. Internal Consistency | 138/150 | 90 | ✅ |
| 7. Anchor Integrity | 80/100 | 60 | ✅ |
| 8. Fixture Specification | 98/100 | 60 | ✅ |
| **Total** | **1010/1100** | **935 (rubric) / 850 (config)** | ✅ |

### Outcome
**Target reached** (1010 ≥ 935 rubric condition; all dimensions ≥ min threshold; config target 850 exceeded — strongest of the contract suite). Non-blocking findings for downstream awareness: spec-skill enumeration asserts a complete set of 7 but the fact table/PRD/package all say 8 (eval omitted — generated test would miss eval leaking into blitz); skill-catalog carrier description contradicts the freshest source (context-injection event, not system prompt — grep-as-directed would false-fail); silent value correction (sampleOverCapGlobResults) lacks fact annotation; Step-2 State overclaims whole-product literal identity vs the documented four product forks; page-face outcomes unanchored (2b/3b vs handbook "hero 预设座位"); "not silent" half risks vacuous testing (spike S5's diagnostic face omitted). Blindspots: fault-injection realization mechanism unspecified for product-owned drafts (e2e has no fault facility); hero-seat first-boot switch undeclared for non-fresh user-data runs.

Full attack list (10 items) in `eval/iteration-1.md`.
