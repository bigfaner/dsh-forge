---
journey: "task-session-linkage"
step: 3
step-action: "查看 dispatcher 会话头部的挂接 pill"
generated: "2026-10-07"
sources:
  - docs/features/dsh-forge-m2-pipeline/testing/task-session-linkage/journey.md
anchors:
  web:
    page: "会话头挂接 pill 行（SessionTaskPills）"
    route: ""
    requires_auth: false
    layout: "conversation.session.header.actions 槽（list 注册）"
last_anchor_sync: "2026-10-07T12:00:00+08:00"
---

# Contract: task-session-linkage / Step 3: 查看 dispatcher 会话头部的挂接 pill

<!-- gen-contracts: do not edit manually. Regenerate via /gen-contracts. -->

<!-- web-surface-required adjudication（承旅程「Derived Outcomes 裁决」节）: validation-error N/A — 只读查看面（会话头 pills），无表单。session-expired N/A — 本地单人工作台无服务端会话凭据；pill 随 dsh 会话切换即时变化（账本在 dsh 本体）。 -->

## Outcome "success"
- Preconditions: "dispatcher 主会话在场且其 id 与挂接表行 session_id 一致（该会话曾 claim 该任务）；会话头部可达"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
      - entity_type: "TaskSessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "sessionId"
            value: "dispatcher 主会话 id"
- Input: "切换到 dispatcher 主会话查看会话头部"
- Output: "头部展示挂接任务且与库中挂接行一致；pill 分型标识为派发（该会话的挂接来源 = claim 写入的挂接表行）"
- State: "无变更（sessionLinks 读面 + 事件订阅刷新）"
- Side-effect: "none"

<!-- 旅程边界（journey.md Step 3b，source: inferred 注记承旅程） -->
## Outcome "overflow-menu-beyond-two"
- Preconditions: "dispatcher 会话挂接任务数 >2（含跨任务多次 claim 累积）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 3
        relationship_type: "has_many"
        parent_entity: "Project"
      - entity_type: "TaskSessionLink"
        min_count: 3
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "sessionId"
            value: "同一 dispatcher 会话 id"
- Input: "查看会话头部 pills，并打开 +N 溢出菜单、点击其中一条挂接条目"
- Output: "≤2 个 pill 并排显示，其余以 +N 溢出菜单呈现（+N 数字 = 余量任务数）；打开菜单可见全部其余挂接任务（含分型标注）；菜单内条目点击后与 Step 4 同一导航（dock 开概览 + 任务子 tab + 选中 feature + 任务抽屉打开）"
- State: "无变更（读面 + 导航跳转）"
- Side-effect: "none"

<!-- 旅程边界（journey.md Step 3c，off-by-one 边界值） -->
## Outcome "exactly-two-inline-no-overflow"
- Preconditions: "dispatcher 会话挂接任务数恰好 =2"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 2
        relationship_type: "has_many"
        parent_entity: "Project"
      - entity_type: "TaskSessionLink"
        min_count: 2
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "sessionId"
            value: "同一 dispatcher 会话 id"
- Input: "查看会话头部 pills"
- Output: "两个 pill 并排全量展示，无 +N 溢出菜单（≤2 并排的 off-by-one 边界——恰 2 不触发溢出）"
- State: "无变更"
- Side-effect: "none"

<!-- 旅程边界（journey.md Step 3d，source: inferred 注记承旅程——schema UNIQUE(task_id, session_id) 幂等） -->
## Outcome "re-claim-dedup-single-pill"
- Preconditions: "dispatcher 会话已挂接任务 T（首 claim 已写挂接行），同会话对 T 二次 claim（幂等重入，挂接表 UNIQUE 约束不增行）"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "slug"
            value: "T"
      - entity_type: "TaskSessionLink"
        min_count: 1
        relationship_type: "belongs_to"
        parent_entity: "Task"
        field_constraints:
          - field: "uniqueness"
            value: "UNIQUE(task_id, session_id)——二次 claim 后仍 1 行"
- Input: "查看该会话头部 pills"
- Output: "任务 T 仍呈单一 pill，无重复 pill（同一「任务 × 会话」恒单一展示）"
- State: "无变更（幂等重入不产生第二挂接行）"
- Side-effect: "none"

<!-- 旅程边界（journey.md Step 3e，source: inferred 注记承旅程——事件订阅驱动即时刷新） -->
## Outcome "live-pill-on-new-claim"
- Preconditions: "dispatcher 会话头部已渲染且尚未挂接任务 X；该会话随后完成对 X 的一次 claim"
  fixture_spec:
    entities:
      - entity_type: "Project"
        min_count: 1
      - entity_type: "Task"
        min_count: 1
        field_constraints:
          - field: "slug"
            value: "X"
          - field: "linkageToRenderedSession"
            value: "claim 前为 0（会话头部无该 pill）"
    state_requirements:
      - description: "会话头部已渲染（订阅层活跃），X 的 claim 尚未发生"
        prerequisite_entity: "Task"
- Input: "停留在该会话头部观察（不切换会话、不重开页签）；该会话完成对 X 的一次 claim"
- Output: "任务 X 的 pill 在当前头部出现（事件订阅驱动的即时刷新——写入返回后单次重取即见新值，时延有界 ≤500ms）"
- State: "库新增挂接行 + claim 记录（前置动作）；UI pill 列表增 X"
- Side-effect: "写后事件推送（claim 动词侧）"

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
    - entity_type: "Task"
      min_count: 1
    - entity_type: "TaskSessionLink"
      min_count: 1
      relationship_type: "belongs_to"
      parent_entity: "Task"
```
