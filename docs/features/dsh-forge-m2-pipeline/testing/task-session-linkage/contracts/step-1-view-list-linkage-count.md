---
journey: "task-session-linkage"
step: 1
step-action: "查看任务列表副行的挂接计数"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/task-session-linkage/journey.md
anchors:
  web:
    page: "右栏「项目概览」tab（dswf-overview）任务子 tab 列表视图"
    route: "dswf-overview"
    requires_auth: false
    layout: "sidebar.right.pane.tab"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: task-session-linkage / Step 1: 查看任务列表副行的挂接计数

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication（承旅程「Derived Outcomes 裁决」节）: validation-error N/A — 本旅程全部用户动作为查看与导航点击，挂接双侧均为只读浏览面，无表单、无输入、无提交路径。session-expired N/A — 本地单人工作台，无登录态与服务端会话凭据；「会话」= dsh 对话会话（账本在 dsh 本体），挂接读面直读本地每工作区库。 -->

## Outcome "success"
- Preconditions: "一次完整派发已发生：dispatcher 主会话 claim 任务（挂接表落行）+ executor 匿名子会话 submit（审计行记执行会话 id）——两侧会话 id 相异可判；概览任务子 tab 列表视图可达"
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
      - entity_type: "TaskSessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "sessionId"
            value: "dispatcher 主会话 id"
      - entity_type: "TaskRecord"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "verbs"
            value: "claim（派发会话）+ submit（执行会话）各至少一行"
- Input: "在概览任务子 tab 列表视图查看该任务行的副行"
- Output: "副行呈现该任务的挂接计数（挂接会话数汇总——副行承重为计数，不含分型明细）"
- State: "无变更（只读浏览面，直读每工作区库）"
- Side-effect: "none"
- Invariants: "挂接数据直读每工作区库（无第二来源）"

## Journey Invariants

- 双侧展示与库记录一致：双数据源口径（挂接表行 = 派发会话；审计行 session_id = 执行会话），两类各自比对（SC6③）
- 挂接双侧为只读浏览面（不写库、不造挂接；本旅程一切 claim/submit 均为前置状态而非用户动作）
- 挂接展示随 session id 变化（无跨会话残留）
- 挂接数据直读每工作区库（无第二来源）
- 同一「任务 × 会话」挂接恒单一展示（库 UNIQUE 约束 + 读面直读映射——重领不产生重复 pill）

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
    - entity_type: "TaskSessionLink"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
    - entity_type: "TaskRecord"
      min_count: 2
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
