---
journey: "spike-conclusion-fallback"
step: 5
step-action: "复核报告并门控 M2 设计"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/journey.md
skip_eval: true
state-verification: full
---

# Contract: spike-conclusion-fallback / Step 5: 复核报告并门控 M2 设计

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "spike 报告草稿存在且覆盖三项 + 分发结论;报告模板的两栏结构与事实内联规则已知;引用基线钉在技术方向文档 git 提交版 6f5b109(2026-09-21)"
  fixture_spec:
    entities:
      - entity_type: "SpikeReport"
        min_count: 1
        field_constraints:
          - field: "coverage"
            value: "three probe items + distribution conclusion + offline compatibility statement drafted"
      - entity_type: "TechDirectionDoc"
        min_count: 1
        field_constraints:
          - field: "reference_baseline_commit"
            value: "6f5b109 (2026-09-21)"
- Input: "复核 spike 报告:三项各按「结论 + 独立退路」两栏齐备、源码级事实已内联、分发结论与兼容性声明在位;将报告作为 M2 设计的门控输入"
- Output: "报告完整可门控——任一结论推翻假设时,M2 设计采用修正路线/退路;无「结论缺失或单栏」的带病开工路径"
- State: "M2 设计的门控输入就位;报告状态从草稿转为可门控"
- Side-effect: "门控决策记录落档"
- Invariants: "spike 结论先于 M2 UI 插件设计落档——无结论不开工"

## Outcome "doc-drift"
<!-- source: journey edge case 5b -->
- Preconditions: "技术方向文档(Draft 状态)在引用基线 6f5b109 之后被修订,事实基漂移"
  fixture_spec:
    entities:
      - entity_type: "TechDirectionDoc"
        min_count: 1
        field_constraints:
          - field: "revision_state"
            value: "revised after reference baseline 6f5b109, Draft status"
      - entity_type: "SpikeReport"
        min_count: 1
- Input: "复核报告中的事实内联情况"
- Output: "报告内联的事实锚定 checkout SHA c36ba648 自足成立,不传递依赖文档现状;修订记录触发引用处复核的机制被确认,spike 结论不受文档漂移波及"
- State: "报告自足性确认;漂移不影响已落档结论"
- Side-effect: "none"

## Journey Invariants

- 三项未验证项每项都以「结论 + 独立退路」两栏落档,退路按项独立、不得互相挪用
- spike 操作只在抛弃型 scratch profile/环境上进行,不污染产品自身的 userData 状态与既有 profile
- 报告内联的源码级事实锚定唯一权威 checkout(SHA c36ba648 / 0.1.6-alpha.2),不传递依赖 Draft 文档现状
- spike 结论(含推翻假设的修正路线)先于 M2 UI 插件设计落档——无结论不开工
- 分发形态结论与离线自足 NFR 兼容性声明同报告落档,二者不可拆分
