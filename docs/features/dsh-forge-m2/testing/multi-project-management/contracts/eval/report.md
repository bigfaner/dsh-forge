# Eval-contract Final Report: multi-project-management (contracts)

> Evaluated by `forge:eval --type contract` (T-eval-contract, 2026-09-23). Scorer = [qa] expert (single); scale 1100 / target 935 / max 3 iterations; context = `docs/business-rules/*` (auto) + surface-web rules; handbook = design/page-map.md; fact table = .forge/fact-table.json (FT-001..FT-056).

## Eval-contract Complete
**Final Score**: 1084/1100 (target: 935)
**Iterations Used**: 2/3

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 942 | — |
| 2 | 1084 | +142 |

### Dimension Breakdown (final)

| Dimension | Iteration 1 | Iteration 2 | Threshold | Result |
|-----------|-------------|-------------|-----------|--------|
| Completeness | 150/150 | 150/150 | ≥90 | PASS |
| Semantic Purity | 180/200 | 198/200 | ≥120 | PASS |
| Precondition Exclusivity | 145/150 | 150/150 | ≥90 | PASS |
| Fact Alignment | 117/150 | 146/150 | ≥90 | PASS |
| Surface Fitness | 100/100 | 100/100 | ≥60 | PASS |
| Internal Consistency | 150/150 | 140/150 | ≥90 | PASS |
| Anchor Integrity | 100/100 | 100/100 | ≥60 | PASS |
| Fixture Specification | 0/100 | 100/100 | ≥60 | PASS |

### Outcome
**Target reached.** Iteration 1 failed on the Fixture Specification entity-completeness veto (step-4/step-5 switch/cascade assertions judged Task/Feature/挂接 data while fixture_spec declared only Project — the only zero-SessionLink family) with Fact Alignment 117 (zero FT references; facts misclassified as inferred) below-par. Revision resolved all 10 attacks: Task (min 2)/Feature/SessionLink entities declared in step-4/step-5 fixtures (switch/cascade/retention assertions non-vacuous); FT-036/037(2)(3)(5)(6)(7)/038/047/051/053 factual anchors replacing misclassified inferred annotations (zero FT → 6 anchored fact families); `code_root 规范化` marked UNKNOWN; oracle channels (文件树快照对拍/状态读数对拍) relocated to state_requirements; implementation literals (authorizeExternalDocPath/校验链序/UNIQUE(code_root)/z1200/SQLite) restated behaviorally; external-auth Outcome split (new `external-auth-declined` leg) + new `external-authorized-unreadable` leg (ERR_EXTERNAL_PATH_UNREADABLE, FT-037(5)); wizard-abandon-guard extended with cancel/stay leg; remove→re-register round trip (FT-036 槽位释放) added. Family grew 14→16 Outcomes, both new legs with explicit precondition-level mutual exclusivity.

Residual deductions (iteration-2 report, non-blocking): 重注册回环 State 断言「激活指针不变(仍指第一个项目)」作用域未限定于移除腿，与 step-3 success「active_project_id 指向新项目」+ FT-047 全量重建语义按字面互斥 (−10 Internal Consistency); 「注册即激活」主张 (step-3 success「该项目被激活并进入工作台」) 未归类且与现行代码相抵 — WorkbenchShell.tsx:378 register verb 不激活,PRD:61 为意图源，需 `source: inferred(PRD UF1)` 或新事实锚并与 step-5 口径同步 (−4 Fact Alignment). Blindspot carried: FT-037(3) 三冲突源 (existing project code_root / existing external doc path / 仓外路径等于本项目代码根目录) 只测其一，锚注释收窄了事实原文 — 补边路或显式声明范围并修正注释为全量复述。

Eval-skipped flag: not applicable (score parsed successfully on both iterations).
