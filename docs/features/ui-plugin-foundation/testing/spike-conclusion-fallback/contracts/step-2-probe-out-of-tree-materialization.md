---
journey: "spike-conclusion-fallback"
step: 2
step-action: "实测项② out-of-tree bundle 的物化解析"
generated: "2026-09-22"
sources:
  - docs/features/ui-plugin-foundation/testing/spike-conclusion-fallback/journey.md
skip_eval: true
state-verification: full
---

# Contract: spike-conclusion-fallback / Step 2: 实测项② out-of-tree bundle 的物化解析

> **Note**: Contracts generated without eval-journey verification (SKIP_EVAL_GATE=true). Review with extra scrutiny.

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "scratch profile 环境可用;hello-world 插件可构建产物(含 dev link: 与 prod tarball 两种形态);报告两栏结构就位"
  fixture_spec:
    entities:
      - entity_type: "ScratchDshWebProfile"
        min_count: 1
      - entity_type: "PluginArtifact"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "ScratchDshWebProfile"
        field_constraints:
          - field: "form"
            value: "dev link: form and prod tarball form, one each"
- Input: "实测 profile node_modules 物化对 out-of-tree bundle 的解析细节(dev link: 与 prod tarball 两种形态各验一次)"
- Output: "结论落档:两种形态的解析行为(成功路径与边界)分别记录;独立退路 = npm 发布或 tarball 随包内置(两锚解析不构成 ② 的退路,单独注明)"
- State: "spike 报告项②条目形成(两栏齐备,两形态结论分列)"
- Side-effect: "spike 报告文档更新"
- Invariants: "退路按项独立,不从 ①/③ 挪用"

## Outcome "materialization-failed"
<!-- source: journey edge case 2b -->
- Preconditions: "profile node_modules 物化对 out-of-tree bundle 解析失败(dev link: 与 prod tarball 均不可用或行为不一致)"
  fixture_spec:
    entities:
      - entity_type: "ScratchDshWebProfile"
        min_count: 1
        field_constraints:
          - field: "materialization_outcome"
            value: "both dev link: and prod tarball fail or diverge"
      - entity_type: "PluginArtifact"
        min_count: 2
- Input: "落档失败证据与退路"
- Output: "退路②npm 发布或 tarball 随包内置(以打包产物为物化通道)被采用;两锚解析结论单独归档不被误用为 ② 的退路;返工面收敛在 hello-world,不波及 M2 任务面"
- State: "spike 报告记录失败证据 + 退路②;M2 任务面不受波及"
- Side-effect: "none"

## Journey Invariants

- 三项未验证项每项都以「结论 + 独立退路」两栏落档,退路按项独立、不得互相挪用
- spike 操作只在抛弃型 scratch profile/环境上进行,不污染产品自身的 userData 状态与既有 profile
- 报告内联的源码级事实锚定唯一权威 checkout(SHA c36ba648 / 0.1.6-alpha.2),不传递依赖 Draft 文档现状
- spike 结论(含推翻假设的修正路线)先于 M2 UI 插件设计落档——无结论不开工
- 分发形态结论与离线自足 NFR 兼容性声明同报告落档,二者不可拆分
