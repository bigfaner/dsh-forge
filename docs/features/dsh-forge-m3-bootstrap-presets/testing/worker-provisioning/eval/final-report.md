# Eval-journey Final Report — worker-provisioning

## Eval-journey Complete
**Final Score**: 844/1150 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 844/1150 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 160/200 | 120 | ✅ |
| 2. Semantic Purity | 160/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 130/150 | 90 | ✅ |
| 4. Fact Alignment | 92/150 | 90 | ✅ |
| 5. Surface Fitness | 59/150 | 90 | ❌ |
| 6. Internal Consistency | 123/150 | 90 | ✅ |
| 7. Workflow Coverage | 120/150 | 90 | ✅ |
| **Total** | **844/1150** | **975 (rubric) / 850 (config)** | ❌ |

### Outcome
Target NOT reached — 1/1 iterations exhausted (single-pass mode; reviser not run).

Primary gap: **Surface Fitness 59/150 below min 90** — `session-expired` absent (Step 1's cross-session "takes effect on next dispatch" is a natural local-adaptation site); 9/12 steps assert browser-unobservable worker internals without declaring an observation channel; `validation-error` present only as unlabeled approximation (Step 1b ⚠ placeholder + save-disabled). Secondary gaps: Fact Alignment (UF-2 content used but prd-ui-functions.md not in sources; inference annotations absent), Internal Consistency (invariant 2 unconditional phrasing contradicts Step 1b fallback), Completeness (Step 2 dispatch entry channel unspecified; Step 4 observation channel missing), Precondition Exclusivity (5c precondition always-true, indistinguishable from 5b). Blindspots: no deterministic fixture to induce autonomous-agent behaviors (blocked/overreach); config-time boundary (changed settings vs in-flight worker) silently asserted; output-token fourth field source dangling vs three-field config face.

Full attack list (12 items) in `eval/iteration-1.md`.
