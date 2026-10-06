---
journey: "fix-chain-auto-recovery"
step: 5
step-action: "概览三视图与依赖守卫即时反映"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/fix-chain-auto-recovery/journey.md
anchors:
  web:
    page: "右栏「项目概览」tab（dswf-overview）任务子 tab 三视图"
    route: "dswf-overview"
    requires_auth: false
    layout: "sidebar.right.pane.tab"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: fix-chain-auto-recovery / Step 5: 概览三视图与依赖守卫即时反映

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication: validation-error N/A — 只读浏览面（三视图查看），无表单。session-expired N/A — 本地单人工作台无服务端会话凭据。 -->

## Outcome "success"
- Preconditions: "fix 链已完整发生（fix 任务终态 + 源任务已恢复 pending 或保持 blocked——按 Step 4 结果）；概览 tab 可达"
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
          - field: "roles"
            value: "fix F = completed；源 X = 恢复后的 pending（或未恢复的 blocked）"
      - entity_type: "TaskEdge"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "origin"
            value: "fix-chain（X 依赖 F）"
      - entity_type: "TaskRecord"
        min_count: 3
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "verbs"
            value: "含 auto-block 与 auto-restore（或按实际路径）"
- Input: "开发者查看概览任务列表 / DAG / 泳道"
- Output: "fix 链关系（fix 任务、依赖边、源任务恢复后状态）在写入返回后单次重取即见；DAG 视图呈现源→fix 依赖边（SVG 贝塞尔连线）"
- State: "UI 读态刷新（事件订阅 + 交互重取；数据直读每工作区库）；库无变更"
- Side-effect: "none"

## Journey Invariants

- fix 链三件套原子性：fix 任务行 + 依赖边 + 源任务置 blocked 于单事务完成，任一失败全部不落
- task_edges 恒无环：成环写入必被拒绝且回报完整环路径
- 依赖终态守卫满足集恒为 {completed, skipped}，恢复判定与领取判定同源
- 自动恢复只改状态不删边（verb='auto-restore' 审计在场，边保留）
- fix 链深度 ≤6：超限拒绝并提示人工介入

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
      field_constraints:
        - field: "origin"
          value: "fix-chain"
    - entity_type: "TaskRecord"
      min_count: 3
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
