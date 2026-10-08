# Eval-journey Final Report — gate-and-submit-discipline

## Eval-journey Complete
**Final Score**: 901/1150 (target: 850)
**Iterations Used**: 1/1

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 901/1150 | — |

### Dimension Breakdown (final)
| Dimension | Score | Min Threshold | Pass |
|-----------|-------|---------------|------|
| 1. Completeness | 170/200 | 120 | ✅ |
| 2. Semantic Purity | 183/200 | 120 | ✅ |
| 3. Precondition Exclusivity | 134/150 | 90 | ✅ |
| 4. Fact Alignment | 78/150 | 90 | ❌ |
| 5. Surface Fitness | 90/150 | 90 | ✅ (at boundary) |
| 6. Internal Consistency | 124/150 | 90 | ✅ |
| 7. Workflow Coverage | 122/150 | 90 | ✅ |
| **Total** | **901/1150** | **975 (rubric) / 850 (config)** | ❌ |

### Outcome
Config target (850) reached numerically, but rubric pass condition fails: **Fact Alignment 78/150 below min 90** — Edge 2b asserts a commit-message rejection gate that exists in no source and no code (submitTask implements only ERR_TEST_EVIDENCE_REQUIRED; commit conformance is behavioral self-correction per PRD); propagated miscitation (db-schema §6-31 is proposal↔feature FK material); invented precision on the "from 匹配" check. Total also < 975. Single-pass mode — reviser not run.

Other gaps: `session-expired` never considered despite being the suite-wide pattern (N/A annotation absent); invariant over-breadth ("submit 记录恒含 commit_hash" vs gate tasks that may not commit); happy-path discriminator unstated (Step 1 vs Edge 1b selectable only from 1b's side); declared web surface with zero browser-observable assertions despite the task-detail record timeline being a documented user-visible carrier. Blindspots: verification altitude (tool-response vs DB vs UI) undeclared per step; gate digest contents ({compile, fmt, lint, test} per db-schema) never stated — success assertion unfalsifiable in detail.

Full attack list (8 items) in `eval/iteration-1.md`.
