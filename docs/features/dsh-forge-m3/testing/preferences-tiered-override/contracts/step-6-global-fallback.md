---
journey: "preferences-tiered-override"
step: 6
step-action: "全局兜底"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/preferences-tiered-override/journey.md
anchors:
  web:
    page: "工作台 · 项目概览(偏好面·层级回落链)"
    route: "workbench/overview"
    requires_auth: false
    layout: "WorkbenchShell → OverviewPage → PreferenceSection"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: preferences-tiered-override / Step 6: 全局兜底

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "目标键的项目级与 feature 级覆盖均已清除(或从未设置);全局级有显式值或注册表默认值"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "PrefEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "scope"
            value: "global"
          - field: "key"
            value: "目标键"
    state_requirements:
      - description: "同键的 project 级与 feature 级行均不存在(已清除)"
        prerequisite_entity: "Project"
- Input: "用户依次清除项目级与 feature 级覆盖后查看生效值"
- Output: "生效值 = 全局值;全局层作为兜底恒有值,项目/feature 级无值时继承链仍完整"
- State: "三级解析走至 global 行(或注册表权威默认 source=default);无值键(如 worktree.* 无默认)呈现空值语义"
- Side-effect: "prefs_updated 事件仅在实删除时发"
- Invariants: "全局层兜底;继承链完整"

## Journey Invariants

- 键集固定(auto.*/worktree.*/eval.*,surfaces 除外);无自由键编辑,值类型校验
- 生效解析恒为 feature > 项目 > 全局;全局层兜底
- 修改仅经内核偏好 API(单一写路径);编辑面生效值与派发链消费值同源一致
- 预合成消费时点 = 派发时;已派发会话不追溯改写(inferred)
