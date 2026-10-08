# Eval-journey Final Report — preset-physical-isolation

## Eval-journey Complete
**Final Score**: 815/1150 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 815/1150 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 146/200 | 120 | ✅ |
| 2. Semantic Purity | 153/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 134/150 | 90 | ✅ |
| 4. Fact Alignment | 91/150 | 90 | ✅ |
| 5. Surface Fitness | 40/150 | 90 | ❌ |
| 6. Internal Consistency | 135/150 | 90 | ✅ |
| 7. Workflow Coverage | 116/150 | 90 | ✅ |
| **Total** | **815/1150** | **975 (rubric) / 850 (config)** | ❌ |

### Outcome
Target NOT reached — 1/1 iterations exhausted (single-pass mode; reviser not run).

Primary gap: **Surface Fitness 40/150 (lowest of the suite, below min 90)** — Web mandatory derived Outcomes (`validation-error` + `session-expired`) both absent without non-applicability annotation; 0/6 steps browser-observable (file-system/YAML introspection declared on a web surface) — each step needs an observation-channel declaration and the journey must account for the Contract half of the 50/50 strategy. Secondary gaps: Fact Alignment (inference annotation mechanism absent; "no silent degradation" is unclassified reasoning), Completeness (the "等" (etc.) in "write-prd 等规格技能全集" not expanded to SC2's precise list; enumeration channel undeclared; no fault-injection procedure in Setup for 2b/3b). Blindspots: absence-assertions lack positive controls (empty skill enumeration passes vacuously — spike S6-3 ships a probe, the journey doesn't); fault-injected broken state coexists with continuous boot re-materialization — injection timing/recovery undesigned; upstream diff baseline lacks version pinning in Setup.

Full attack list (7 items) in `eval/iteration-1.md`.
