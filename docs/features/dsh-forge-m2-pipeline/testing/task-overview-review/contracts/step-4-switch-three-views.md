---
journey: "task-overview-review"
step: 4
step-action: "切换三视图浏览任务全貌"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/task-overview-review/journey.md
anchors:
  web:
    page: "右栏「项目概览」tab（dswf-overview）任务子 tab 三视图（列表 | DAG | 泳道）"
    route: "dswf-overview"
    requires_auth: false
    layout: "sidebar.right.pane.tab"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: task-overview-review / Step 4: 切换三视图浏览任务全貌

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 视图切换为分段控件点选，无输入面。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "feature 绑定与（可选）chips 过滤已设定；任务集含多态任务与依赖边"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Feature"
      - entity_type: "TaskEdge"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
- Input: "在列表 | DAG | 泳道三视图间切换浏览"
- Output: "列表两行布局（主行 ID + 标题 + 中文状态 tag；副行类型 / 优先级 / 前置 / 挂接）；DAG 呈现 SVG 贝塞尔连线（完成边绿）；泳道七态横向列；过滤与排序统一生效"
- State: "UI 视图态变更（view mode 本地切换，数据同源）；库无变更"
- Side-effect: "none"

## Outcome "sort-toggle-reorders-all"
- Preconditions: "列表中存在多个不同状态与创建时间的任务"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 3
        relationship_type: "belongs_to"
        parent_entity: "Feature"
        field_constraints:
          - field: "taskStatus"
            value: "多个不同状态"
          - field: "createdAt"
            value: "多个不同创建时间"
- Input: "点击排序 pill 在「活跃优先 ↔ 最新创建」间切换"
- Output: "全列表重排（活跃优先：in_progress → blocked → pending → … → completed；最新创建：created_at 降序）；排序三子 tab 共用"
- State: "UI 排序态变更（sort 参数切换，服务端排序）；库无变更"
- Side-effect: "none"
- Invariants: "七态 chips 过滤与排序对三视图统一生效"

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
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Feature"
    - entity_type: "TaskEdge"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
