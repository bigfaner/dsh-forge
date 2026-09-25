---
journey: "preferences-tiered-override"
step: 4
step-action: "清除覆盖回落"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/preferences-tiered-override/journey.md
anchors:
  web:
    page: "工作台 · 项目概览(偏好面·清除入口)"
    route: "workbench/overview"
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage → PreferenceSection(覆盖 Pill + 清除入口)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: preferences-tiered-override / Step 4: 清除覆盖回落

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "目标键存在 feature 级覆盖行,且项目级有显式值(回落目标在场)"
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
        parent_entity: "Feature"
        field_constraints:
          - field: "scope"
            value: "feature"
          - field: "key"
            value: "已设覆盖的键"
      - entity_type: "PrefEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "scope"
            value: "project"
          - field: "key"
            value: "同键(项目级显式值)"
- Input: "用户点击清除 feature 级覆盖"
- Output: "生效值回落到项目级值;来源标识回到「继承自上级」"
- State: "feature 级覆盖行删除(幂等);prefs_updated 事件推送(有变更才发);生效解析链回落"
- Side-effect: "prefs_updated 事件批推"
- Invariants: "清除仅经偏好 API;幂等 no-op 不产事件"

## Outcome "roundtrip-consistency"
- Preconditions: "feature 级覆盖已清除(回落至项目级)"
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
            value: "project"
- Input: "用户重新设置同键 feature 级覆盖,再次清除"
- Output: "往返后生效值与来源标识与此前状态一致,无残留中间态"
- State: "覆盖行重设后再删;表状态与首次清除后等价(行集一致)"
- Side-effect: "prefs_updated 事件仅在实变更时发"
- Invariants: "覆盖与继承往返一致,无残留中间态"

## Journey Invariants

- 键集固定(auto.*/worktree.*/eval.*,surfaces 除外);无自由键编辑,值类型校验
- 生效解析恒为 feature > 项目 > 全局;全局层兜底
- 修改仅经内核偏好 API(单一写路径);编辑面生效值与派发链消费值同源一致
- 预合成消费时点 = 派发时;已派发会话不追溯改写(inferred)
