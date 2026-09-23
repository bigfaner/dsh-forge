---
journey: "feature-board-docs-browsing"
step: 2
step-action: "查看 feature 状态机"
generated: "2026-09-23"
sources:
  - docs/features/dsh-forge-m2/testing/feature-board-docs-browsing/journey.md

anchors:
  web:
    page: "workbench/features"
    route: ""
    requires_auth: false
    layout: "WorkbenchShell → FeaturesPage → FeatureDetail 子视图(workbench/features/:slug;StatusStepper + DocTabs)"

last_anchor_sync: "2026-09-23T01:18:11Z"
---

# Contract: feature-board-docs-browsing / Step 2: 查看 feature 状态机

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

## Outcome "success"
- Preconditions: "feature 看板已加载双 feature 样板(completed 五类齐备 / in-progress 缺 ui 类可选文档)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "status"
            value: "completed 与 in-progress 各一个"
          - field: "docKinds"
            value: "completed 五类齐备;in-progress 缺 ui 类(单类缺席实例,可确定实例化)"
- Input: "依次点击 completed 样板与 in-progress 样板 feature"
- Output: "completed 样板状态机显示 completed,in-progress 样板显示 in-progress(forge manifest 词表透传,五态全称标签,FT-034);进入 feature 详情/文档目录:五类 tab 恒在,按该 feature 实际文档类启用、缺类禁用不隐藏(FT-054)"
- State: "feature 详情子视图打开(视图键 = feature slug 段,FT-053 子视图寻址);docKinds 投影驱动 tab 启停(FT-054);状态 stepper 呈现对应态"
- Side-effect: "none(只读)"
- Invariants: "缺类文档 tab = 禁用而非隐藏;状态词表与 forge manifest 一致"

## Journey Invariants

- 全部过程文档为只读渲染:不提供任何编辑入口;外链不离开应用
- feature 列表与状态机展示与 forge 数据一致(状态为 forge manifest 词表透传;校验通道见 Setup)
- 仓外与仓内文档格式一致、浏览功能等价(同一渲染面 + 同一对比口径,见 Setup)

## Fixture Specification

本 Contract 各 Outcome 的 fixture 实体并集(逐 Outcome 明细见各 Preconditions 内 fixture_spec):

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Feature"
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Project"
```
