---
journey: "preferences-tiered-override"
step: 2
step-action: "查看三级值与生效解析"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/preferences-tiered-override/journey.md
anchors:
  web:
    page: "工作台 · 项目概览(偏好面·层级 segmented + 键行)"
    route: "workbench/overview"
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage → PreferenceSection(继承/覆盖 Pill)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: preferences-tiered-override / Step 2: 查看三级值与生效解析

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "一个布尔键(如 auto.test.quick)在三级各设不同值(全局/项目/feature 三行显式在场)"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "PrefEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "scope"
            value: "global"
          - field: "key"
            value: "auto.test.quick"
      - entity_type: "PrefEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "scope"
            value: "project"
          - field: "key"
            value: "auto.test.quick"
      - entity_type: "PrefEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "scope"
            value: "feature"
          - field: "key"
            value: "auto.test.quick"
- Input: "用户选择三级已设不同值的键查看"
- Output: "三级值分别可见;生效值 = feature 级值(feature > 项目 > 全局覆盖正确);覆盖来源标识可辨(「本级覆盖」/「继承自上级」)"
- State: "生效解析沿链下探,首个显式行即生效值;查询级覆盖位与本地值同面呈现"
- Side-effect: "none"
- Invariants: "生效解析恒为 feature > 项目 > 全局"

## Journey Invariants

- 键集固定(auto.*/worktree.*/eval.*,surfaces 除外);无自由键编辑,值类型校验
- 生效解析恒为 feature > 项目 > 全局;全局层兜底
- 修改仅经内核偏好 API(单一写路径);编辑面生效值与派发链消费值同源一致
- 预合成消费时点 = 派发时;已派发会话不追溯改写(inferred)
