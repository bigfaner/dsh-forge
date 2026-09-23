# Eval-journey Final Report: dual-form-consistency

> Evaluated by `forge:eval --type journey` (T-eval-journey, 2026-09-23). Scorer = [qa] expert (single); scale 1150 / target 975 / max 3 iterations; context = `docs/business-rules/*` (auto) + surface-web rules.

## Eval-journey Complete
**Final Score**: 979/1150 (target: 975)
**Iterations Used**: 1/3

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 979 | — |

### Dimension Breakdown (final)

| Dimension | Iteration 1 | Threshold | Result |
|-----------|-------------|-----------|--------|
| Completeness | 170/200 | ≥120 | PASS |
| Semantic Purity | 196/200 | ≥120 | PASS |
| Precondition Exclusivity | 139/150 | ≥90 | PASS |
| Fact Alignment | 120/150 | ≥90 | PASS |
| Surface Fitness | 96/150 | ≥90 | PASS |
| Internal Consistency | 118/150 | ≥90 | PASS |
| Workflow Coverage | 140/150 | ≥90 | PASS |

Golden Path veto: not triggered (contiguous domain-level steps traceable to PRD Stories 3/4 / SC7 双形态一致).

### Outcome
**Target reached at iteration 1** — total 979 ≥ 975 with every dimension above its threshold; no revision round consumed.

Deductions recorded (iteration-1 report, non-blocking but carried for downstream awareness — several mirror the sibling journeys' resolved patterns): required_outcomes mapping comments absent (−Surface Fitness); unannotated derived clauses ("变更逐笔回流,无丢失、无错误合并", 首次注册→启动扫描扩展); 3 of 5 edges misanchored vs true base steps; invariant 2 absolute scope vs 4b offline-window premise; out-of-browser triggers lack driving/oracle channel note; Step 1 vs 1b precondition collapse; >5s degradation edge absent; attribution hard case (挂接任务上的终端变更) unpinned; no disposable-fixture isolation in Setup.

Eval-skipped flag: not applicable (score parsed successfully).
