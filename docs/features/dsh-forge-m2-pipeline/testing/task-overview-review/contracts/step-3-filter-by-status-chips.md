---
journey: "task-overview-review"
step: 3
step-action: "用七态 chips 过滤任务"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/task-overview-review/journey.md
anchors:
  web:
    page: "右栏「项目概览」tab（dswf-overview）任务子 tab 七态 chips"
    route: "dswf-overview"
    requires_auth: false
    layout: "sidebar.right.pane.tab"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: task-overview-review / Step 3: 用七态 chips 过滤任务

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — chips 为 toggle 点选（选项集封闭），无输入校验面。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "feature 绑定已选定；该 feature 下存在某状态（如 in_progress）的任务"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "taskStatus"
            value: "in_progress"
- Input: "点击某状态 chip（如 in_progress）"
- Output: "列表（及 DAG / 泳道）仅显示该 feature 该状态的任务；过滤三视图统一生效"
- State: "UI 过滤态变更（statusFilter 单选 toggle）；库无变更（服务端过滤参数）"
- Side-effect: "none"
- Invariants: "七态 chips 过滤与排序对三视图统一生效"

## Outcome "zero-count-chip-disabled"
- Preconditions: "当前 feature 下某状态任务计数为 0"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "coveredStatuses"
            value: "至少一个七态成员在该 feature 下计数为 0"
- Input: "尝试点击该状态 chip"
- Output: "chip disabled（禁用淡化，is-zero 样式），不可触发过滤；其余非零 chip 照常可用"
- State: "无变更（禁用态拦截交互）"
- Side-effect: "none"

## Journey Invariants

- 概览数据全部直读每工作区库（无第二来源、无 watch / 回流 / 快照同步模块）
- 人工转移与 agent 写入同门（core 动词 API），每次转移必带 reason 且落审计
- 七态 chips 过滤与排序对三视图统一生效
- 转移目标态所见即所得：抽屉与菜单仅列状态机允许集（allowedTransitions 纯函数，服务端同源提前校验）
- 首屏性能判据恒成立：≤2s @500 任务

## Fixture Specification

This Contract requires the following pre-existing data state. See `rules/fixture-spec.md` for schema details.

```yaml
fixture_spec:
  entities:
    - entity_type: "Project"
      min_count: 1
    - entity_type: "Feature"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Project"
    - entity_type: "Task"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Feature"
```
