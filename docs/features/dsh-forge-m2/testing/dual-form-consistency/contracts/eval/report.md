# Eval-contract Final Report: dual-form-consistency (contracts)

> Evaluated by `forge:eval --type contract` (T-eval-contract, 2026-09-23). Scorer = [qa] expert (single); scale 1100 / target 935 / max 3 iterations; context = `docs/business-rules/*` (auto) + surface-web rules; handbook = design/page-map.md; fact table = .forge/fact-table.json.

## Eval-contract Complete
**Final Score**: 1074/1100 (target: 935)
**Iterations Used**: 2/3

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 886 | — |
| 2 | 1074 | +188 |

### Dimension Breakdown (final)

| Dimension | Iteration 1 | Iteration 2 | Threshold | Result |
|-----------|-------------|-------------|-----------|--------|
| Completeness | 140/150 | 150/150 | ≥90 | PASS |
| Semantic Purity | 184/200 | 200/200 | ≥120 | PASS |
| Precondition Exclusivity | 132/150 | 150/150 | ≥90 | PASS |
| Fact Alignment | 120/150 | 142/150 | ≥90 | PASS |
| Surface Fitness | 60/100 | 100/100 | ≥60 | PASS |
| Internal Consistency | 150/150 | 145/150 | ≥90 | PASS |
| Anchor Integrity | 100/100 | 100/100 | ≥60 | PASS |
| Fixture Specification | 0/100 | 87/100 | ≥60 | PASS |

### Outcome
**Target reached.** Iteration 1 failed on the Fixture Specification veto (step-1 [终端] 判定输入悬空 — SessionLink absent), Surface Fitness 60 (zero web required_outcomes consideration), and unannotated claims (FT-047 debounce-granularity conflict). Revision resolved all 14 attacks: SessionLink min_count-0 declarations + absence state_requirements; new perception-chain-error Outcome carrying the session-expired mapping (FT-056 sync-error + last-good 保留) and a validation-error mapped rejected leg; debounce-aware spacing pinning (>400ms trailing + 500ms batch, FT-047); 对拍维度收敛 with terminal-carried source marked UNKNOWN; FT-045/046/035 traceability; deterministic accepted/rejected 操作对配方; frozen/ended mutual exclusion + 3.x 驱动配方 (spike-1 basis); oracle channels and storage vocabulary purged from dimension values; unseedable pseudo-constraints replaced with pending 起始态.

Residual deductions (iteration-2 report, non-blocking): 「依赖」not in stub-CLI oracle output vocabulary; board-open-change 保留断言 vacuous at Task min_count 1 (needs ≥2); step-4 offline 腿 [不误标] 判定输入未钉 (needs SessionLink-0 pin); perception-chain-error Side-effect 主语未限定. Blindspots carried: 恢复腿 drivability (fault injection reversible in-test); 恢复段回流缺 5 秒界; stub-CLI 对拍同源弱化 (near-tautological vs workbench reads — declare or exclude a real forge CLI 对拍腿).

Eval-skipped flag: not applicable (score parsed successfully on both iterations).
