# Eval-journey Final Report: plugin-management

> Evaluated by `forge:eval --type journey` (T-eval-journey, 2026-09-23). Scorer = [qa] expert (single); scale 1150 / target 975 / max 3 iterations; context = `docs/business-rules/*` (auto) + surface-web rules.

## Eval-journey Complete
**Final Score**: 1101/1150 (target: 975)
**Iterations Used**: 2/3

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 935 | — |
| 2 | 1101 | +166 |

### Dimension Breakdown (final)

| Dimension | Iteration 1 | Iteration 2 | Threshold | Result |
|-----------|-------------|-------------|-----------|--------|
| Completeness | 170/200 | 200/200 | ≥120 | PASS |
| Semantic Purity | 192/200 | 197/200 | ≥120 | PASS |
| Precondition Exclusivity | 132/150 | 150/150 | ≥90 | PASS |
| Fact Alignment | 93/150 | 129/150 | ≥90 | PASS |
| Surface Fitness | 68/150 | 135/150 | ≥90 | PASS |
| Internal Consistency | 148/150 | 144/150 | ≥90 | PASS |
| Workflow Coverage | 132/150 | 146/150 | ≥90 | PASS |

Golden Path veto: not triggered (5-step Story 7 sequence present in domain terms).

### Outcome
**Target reached.** Iteration 1 failed on Surface Fitness (68 < 90: zero required_outcomes mappings and inference annotations, out-of-browser assertions with no verification channel, Setup below family convention) with total 935 < 975. Revision resolved all 7 attack points: family-convention Setup (disposable fixture + isolated userData + 单实例锁探测 + 跨面断言口径: manifest sha256/overlay bytes/forge-data hash 对拍 mirroring sc6 e2e Hard Rules; ≥2 third-party fixtures making 「仅该插件」 falsifiable), Step 5 re-anchored as user action with dangling 升级/重装 clause removed (marked family-unowned), Step 1c 篡改 plugin-runtime.json edge with session-expired mapping + Interface 4 basis, Step 1b validation-error mapping + executable render-layer narrowing, Step 2/2b mutual exclusion (常规启停 vs 活跃挂接会话内在线), Step 3c confirmation-cancel edge, UF6 transitioning/重启保持 inference annotations, observability hardening across 3b/4/4b/5b.

Residual deductions (iteration-2 report, non-blocking): 3c cancel behavior unannotated; Setup omits task-with-prompt/session fixture required by 2b/5b; Step 1c browser-face under-discriminating (guard-cleanup fact not routed through Setup channel); 1b mapping comment scope vs body; channel-reference convention inconsistency (4b/1c); harness text in 4b User Action; no toggle-failure edge (BIZ-resilience-001 unreconciled — consolidate-specs candidate); thin oracles on 2b/4b/1c.

Eval-skipped flag: not applicable (score parsed successfully on both iterations).
