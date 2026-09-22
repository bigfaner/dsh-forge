---
journey: "spike-conclusion-fallback"
step: 3
step-action: "实测项③ inject 依赖边以非官方包为声明方的语义"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/journey.md
skip_eval: true
state-verification: full
---

# Contract: spike-conclusion-fallback / Step 3: 实测项③ inject 依赖边以非官方包为声明方的语义

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "两组 inject 声明素材就绪:最小稳定子集(ui-slots / ui-chat / ui-renderer 核心槽)与 ui-goal 全集(上游实测 7 边)对照;hello-world(非官方包)可作为声明方;报告两栏结构就位"
  fixture_spec:
    entities:
      - entity_type: "InjectDeclarationSet"
        min_count: 2
        field_constraints:
          - field: "variant"
            value: "minimal stable subset (locale/ui-chat/ui-renderer) and ui-goal full set (7 edges), one each"
      - entity_type: "PluginPackage"
        min_count: 1
        field_constraints:
          - field: "declarant_kind"
            value: "non-official package (@dsh-forge/plugin-hello-world)"
- Input: "以 hello-world(非官方包)为声明方,用最小稳定子集与 ui-goal 全集两组 inject 声明对照实测"
- Output: "结论落档:非官方声明方的完整语义(合法/等价性/限制);独立退路按 DSH Studio 第三方插件既有声明形态调整,同栏落档"
- State: "spike 报告项③条目形成(两栏齐备,两对照组结论分列)"
- Side-effect: "spike 报告文档更新"
- Invariants: "结论须区分「子集等价」与「非官方声明方可行性」两个独立维度"

## Outcome "subset-illegal"
<!-- source: journey edge case 3b -->
- Preconditions: "最小稳定子集的 inject 声明被上游机制拒绝或不等价于 ui-goal 全集行为"
  fixture_spec:
    entities:
      - entity_type: "InjectDeclarationSet"
        min_count: 2
        field_constraints:
          - field: "subset_status"
            value: "rejected by the upstream mechanism or not equivalent to the full-set behavior"
- Input: "落档对照结论并切换声明形态复测"
- Output: "退回 ui-goal 全集(7 边)声明照常工作;结论明确区分「子集非法」与「非官方声明方不可行」,防止误读扩大返工面;「只选稳定基座」原则不受影响"
- State: "spike 报告记录子集非法证据 + 全集回退结论;返工面不扩大"
- Side-effect: "none"

## Journey Invariants

- 三项未验证项每项都以「结论 + 独立退路」两栏落档,退路按项独立、不得互相挪用
- spike 操作只在抛弃型 scratch profile/环境上进行,不污染产品自身的 userData 状态与既有 profile
- 报告内联的源码级事实锚定唯一权威 checkout(SHA c36ba648 / 0.1.6-alpha.2),不传递依赖 Draft 文档现状
- spike 结论(含推翻假设的修正路线)先于 M2 UI 插件设计落档——无结论不开工
- 分发形态结论与离线自足 NFR 兼容性声明同报告落档,二者不可拆分
