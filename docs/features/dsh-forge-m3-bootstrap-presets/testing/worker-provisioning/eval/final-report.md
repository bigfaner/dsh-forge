# Eval-journey Final Report — worker-provisioning

## Eval-journey Complete
**Final Score**: 999/1150 (target: 850)
**Iterations Used**: 1/1 (single-pass re-run post fix-2; reviser not run)

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| pre-fix run (superseded) | 844/1150 | — |
| fix-2 re-run | 999/1150 | +155 |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 178/200 | 120 | ✅ |
| 2. Semantic Purity | 158/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 136/150 | 90 | ✅ |
| 4. Fact Alignment | 140/150 | 90 | ✅ |
| 5. Surface Fitness | 120/150 | 90 | ✅ |
| 6. Internal Consistency | 141/150 | 90 | ✅ |
| 7. Workflow Coverage | 126/150 | 90 | ✅ |
| **Total** | **999/1150** | **975 (rubric) / 850 (config)** | ✅ |

### Outcome
**Target reached** (999 ≥ 850; rubric condition 975 + all dimensions ≥ min also met). The previously failing **Surface Fitness (59 → 120)** is resolved: the Derived Outcomes adjudication section maps validation-error to Step 1b as the native web-form carrier (required-missing → save disabled + placeholder notice) and adapts session-expired locally via Step 1d config-timeliness (in-flight worker keeps old tier, next spawn uses new); the dual-half carrying declaration (Journey half = settings/dispatch-entry/timeline; Contract half = worker internal-state assertions) with per-step observation channels replaces the undeclared 9/12 browser-unobservable state; the dispatch entry is specified (toolbar dispatch button / in-session run-tasks — both converge into the same dispatcher loop); invariant 2 is qualified with the Step 1b fallback; controllable fixtures (AC-gate-blocked task, privilege-instruction task) make the autonomous-agent steps deterministic; the output-token three-vs-four tension is dissolved via flow-4 item 3; UF-2 and the 3.9 record are closed into sources. This supersedes the 844/1150 failing report from the pre-fix run (fix-2). Remaining minor deductions (matrix baseline pinning, 3b criteria layering — topic-inherent non-browser assertion mass) are documented in iteration-1.md — none below threshold; safe to proceed to gen-contracts.
