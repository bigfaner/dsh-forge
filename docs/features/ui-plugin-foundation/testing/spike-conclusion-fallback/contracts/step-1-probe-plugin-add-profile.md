---
journey: "spike-conclusion-fallback"
step: 1
step-action: "实测项① plugin add 对壳 profile 目录的行为"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/journey.md
skip_eval: true
state-verification: full
---

# Contract: spike-conclusion-fallback / Step 1: 实测项① plugin add 对壳 profile 目录的行为

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "抛弃型 scratch 环境就绪:可复制的壳 userData profile 目录、可重建的 dsh web profile;上游本地 checkout SHA c36ba648(0.1.6-alpha.2)为唯一权威源;spike 报告模板含「结论 + 独立退路」两栏结构"
  fixture_spec:
    entities:
      - entity_type: "ScratchShellProfile"
        min_count: 1
        field_constraints:
          - field: "disposability"
            value: "throwaway copy of shell userData profile dir"
      - entity_type: "ScratchDshWebProfile"
        min_count: 1
        field_constraints:
          - field: "disposability"
            value: "rebuildable"
      - entity_type: "SpikeReport"
        min_count: 1
        field_constraints:
          - field: "template"
            value: "conclusion + independent fallback two-column structure"
    state_requirements:
      - description: "upstream local checkout SHA c36ba648 (0.1.6-alpha.2) available as the sole authoritative source"
        prerequisite_entity: "SpikeReport"
- Input: "在 scratch 壳环境的 userData profile 目录上实测 dsh plugin add(对照官方 dsh web profile 上的行为)"
- Output: "结论落档:对壳自有 profile 目录可用/受限/不可用(以源码级或实测证据);结论与独立退路(若推翻假设 = 内置 bundle 清单路线,独立于 plugin add)同栏落档"
- State: "spike 报告项①条目形成(两栏齐备);scratch 环境用后即弃,不污染产品自身 userData"
- Side-effect: "spike 报告文档更新"
- Invariants: "spike 操作只在抛弃型 scratch profile/环境上进行"

## Outcome "assumption-overturned"
<!-- source: journey edge case 1b -->
- Preconditions: "实测发现 dsh plugin add 无法寻址/写入壳自有 profile 目录(项①被推翻)"
  fixture_spec:
    entities:
      - entity_type: "ScratchShellProfile"
        min_count: 1
        field_constraints:
          - field: "plugin_add_addressability"
            value: "cannot address or write the shell-owned profile dir"
      - entity_type: "SpikeReport"
        min_count: 1
- Input: "按两栏结构落档并核对退路独立性"
- Output: "退路①内置 bundle 清单路线被采用且独立可用(不依赖 plugin add 恢复);退路不得从 ②/③ 挪用(npm 发布/tarball 与声明形态调整均不构成 ① 的退路);M2 设计按退路①推进"
- State: "spike 报告记录推翻证据 + 独立退路;M2 设计输入切换到退路①"
- Side-effect: "none"

## Journey Invariants

- 三项未验证项每项都以「结论 + 独立退路」两栏落档,退路按项独立、不得互相挪用
- spike 操作只在抛弃型 scratch profile/环境上进行,不污染产品自身的 userData 状态与既有 profile
- 报告内联的源码级事实锚定唯一权威 checkout(SHA c36ba648 / 0.1.6-alpha.2),不传递依赖 Draft 文档现状
- spike 结论(含推翻假设的修正路线)先于 M2 UI 插件设计落档——无结论不开工
- 分发形态结论与离线自足 NFR 兼容性声明同报告落档,二者不可拆分
