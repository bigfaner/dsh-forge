---
journey: "preferences-tiered-override"
step: 5
step-action: "派发链消费生效值断言"
generated: "2026-09-25"
sources:
  - docs/features/dsh-forge-m3/testing/preferences-tiered-override/journey.md
anchors:
  web:
    page: "工作台 · 任务看板(派发)→ 偏好面(生效值对照)"
    route: "workbench/tasks"
    requires_auth: false
    layout: "WorkbenchShell → TaskBoardPage(派发链)+ OverviewPage PreferenceSection(对照面)"
last_anchor_sync: "2026-09-25T00:59:32Z"
---

# Contract: preferences-tiered-override / Step 5: 派发链消费生效值断言

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->
<!-- state-verification: full -->

## Outcome "success"
- Preconditions: "任一层级偏好已修改并保存;存在可派发任务;预合成系统提示词经测试通道可直读"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "status"
            value: "pending"
          - field: "task_type"
            value: "可测类型键(coding.* 之类,消费覆盖策略)"
      - entity_type: "PrefEntry"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "key"
            value: "coverage.<task-type> 或其他生效键"
          - field: "value"
            value: "已修改后的最新值"
- Input: "用户修改任一层级偏好后派发一个任务,经测试通道断言预合成系统提示词"
- Output: "生效偏好反映修改后的最终生效值(断言);编辑面呈现的生效值与派发消费值一致"
- State: "预合成三要素之「生效偏好」= 派发时点三级解析产物(与编辑面同源实现)"
- Side-effect: "subagent 会话创建与预合成注入"
- Invariants: "编辑面生效值与派发链消费值同源一致"

## Outcome "no-retroactive-rewrite"
<!-- source: inferred:预合成发生于派发时点,已启动 subagent 的系统提示词不再改写 -->
- Preconditions: "存在偏好修改前已派发的 subagent"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
        field_constraints:
          - field: "data_authority"
            value: "sqlite"
      - entity_type: "Dispatch"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
        field_constraints:
          - field: "state"
            value: "running"
          - field: "dispatchedAt"
            value: "偏好修改前"
- Input: "用户对比修改前后派发的两个 subagent 系统提示词"
- Output: "已派发 subagent 的提示词不被追溯改写;仅新派发消费新生效值"
- State: "既有派发行 prompt_hash 不变;新派发行 hash 反映新值"
- Side-effect: "none"
- Invariants: "预合成消费时点 = 派发时;已派发会话不追溯改写"

## Journey Invariants

- 键集固定(auto.*/worktree.*/eval.*,surfaces 除外);无自由键编辑,值类型校验
- 生效解析恒为 feature > 项目 > 全局;全局层兜底
- 修改仅经内核偏好 API(单一写路径);编辑面生效值与派发链消费值同源一致
- 预合成消费时点 = 派发时;已派发会话不追溯改写(inferred)
