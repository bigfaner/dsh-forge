# Eval-journey Final Report — mode-selection-alignment

## Eval-journey Complete
**Final Score**: 1020/1150 (target: 850)
**Iterations Used**: 1/1 (single-pass re-run post fix-2; reviser not run)

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| pre-fix run (superseded) | 816/1150 | — |
| fix-2 re-run | 1020/1150 | +204 |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 176/200 | 120 | ✅ |
| 2. Semantic Purity | 162/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 140/150 | 90 | ✅ |
| 4. Fact Alignment | 136/150 | 90 | ✅ |
| 5. Surface Fitness | 126/150 | 90 | ✅ |
| 6. Internal Consistency | 146/150 | 90 | ✅ |
| 7. Workflow Coverage | 134/150 | 90 | ✅ |
| **Total** | **1020/1150** | **975 (rubric) / 850 (config)** | ✅ |

### Outcome
**Target reached** (1020 ≥ 850; rubric condition 975 + all dimensions ≥ min also met). The previously failing **Surface Fitness (60 → 126)** is resolved: the Derived Outcomes adjudication section adjudicates validation-error (N/A for the discrete-enumeration surface with Step 3b explicitly mapped as the state-machine rejection analog — seat unload per SC1/S5 double-signal) and adapts session-expired locally via Step 2c/3c restart-continuity; the blank-lock UI form contradiction is dissolved by unifying on the SC1+S5 seat-unload wording with the out-of-scope Step 3 assertion returned to Step 3b; new Step 2c fills the blank-period restart blindspot, new Step 1c makes invariant 4 verifiable through the settings-UI toggle (row-ownership rule); inference claims carry source: inferred annotations; risk re-graded High with justification; Setup fixtures completed (existing locked session, mismatch fixtures, hero free session). This supersedes the 816/1150 failing report from the pre-fix run (fix-2). Remaining second-order deductions (async wait wording, residual mechanism parentheticals) are documented in iteration-1.md — none below threshold; safe to proceed to gen-contracts.
