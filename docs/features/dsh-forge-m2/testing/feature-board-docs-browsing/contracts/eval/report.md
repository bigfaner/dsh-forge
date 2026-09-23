# Eval-contract Final Report: feature-board-docs-browsing (contracts)

> Evaluated by `forge:eval --type contract` (T-eval-contract, 2026-09-23). Scorer = [qa] expert (single); scale 1100 / target 935 / max 3 iterations; context = `docs/business-rules/*` (auto) + surface-web rules; handbook = design/page-map.md; fact table = .forge/fact-table.json (FT-001..FT-056).

## Eval-contract Complete
**Final Score**: 1076/1100 (target: 935)
**Iterations Used**: 2/3

### Score Progression
| Iteration | Score | Delta |
|-----------|-------|-------|
| 1 | 885 | — |
| 2 | 1076 | +191 |

### Dimension Breakdown (final)

| Dimension | Iteration 1 | Iteration 2 | Threshold | Result |
|-----------|-------------|-------------|-----------|--------|
| Completeness | 150/150 | 150/150 | ≥90 | PASS |
| Semantic Purity | 142/200 | 192/200 | ≥120 | PASS |
| Precondition Exclusivity | 150/150 | 150/150 | ≥90 | PASS |
| Fact Alignment | 101/150 | 141/150 | ≥90 | PASS |
| Surface Fitness | 96/100 | 98/100 | ≥60 | PASS |
| Internal Consistency | 146/150 | 149/150 | ≥90 | PASS |
| Anchor Integrity | 100/100 | 100/100 | ≥60 | PASS |
| Fixture Specification | 0/100 | 96/100 | ≥60 | PASS |

### Outcome
**Target reached.** Iteration 1 failed on the Fixture Specification entity-completeness veto (two instances: step-1 asserted task counts with no Task entity; step-4 asserted rendered feature/slugs with no Feature entity) plus zero FT-xxx anchors family-wide and oracle-channel leakage into Output values. Revision resolved all 9 attacks: Task entity (min 3, per-feature status constraints making 计数全满/部分完成 fixture-materializable) + Feature entity under the external tree (slug 五类齐备); FT-006/030/034/036/047/051/053/054 inline anchors; oracle parentheticals (空白剥离全等/直读对拍/状态读数对拍) relocated to state_requirements; disposable-Setup parenthetical moved out of Preconditions; schema/watch/component literals (doc_location_type/doc_location_path/readFeatureDoc) restated behaviorally; 仓外文档角标 grounded in ui-design UF4 data-binding (page-map lacks it — handbook fix out of eval scope); readiness-gated determinism state_requirement for the loading window; restore mutation declared (单文档粒度) symmetric to step-5's second tree.

Residual deductions (iteration-2 report, non-blocking): 「completed 样板带完成徽标、计数全满，in-progress 样板无徽标」unanchored — matches neither page-map card anatomy (slug/状态 Pill/进度/更新时间) nor ui-design UF4, and the prototype renders a status Pill on every card; the 徽标 dichotomy risks engineering a false-failing test (align before gen-test-scripts consumes it); step-5 recovery-target tree unconstrained (no docKinds/feature-slug structure, no FT-038 forge-detection guarantee — constrain 同构五类 as step-4 does); residual mechanism vocabulary (FeatureBoardData 载入/docKinds 投影驱动/落库) in dimension values; step-3 guard legs (markdown 只读安全渲染/外链禁用) assert negatives with no oracle channel while every sibling leg declares one. 仓外角标 citation verified at ui/ui-design.md:383 (label says "Data Mapping" vs actual "data-binding" — one-word imprecision, row content exact).

Eval-skipped flag: not applicable (score parsed successfully on both iterations).
