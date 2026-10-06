---
journey: "task-overview-review"
step: 1
step-action: "打开项目概览页签"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/task-overview-review/journey.md
anchors:
  web:
    page: "右栏「项目概览」tab（dswf-overview）"
    route: "dswf-overview"
    requires_auth: false
    layout: "sidebar.right.pane.tab（dock tab 注册制，开始页 guide 入口卡排最前）"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: task-overview-review / Step 1: 打开项目概览页签

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 页签打开动作，无表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "已注册工作区，其每工作区任务库中有某 feature 的多态任务（覆盖多个状态）；开始页可达（或会话头挂接 pill 在场）"
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
        field_constraints:
          - field: "taskStatus"
            value: "覆盖多个不同状态（多态）"
- Input: "单人开发者点击 dock 开始页「项目概览」入口卡（或会话头挂接 pill）"
- Output: "dock 原位开出概览 tab；ov-head 呈现项目名 + 状态摘要一行（默认折叠）"
- State: "UI 导航态变更（dock tab 开出）；库无变更（数据直读）"
- Side-effect: "none"

## Outcome "stress-500-first-screen-under-2s"
- Preconditions: "概览首屏含 500 条任务的压力数据集"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Feature"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Project"
      - entity_type: "Task"
        min_count: 500
        relationship_type: "belongs_to"
        parent_entity: "Feature"
- Input: "打开概览页签"
- Output: "首屏呈现 ≤2s（机械判据）；列表无 watch / 回流 / 快照同步模块（代码审计 0 个）"
- State: "无变更（直读路径；EQP 索引命中：idx_tasks_feature_status）"
- Side-effect: "none"
- Invariants: "首屏性能判据恒成立：≤2s @500 任务"

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
```
